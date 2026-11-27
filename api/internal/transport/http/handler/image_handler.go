package handler

import (
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// ImageHandler handles GET /api/image?url=... for safe cover image fetching.
type ImageHandler struct {
	service ports.ImageProxyService
	logger  *slog.Logger
}

// NewImageHandler creates an ImageHandler with an injected ImageProxyService.
func NewImageHandler(service ports.ImageProxyService, logger *slog.Logger) *ImageHandler {
	return &ImageHandler{service: service, logger: logger}
}

// Get validates url and streams image bytes with restrictive headers.
func (h *ImageHandler) Get(c *gin.Context) {
	targetURL := strings.TrimSpace(c.Query("url"))
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Informe a URL da imagem."})
		return
	}

	body, contentType, err := h.service.FetchImage(c.Request.Context(), targetURL)
	if err != nil {
		status, msg := domain.StatusFromError(err, "Não foi possível carregar a imagem.")
		if status >= 500 && h.logger != nil {
			h.logger.Error("image proxy failed", "error", err)
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	defer body.Close()

	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "private, max-age=3600")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Status(http.StatusOK)

	buf := make([]byte, 32*1024)
	_, _ = io.CopyBuffer(c.Writer, body, buf)
}

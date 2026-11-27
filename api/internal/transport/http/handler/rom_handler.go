package handler

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// RomHandler handles compact RO1 reference resolution and download endpoints.
type RomHandler struct {
	service ports.RomCodeService
	logger  *slog.Logger
}

// NewRomHandler creates a RomHandler with an injected RomCodeService.
func NewRomHandler(service ports.RomCodeService, logger *slog.Logger) *RomHandler {
	return &RomHandler{service: service, logger: logger}
}

// Get decodes an RO1 code instantly, or resolves live game/file details when resolve=1|true.
func (h *RomHandler) Get(c *gin.Context) {
	code := c.Param("code")
	resolveFlag := c.Query("resolve")
	if resolveFlag == "1" || resolveFlag == "true" {
		resolved, err := h.service.Resolve(c.Request.Context(), code)
		if err != nil {
			status, msg := domain.StatusFromError(err, "Não foi possível resolver este código de ROM.")
			if status >= 500 && h.logger != nil {
				h.logger.Error("rom code resolve failed", "error", err)
			}
			c.JSON(status, gin.H{"error": msg})
			return
		}
		c.JSON(http.StatusOK, resolved)
		return
	}

	ref, err := h.service.Decode(code)
	if err != nil {
		status, msg := domain.StatusFromError(err, "Código de ROM inválido.")
		c.JSON(status, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusOK, ref)
}

// Download streams the exact ROM file referenced by an RO1 code, supporting HTTP Range resumption.
func (h *RomHandler) Download(c *gin.Context) {
	code := c.Param("code")
	rangeHeader := c.GetHeader("Range")
	stream, err := h.service.OpenDownload(c.Request.Context(), code, rangeHeader)
	if err != nil {
		status, msg := domain.StatusFromError(err, "Não foi possível preparar o download deste código de ROM.")
		if status >= 500 && h.logger != nil {
			h.logger.Error("rom code download failed", "error", err)
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	defer stream.Body.Close()
	streamDownload(c, stream, rangeHeader != "")
}

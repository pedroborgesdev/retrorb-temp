package handler

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// ConsoleHandler handles GET /api/consoles.
type ConsoleHandler struct {
	service ports.ConsoleService
	logger  *slog.Logger
}

// NewConsoleHandler creates a ConsoleHandler with an injected ConsoleService.
func NewConsoleHandler(service ports.ConsoleService, logger *slog.Logger) *ConsoleHandler {
	return &ConsoleHandler{service: service, logger: logger}
}

// List returns the validated definitive console catalog.
func (h *ConsoleHandler) List(c *gin.Context) {
	catalog, err := h.service.ListConsoles(c.Request.Context())
	if err != nil {
		status, msg := domain.StatusFromError(err, "Não foi possível carregar o catálogo de consoles.")
		if h.logger != nil {
			h.logger.Error("console catalog unavailable", "error", err)
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusOK, catalog)
}

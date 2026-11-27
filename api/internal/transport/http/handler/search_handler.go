package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// SearchHandler handles GET /api/search.
type SearchHandler struct {
	service ports.SearchService
	logger  *slog.Logger
}

// NewSearchHandler creates a SearchHandler with an injected SearchService.
func NewSearchHandler(service ports.SearchService, logger *slog.Logger) *SearchHandler {
	return &SearchHandler{service: service, logger: logger}
}

// Search queries global or console-filtered game catalogs.
func (h *SearchHandler) Search(c *gin.Context) {
	page := 1
	if rawPage, hasPage := c.GetQuery("page"); hasPage {
		parsed, err := strconv.Atoi(rawPage)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Página inválida."})
			return
		}
		page = parsed
	}

	var source *string
	if rawSource, hasSource := c.GetQuery("source"); hasSource {
		source = &rawSource
	}

	req := domain.ConsoleQuery{
		Query:       c.Query("q"),
		ConsoleName: c.Query("console"),
		Source:      source,
		Page:        page,
	}

	result, err := h.service.Search(c.Request.Context(), req)
	if err != nil {
		status, msg := domain.StatusFromError(err, "Não foi possível realizar a pesquisa.")
		if status >= 500 && h.logger != nil {
			h.logger.Error("search failed", "error", err)
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusOK, result)
}

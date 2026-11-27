package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// GameHandler handles GET /api/game (both JSON and progressive SSE streaming).
type GameHandler struct {
	service ports.GameService
	logger  *slog.Logger
}

// NewGameHandler creates a GameHandler with an injected GameService.
func NewGameHandler(service ports.GameService, logger *slog.Logger) *GameHandler {
	return &GameHandler{service: service, logger: logger}
}

// Get fetches and normalizes details for a single game page.
// When the client accepts text/event-stream (or passes stream=1), progressive stages are streamed via SSE.
func (h *GameHandler) Get(c *gin.Context) {
	source := c.Query("source")
	gameURL := c.Query("url")

	wantsStream := strings.Contains(c.GetHeader("Accept"), "text/event-stream") || c.Query("stream") == "1"
	if !wantsStream {
		resp, err := h.service.GetDetails(c.Request.Context(), source, gameURL)
		if err != nil {
			status, msg := domain.StatusFromError(err, "Não foi possível carregar este jogo. Tente novamente.")
			if status >= 500 && h.logger != nil {
				h.logger.Error("game details failed", "source", source, "error", err)
			}
			c.JSON(status, gin.H{"error": msg})
			return
		}
		c.JSON(http.StatusOK, resp)
		return
	}

	var writeMu sync.Mutex
	headersWritten := false
	writeEvent := func(event string, payload any) {
		writeMu.Lock()
		defer writeMu.Unlock()
		if !headersWritten {
			c.Header("Content-Type", "text/event-stream; charset=utf-8")
			c.Header("Cache-Control", "no-cache, no-transform")
			c.Header("Connection", "keep-alive")
			c.Header("X-Accel-Buffering", "no")
			c.Status(http.StatusOK)
			headersWritten = true
		}
		encoded, err := json.Marshal(payload)
		if err != nil {
			return
		}
		_, _ = fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, encoded)
		c.Writer.Flush()
	}

	_, err := h.service.StreamDetails(c.Request.Context(), source, gameURL, func(stage string, resp domain.GameResponse) {
		writeEvent(stage, resp)
	})
	if err != nil {
		status, msg := domain.StatusFromError(err, "Não foi possível carregar este jogo. Tente novamente.")
		if status >= 500 && h.logger != nil {
			h.logger.Error("game details stream failed", "source", source, "error", err)
		}
		if !headersWritten {
			c.JSON(status, gin.H{"error": msg})
			return
		}
		writeEvent("error", gin.H{"error": msg})
	}
}

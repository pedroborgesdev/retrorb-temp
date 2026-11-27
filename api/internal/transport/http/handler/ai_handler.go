package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// AIHandler handles POST /api/ai/describe.
type AIHandler struct {
	service ports.AIService
	logger  *slog.Logger
}

// NewAIHandler creates an AIHandler with an injected AIService.
func NewAIHandler(service ports.AIService, logger *slog.Logger) *AIHandler {
	return &AIHandler{service: service, logger: logger}
}

// Describe validates the JSON request body and delegates AI description generation.
func (h *AIHandler) Describe(c *gin.Context) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Corpo da requisição inválido."})
		return
	}

	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Corpo da requisição inválido."})
		return
	}
	payload, ok := decoded.(map[string]any)
	if !ok || payload == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Corpo da requisição inválido."})
		return
	}

	apiKey, ok := optionalStringField(payload, "api_key")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Chave do Hugging Face inválida."})
		return
	}
	title, ok := optionalStringField(payload, "title")
	if !ok || title == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Informe o título do jogo para gerar a descrição."})
		return
	}
	model, ok := optionalStringField(payload, "model")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Modelo do Hugging Face inválido."})
		return
	}
	consoleName, ok := optionalStringField(payload, "console")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Plataforma inválida."})
		return
	}
	sourceDescription, ok := optionalStringField(payload, "source_description")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Descrição da fonte inválida."})
		return
	}

	req := domain.DescribeRequest{
		HeaderToken:       c.GetHeader("X-HF-Token"),
		APIKey:            apiKey,
		Model:             model,
		Title:             title,
		Console:           consoleName,
		SourceDescription: sourceDescription,
	}

	resp, err := h.service.DescribeGame(c.Request.Context(), req)
	if err != nil {
		status, msg := domain.StatusFromError(err, "Não foi possível gerar a descrição com IA.")
		if status >= 500 && h.logger != nil {
			h.logger.Error("ai description failed", "error", err)
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func optionalStringField(payload map[string]any, key string) (*string, bool) {
	val, exists := payload[key]
	if !exists || val == nil {
		return nil, true
	}
	s, ok := val.(string)
	if !ok {
		return nil, false
	}
	return &s, true
}

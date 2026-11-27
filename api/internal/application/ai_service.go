package application

import (
	"context"
	"strings"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// AIService enforces input/token validation before delegating description generation.
type AIService struct {
	client         ports.AIClient
	defaultHFToken string
}

// NewAIService constructs an AIService with an injected AIClient and fallback server token.
func NewAIService(client ports.AIClient, defaultHFToken string) *AIService {
	return &AIService{
		client:         client,
		defaultHFToken: strings.TrimSpace(defaultHFToken),
	}
}

// DescribeGame resolves token precedence (header > body > env) and generates a game description.
func (s *AIService) DescribeGame(ctx context.Context, req domain.DescribeRequest) (domain.DescribeResponse, error) {
	var bodyToken string
	if req.APIKey != nil {
		bodyToken = *req.APIKey
	}

	apiKey := ""
	for _, candidate := range []string{req.HeaderToken, bodyToken, s.defaultHFToken} {
		if trimmed := strings.TrimSpace(candidate); trimmed != "" {
			apiKey = trimmed
			break
		}
	}
	if apiKey == "" {
		return domain.DescribeResponse{}, domain.BadRequest("Configure sua chave do Hugging Face em Configurações → IA para gerar descrições.")
	}

	if req.Title == nil || strings.TrimSpace(*req.Title) == "" {
		return domain.DescribeResponse{}, domain.BadRequest("Informe o título do jogo para gerar a descrição.")
	}

	return s.client.GenerateDescription(ctx, apiKey, req.Model, *req.Title, req.Console, req.SourceDescription)
}

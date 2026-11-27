package huggingface

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

const (
	// DefaultModel is the default Hugging Face model used for AI game descriptions.
	DefaultModel = "openai/gpt-oss-120b"
	// ChatCompletionsURL is the OpenAI-compatible Hugging Face Inference Router endpoint.
	ChatCompletionsURL = "https://router.huggingface.co/v1/chat/completions"
	// RequestTimeout is the upstream inference timeout matching the backend SLA.
	RequestTimeout = 60 * time.Second
	// MaxTokens provides room for reasoning models before completing Markdown output.
	MaxTokens = 4096
)

var (
	modelIDPattern     = regexp.MustCompile(`^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(?::[A-Za-z0-9._-]+)?$`)
	thinkBlockPattern  = regexp.MustCompile(`(?is)<think>.*?</think>`)
	unclosedThinkRe    = regexp.MustCompile(`(?is)<think>.*$`)
	sentinelLeadingRe  = regexp.MustCompile("^[" + "\\s`\"'*_" + "]+")
	sentinelTrailingRe = regexp.MustCompile("[" + "\\s`\"'*_.!" + "]+$")
)

// ChatMessage is an OpenAI-compatible chat message payload.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Client implements ports.AIClient using Hugging Face Inference Router.
type Client struct {
	httpClient ports.HTTPDoer
	endpoint   string
}

// NewClient constructs a Hugging Face AI client. If httpClient is nil, a safe client
// with RequestTimeout and disabled redirects is created.
func NewClient(httpClient ports.HTTPDoer) *Client {
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: RequestTimeout,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return &Client{
		httpClient: httpClient,
		endpoint:   ChatCompletionsURL,
	}
}

// NormalizeModel validates and normalizes the requested Hugging Face model ID.
func NormalizeModel(value *string) (string, error) {
	if value == nil {
		return DefaultModel, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return DefaultModel, nil
	}
	if len(trimmed) > 160 || !modelIDPattern.MatchString(trimmed) {
		return "", domain.BadRequest("Modelo do Hugging Face inválido. Use o formato organizacao/modelo.")
	}
	return trimmed, nil
}

// BuildGameDescriptionMessages constructs the 3-stage anti-hallucination prompt in PT-BR.
func BuildGameDescriptionMessages(title string, console *string, sourceDescription *string) []ChatMessage {
	systemPrompt := strings.Join([]string{
		"Você é um editor especializado em preservação e catalogação de jogos retrô.",
		"Sua tarefa é escrever uma descrição editorial envolvente, clara e precisa em português do Brasil.",
		"",
		"ETAPA 1 — VALIDAÇÃO SILENCIOSA DO CONTEXTO DA FONTE:",
		"- O usuário pode enviar uma descrição vinda da fonte original como contexto opcional.",
		"- Antes de escrever, avalie internamente se esse texto da fonte realmente pertence ao jogo e à plataforma informados.",
		"- Se fizer sentido com o título e a plataforma, utilize-o como contexto confiável.",
		"- Se NÃO fizer sentido (estiver falando de outro jogo, outra franquia, texto genérico de site ou informação desconexa), " +
			"IGNORE-O COMPLETAMENTE e NUNCA mencione, insinue ou comente na resposta que a descrição da fonte estava errada, " +
			"divergente ou foi descartada.",
		"",
		"ETAPA 2 — DECISÃO DE CONFIABILIDADE (REGRA DO `false`):",
		"- NUNCA invente enredo, personagens, datas, desenvolvedora, publicadora, mecânicas ou modos de jogo.",
		"- Se o jogo for desconhecido/obscuro para você E não houver contexto válido da fonte compatível com o título " +
			"(ou seja, você não consegue chegar a uma conclusão confiável sobre o que é o jogo), responda EXCLUSIVAMENTE com " +
			"`false` (exatamente a palavra false em minúsculas, sem aspas, sem pontuação, sem Markdown e sem texto adicional).",
		"",
		"ETAPA 3 — FORMATO DA DESCRIÇÃO (MARKDOWN, QUANDO HOUVER DADOS CONFIÁVEIS):",
		"- Foque na premissa, jogabilidade, estilo/gênero e destaques desse título nessa plataforma.",
		"- NÃO liste nem repita ficha técnica (não escreva campos como `Título:`, `Console:`, `Publicadora:`, " +
			"`Lançamento:`, `Regiões:`, `Fonte do catálogo:` ou listas de regiões).",
		"- Responda SOMENTE em Markdown válido e limpo (sem HTML bruto e sem blocos de código).",
		"- Não comece com título `#` repetindo o nome do jogo.",
		"- Use subtítulos curtos com `###` (por exemplo, `### Visão geral`, `### Jogabilidade` ou `### Destaques`), " +
			"parágrafos curtos e listas `- **Tópico**: detalhe` quando ajudar.",
		"- Mantenha o texto conciso (cerca de 140 a 260 palavras).",
	}, "\n")

	cleanTitle := strings.TrimSpace(title)
	cleanConsole := ""
	if console != nil {
		cleanConsole = strings.TrimSpace(*console)
	}

	var userParts []string
	if cleanConsole != "" {
		userParts = append(userParts, fmt.Sprintf(`Jogo: "%s" | Plataforma: %s.`, cleanTitle, cleanConsole))
	} else {
		userParts = append(userParts, fmt.Sprintf(`Jogo: "%s".`, cleanTitle))
	}

	if sourceDescription != nil && strings.TrimSpace(*sourceDescription) != "" {
		excerpt := truncateRunes(strings.TrimSpace(*sourceDescription), 3000)
		userParts = append(userParts,
			"Descrição opcional da fonte (use apenas se corresponder ao jogo acima; caso não corresponda, "+
				"ignore em silêncio sem mencionar):\n"+excerpt)
	}

	return []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: strings.Join(userParts, "\n\n")},
	}
}

// GenerateDescription requests a Markdown description (or inconclusive sentinel) from Hugging Face.
func (c *Client) GenerateDescription(
	ctx context.Context,
	apiKey string,
	model *string,
	title string,
	console *string,
	sourceDescription *string,
) (domain.DescribeResponse, error) {
	token := strings.TrimSpace(apiKey)
	if token == "" {
		return domain.DescribeResponse{}, domain.BadRequest("Configure sua chave do Hugging Face em Configurações → IA para gerar descrições.")
	}
	for i := 0; i < len(token); i++ {
		if token[i] < 32 || token[i] == 127 {
			return domain.DescribeResponse{}, domain.BadRequest("Chave do Hugging Face inválida.")
		}
	}

	cleanTitle := strings.TrimSpace(title)
	if cleanTitle == "" || utf8.RuneCountInString(cleanTitle) > 300 {
		return domain.DescribeResponse{}, domain.BadRequest("Informe um título válido para gerar a descrição.")
	}

	resolvedModel, err := NormalizeModel(model)
	if err != nil {
		return domain.DescribeResponse{}, err
	}

	reqBody := map[string]any{
		"model":       resolvedModel,
		"messages":    BuildGameDescriptionMessages(cleanTitle, console, sourceDescription),
		"temperature": 0.3,
		"max_tokens":  MaxTokens,
	}
	encoded, err := json.Marshal(reqBody)
	if err != nil {
		return domain.DescribeResponse{}, domain.BadGateway("Não foi possível preparar a requisição para o Hugging Face.", err)
	}

	reqCtx, cancel := context.WithTimeout(ctx, RequestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, c.endpoint, bytes.NewReader(encoded))
	if err != nil {
		return domain.DescribeResponse{}, domain.BadGateway("Não foi possível conectar ao Hugging Face.", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if isTimeoutErr(err) {
			return domain.DescribeResponse{}, domain.GatewayTimeout("O modelo do Hugging Face demorou para responder. Tente novamente.", err)
		}
		return domain.DescribeResponse{}, domain.BadGateway("Não foi possível conectar ao Hugging Face.", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return domain.DescribeResponse{}, domain.NewAppError(resp.StatusCode, "Chave do Hugging Face inválida ou sem permissão para inferência.", nil)
	}
	if resp.StatusCode == http.StatusPaymentRequired {
		return domain.DescribeResponse{}, domain.NewAppError(http.StatusPaymentRequired, "Créditos ou cota de inferência do Hugging Face esgotados.", nil)
	}
	if resp.StatusCode == http.StatusNotFound {
		return domain.DescribeResponse{}, domain.NotFound("Modelo não encontrado ou indisponível no provedor de inferência.")
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return domain.DescribeResponse{}, domain.NewAppError(http.StatusTooManyRequests, "Limite de requisições no Hugging Face atingido. Aguarde e tente novamente.", nil)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return domain.DescribeResponse{}, domain.BadGateway(fmt.Sprintf("A inferência do Hugging Face falhou (HTTP %d).", resp.StatusCode), nil)
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return domain.DescribeResponse{}, domain.BadGateway("O Hugging Face retornou uma resposta inválida.", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		return domain.DescribeResponse{}, domain.BadGateway("O Hugging Face retornou uma resposta inválida.", err)
	}

	content, err := extractContent(payload)
	if err != nil {
		return domain.DescribeResponse{}, err
	}
	if isNoInfoSentinel(content) {
		return domain.DescribeResponse{
			Available:   false,
			Description: nil,
			Model:       resolvedModel,
		}, nil
	}
	return domain.DescribeResponse{
		Available:   true,
		Description: &content,
		Model:       resolvedModel,
	}, nil
}

func extractContent(payload map[string]any) (string, error) {
	if payload == nil {
		return "", domain.BadGateway("O Hugging Face retornou uma resposta inválida.", nil)
	}
	rawChoices, ok := payload["choices"].([]any)
	if !ok || len(rawChoices) == 0 {
		return "", domain.BadGateway("O modelo não retornou sugestões de descrição.", nil)
	}
	first, ok := rawChoices[0].(map[string]any)
	if !ok {
		return "", domain.BadGateway("O modelo não retornou sugestões de descrição.", nil)
	}
	if reason, _ := first["finish_reason"].(string); reason == "length" {
		return "", domain.BadGateway("A descrição gerada foi interrompida antes de concluir. Tente novamente.", nil)
	}
	message, ok := first["message"].(map[string]any)
	if !ok {
		return "", domain.BadGateway("O modelo retornou uma resposta vazia.", nil)
	}

	var text string
	switch content := message["content"].(type) {
	case string:
		text = content
	case []any:
		fragments := make([]string, 0, len(content))
		for _, part := range content {
			partObj, ok := part.(map[string]any)
			if !ok {
				continue
			}
			if kind, _ := partObj["type"].(string); kind == "text" {
				if frag, _ := partObj["text"].(string); frag != "" {
					fragments = append(fragments, frag)
				}
			}
		}
		text = strings.Join(fragments, "\n")
	}

	cleaned := thinkBlockPattern.ReplaceAllString(text, "")
	cleaned = strings.TrimSpace(unclosedThinkRe.ReplaceAllString(cleaned, ""))
	if cleaned == "" {
		return "", domain.BadGateway("O modelo retornou uma resposta vazia.", nil)
	}
	return cleaned, nil
}

func isNoInfoSentinel(text string) bool {
	stripped := sentinelLeadingRe.ReplaceAllString(text, "")
	stripped = sentinelTrailingRe.ReplaceAllString(stripped, "")
	return strings.ToLower(stripped) == "false"
}

func truncateRunes(s string, max int) string {
	count := 0
	for idx := range s {
		if count == max {
			return s[:idx]
		}
		count++
	}
	return s
}

func isTimeoutErr(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

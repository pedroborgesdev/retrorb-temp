package huggingface

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"retromancy/api/internal/domain"
)

type doerFunc func(*http.Request) (*http.Response, error)

func (f doerFunc) Do(req *http.Request) (*http.Response, error) { return f(req) }

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "timed out" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

func TestNormalizeModel(t *testing.T) {
	for _, empty := range []*string{nil, strPtr(""), strPtr("   ")} {
		got, err := NormalizeModel(empty)
		if err != nil || got != DefaultModel {
			t.Fatalf("NormalizeModel(%v) = (%q, %v), want %q", empty, got, err, DefaultModel)
		}
	}

	for _, valid := range []string{"openai/gpt-oss-120b:cerebras", "meta-llama/Llama-3.3-70B-Instruct"} {
		got, err := NormalizeModel(&valid)
		if err != nil || got != valid {
			t.Fatalf("NormalizeModel(%q) = (%q, %v)", valid, got, err)
		}
	}

	for _, invalid := range []string{"gpt-oss", "openai/", "/model", "openai/model with space", "http://evil/x"} {
		if _, err := NormalizeModel(&invalid); err == nil {
			t.Errorf("expected error for invalid model %q", invalid)
		}
	}
}

func TestBuildGameDescriptionMessages(t *testing.T) {
	msgs := BuildGameDescriptionMessages("Pokemon FireRed Version", strPtr("Game Boy Advance"), strPtr("Remake clássico de Kanto."))
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	sys := msgs[0].Content
	usr := msgs[1].Content
	for _, needle := range []string{"NUNCA mencione, insinue ou comente", "`false`", "NUNCA invente", "NÃO liste nem repita ficha técnica", "Markdown"} {
		if !strings.Contains(sys, needle) {
			t.Errorf("system prompt missing %q", needle)
		}
	}
	for _, needle := range []string{"Pokemon FireRed Version", "Game Boy Advance", "Remake clássico de Kanto."} {
		if !strings.Contains(usr, needle) {
			t.Errorf("user prompt missing %q", needle)
		}
	}

	withoutSource := BuildGameDescriptionMessages("Pokemon FireRed Version", strPtr("Game Boy Advance"), nil)
	if strings.Contains(withoutSource[1].Content, "Descrição opcional da fonte") {
		t.Fatal("expected optional source section to be omitted when nil")
	}
}

func TestGenerateDescription_SuccessAndThinkStrip(t *testing.T) {
	var seenURL, seenAuth string
	var seenBody map[string]any

	client := NewClient(doerFunc(func(req *http.Request) (*http.Response, error) {
		seenURL = req.URL.String()
		seenAuth = req.Header.Get("Authorization")
		raw, _ := io.ReadAll(req.Body)
		_ = json.Unmarshal(raw, &seenBody)
		return &http.Response{
			StatusCode: 200,
			Body: io.NopCloser(strings.NewReader(`{
				"choices": [{"finish_reason": "stop", "message": {"content": "<think>raciocínio</think>\n### Visão geral\n\nJogo de **aventura**."}}]
			}`)),
		}, nil
	}))

	got, err := client.GenerateDescription(context.Background(), "hf_secret_123", nil, "Chrono Trigger", strPtr("SNES"), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Available || got.Model != DefaultModel || got.Description == nil || *got.Description != "### Visão geral\n\nJogo de **aventura**." {
		t.Fatalf("unexpected result: %+v", got)
	}
	if seenURL != ChatCompletionsURL || seenAuth != "Bearer hf_secret_123" {
		t.Fatalf("unexpected request url=%q auth=%q", seenURL, seenAuth)
	}
	if seenBody["temperature"] != 0.3 || int(seenBody["max_tokens"].(float64)) != MaxTokens {
		t.Fatalf("unexpected request parameters: %v", seenBody)
	}
}

func TestGenerateDescription_FalseSentinel(t *testing.T) {
	for _, rawContent := range []string{"false", " `false` ", "False."} {
		t.Run(rawContent, func(t *testing.T) {
			client := NewClient(doerFunc(func(_ *http.Request) (*http.Response, error) {
				payload, _ := json.Marshal(map[string]any{
					"choices": []any{map[string]any{
						"finish_reason": "stop",
						"message":       map[string]any{"content": rawContent},
					}},
				})
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(payload)))}, nil
			}))
			got, err := client.GenerateDescription(context.Background(), "hf_secret", nil, "Desconhecido", strPtr("SNES"), nil)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Available || got.Description != nil || got.Model != DefaultModel {
				t.Fatalf("expected unavailable sentinel response, got %+v", got)
			}
		})
	}
}

func TestGenerateDescription_RejectsTruncatedAndMapsErrors(t *testing.T) {
	t.Run("finish_reason length rejected", func(t *testing.T) {
		client := NewClient(doerFunc(func(_ *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 200,
				Body: io.NopCloser(strings.NewReader(`{"choices":[{"finish_reason":"length","message":{"content":"### Incompleto"}}]}`)),
			}, nil
		}))
		_, err := client.GenerateDescription(context.Background(), "hf_secret", nil, "Pokémon Unbound", strPtr("GBA"), nil)
		var appErr *domain.AppError
		if !errors.As(err, &appErr) || appErr.Status != 502 {
			t.Fatalf("expected 502 AppError, got %v", err)
		}
	})

	for _, tc := range []struct {
		code   int
		want   int
		substr string
	}{
		{401, 401, "Chave do Hugging Face inválida"},
		{402, 402, "Créditos"},
		{404, 404, "Modelo não encontrado"},
		{429, 429, "Limite de requisições"},
		{500, 502, "HTTP 500"},
	} {
		client := NewClient(doerFunc(func(_ *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: tc.code, Body: io.NopCloser(strings.NewReader("{}"))}, nil
		}))
		_, err := client.GenerateDescription(context.Background(), "hf_top_secret", nil, "SMW", nil, nil)
		var appErr *domain.AppError
		if !errors.As(err, &appErr) || appErr.Status != tc.want || !strings.Contains(appErr.Message, tc.substr) {
			t.Fatalf("code %d -> got %v, want status %d containing %q", tc.code, err, tc.want, tc.substr)
		}
		if strings.Contains(appErr.Error(), "hf_top_secret") {
			t.Fatal("token leaked in error message")
		}
	}

	timeoutClient := NewClient(doerFunc(func(_ *http.Request) (*http.Response, error) {
		return nil, timeoutErr{}
	}))
	_, err := timeoutClient.GenerateDescription(context.Background(), "hf_test", nil, "Metroid", nil, nil)
	var appErr *domain.AppError
	if !errors.As(err, &appErr) || appErr.Status != 504 {
		t.Fatalf("expected 504 on timeout, got %v", err)
	}
}

func strPtr(s string) *string { return &s }

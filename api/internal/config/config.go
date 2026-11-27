package config

import (
	"os"
	"path/filepath"
	"strings"
)

// Config holds runtime HTTP, catalog, and external API settings loaded from environment variables.
type Config struct {
	APIPort            string
	CORSOrigins        []string
	TrustedHosts       []string
	HFToken            string
	ConsoleCatalogPath string
}

const (
	defaultPort        = "5000"
	defaultCORSOrigins = "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173"
	defaultTrustedHost = "localhost,127.0.0.1,::1,[::1]"
)

// Load reads environment variables and applies project defaults.
func Load() Config {
	port := strings.TrimSpace(os.Getenv("API_PORT"))
	if port == "" {
		port = defaultPort
	}

	rawOrigins := os.Getenv("CORS_ORIGINS")
	if strings.TrimSpace(rawOrigins) == "" {
		rawOrigins = defaultCORSOrigins
	}

	rawHosts := os.Getenv("TRUSTED_HOSTS")
	if strings.TrimSpace(rawHosts) == "" {
		rawHosts = defaultTrustedHost
	}

	return Config{
		APIPort:            port,
		CORSOrigins:        splitCSV(rawOrigins),
		TrustedHosts:       splitCSV(rawHosts),
		HFToken:            strings.TrimSpace(os.Getenv("HF_TOKEN")),
		ConsoleCatalogPath: resolveCatalogPath(strings.TrimSpace(os.Getenv("CONSOLE_CATALOG_PATH"))),
	}
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func resolveCatalogPath(override string) string {
	if override != "" {
		return override
	}
	candidates := []string{
		filepath.Join("contexto", "consoles-definitive.json"),
		filepath.Join("..", "contexto", "consoles-definitive.json"),
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return candidates[0]
}

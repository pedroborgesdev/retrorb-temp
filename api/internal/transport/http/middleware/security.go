package middleware

import (
	"net"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// Security enforces trusted Host validation, strict Origin/CORS rules, and defensive headers.
func Security(trustedHosts, corsOrigins []string) gin.HandlerFunc {
	hostSet := make(map[string]struct{}, len(trustedHosts))
	for _, h := range trustedHosts {
		clean := strings.ToLower(strings.Trim(strings.TrimSpace(h), "[]"))
		if clean != "" {
			hostSet[clean] = struct{}{}
		}
	}

	originSet := make(map[string]struct{}, len(corsOrigins))
	for _, o := range corsOrigins {
		clean := strings.TrimRight(strings.TrimSpace(o), "/")
		if clean != "" {
			originSet[clean] = struct{}{}
		}
	}

	return func(c *gin.Context) {
		if reqHost := extractHost(c.Request.Host); reqHost != "" && len(hostSet) > 0 {
			if _, ok := hostSet[strings.ToLower(reqHost)]; !ok {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "Host não autorizado."})
				return
			}
		}

		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-HF-Token")
		c.Header("Cache-Control", "no-store")
		c.Header("X-Content-Type-Options", "nosniff")

		origin := c.GetHeader("Origin")
		if origin != "" {
			_, allowed := originSet[origin]
			isSameHost := origin == "http://"+c.Request.Host || origin == "https://"+c.Request.Host
			if origin != "null" && !allowed && !isSameHost {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Origem não autorizada."})
				return
			}
			if allowed || origin == "null" {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Vary", "Origin")
			}
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func extractHost(hostHeader string) string {
	trimmed := strings.TrimSpace(hostHeader)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "[") {
		if host, _, err := net.SplitHostPort(trimmed); err == nil {
			return strings.Trim(host, "[]")
		}
		return strings.Trim(trimmed, "[]")
	}
	if host, _, err := net.SplitHostPort(trimmed); err == nil {
		return host
	}
	return trimmed
}

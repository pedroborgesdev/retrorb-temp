package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HealthHandler handles GET /api/health.
type HealthHandler struct{}

// NewHealthHandler creates a HealthHandler.
func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

// Get responds with the API liveness status.
func (h *HealthHandler) Get(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

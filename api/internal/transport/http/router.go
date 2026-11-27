package http

import (
	"github.com/gin-gonic/gin"

	"retromancy/api/internal/config"
	"retromancy/api/internal/transport/http/handler"
	"retromancy/api/internal/transport/http/middleware"
)

// RouterDeps bundles all HTTP handlers injected into the Gin router.
type RouterDeps struct {
	Config   config.Config
	Health   *handler.HealthHandler
	Consoles *handler.ConsoleHandler
	Search   *handler.SearchHandler
	Game     *handler.GameHandler
	AI       *handler.AIHandler
	Download *handler.DownloadHandler
	Roms     *handler.RomHandler
	Image    *handler.ImageHandler
}

// NewRouter builds and configures the Gin engine with security middleware and REST routes.
func NewRouter(deps RouterDeps) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	engine.Use(gin.Recovery())
	_ = engine.SetTrustedProxies(nil)
	engine.Use(middleware.Security(deps.Config.TrustedHosts, deps.Config.CORSOrigins))

	api := engine.Group("/api")
	{
		api.GET("/health", deps.Health.Get)
		api.GET("/consoles", deps.Consoles.List)
		api.GET("/search", deps.Search.Search)
		api.GET("/game", deps.Game.Get)
		api.POST("/ai/describe", deps.AI.Describe)
		api.GET("/download", deps.Download.Stream)
		if deps.Roms != nil {
			api.GET("/roms/:code", deps.Roms.Get)
			api.GET("/roms/:code/download", deps.Roms.Download)
		}
		if deps.Image != nil {
			api.GET("/image", deps.Image.Get)
		}
	}

	return engine
}

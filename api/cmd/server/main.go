package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"retromancy/api/internal/application"
	"retromancy/api/internal/config"
	"retromancy/api/internal/infrastructure/catalog"
	"retromancy/api/internal/infrastructure/huggingface"
	"retromancy/api/internal/infrastructure/netsec"
	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/infrastructure/providers/romsfun"
	"retromancy/api/internal/infrastructure/providers/romsgames"
	"retromancy/api/internal/infrastructure/providers/romspure"
	"retromancy/api/internal/infrastructure/providers/wowroms"
	httptransport "retromancy/api/internal/transport/http"
	"retromancy/api/internal/transport/http/handler"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg := config.Load()

	// Infrastructure layer
	registry := providers.NewRegistry(
		romsfun.NewProvider(providers.DefaultClientFactory),
		romspure.NewProvider(providers.DefaultClientFactory),
		romsgames.NewProvider(providers.DefaultClientFactory),
		wowroms.NewProvider(providers.DefaultClientFactory),
	)
	catalogRepo := catalog.NewFileRepository(cfg.ConsoleCatalogPath)
	downloader := netsec.NewPinnedDownloader(netsec.SystemResolver{})
	hfClient := huggingface.NewClient(nil)

	// Application services layer
	searchSvc := application.NewSearchService(registry, catalogRepo, providers.DefaultClientFactory)
	gameSvc := application.NewGameService(registry, downloader)
	consoleSvc := application.NewConsoleService(catalogRepo)
	downloadSvc := application.NewDownloadService(registry, downloader)
	romCodeSvc := application.NewRomCodeService(registry, gameSvc, downloadSvc)
	imageSvc := application.NewImageService(downloader)
	aiSvc := application.NewAIService(hfClient, cfg.HFToken)

	// Transport layer
	router := httptransport.NewRouter(httptransport.RouterDeps{
		Config:   cfg,
		Health:   handler.NewHealthHandler(),
		Consoles: handler.NewConsoleHandler(consoleSvc, logger),
		Search:   handler.NewSearchHandler(searchSvc, logger),
		Game:     handler.NewGameHandler(gameSvc, logger),
		AI:       handler.NewAIHandler(aiSvc, logger),
		Download: handler.NewDownloadHandler(downloadSvc, logger),
		Roms:     handler.NewRomHandler(romCodeSvc, logger),
		Image:    handler.NewImageHandler(imageSvc, logger),
	})

	addr := "127.0.0.1:" + cfg.APIPort
	server := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("retromancy Go API listening", "addr", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		if err != nil {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	case sig := <-quit:
		logger.Info("shutting down API server", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
			os.Exit(1)
		}
	}
}

package application

import (
	"context"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// ConsoleService exposes the definitive validated console catalog.
type ConsoleService struct {
	repo ports.ConsoleCatalogRepository
}

// NewConsoleService constructs a ConsoleService with an injected repository.
func NewConsoleService(repo ports.ConsoleCatalogRepository) *ConsoleService {
	return &ConsoleService{repo: repo}
}

// ListConsoles loads and returns the complete console catalog.
func (s *ConsoleService) ListConsoles(_ context.Context) (domain.ConsoleCatalog, error) {
	return s.repo.Load()
}

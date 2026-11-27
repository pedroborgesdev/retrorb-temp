package ports

import "retromancy/api/internal/domain"

// ConsoleCatalogRepository loads, validates, and resolves canonical consoles from storage.
type ConsoleCatalogRepository interface {
	Load() (domain.ConsoleCatalog, error)
	ResolveConsole(name string) (domain.ConsoleEntry, error)
}

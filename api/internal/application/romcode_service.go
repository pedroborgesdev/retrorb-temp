package application

import (
	"context"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/romcode"
	"retromancy/api/internal/ports"
)

// RomCodeService resolves compact RO1 codes into game metadata and verified file streams.
type RomCodeService struct {
	registry    ports.ProviderRegistry
	gameSvc     ports.GameService
	downloadSvc ports.DownloadService
}

// NewRomCodeService creates a RomCodeService wired with registry, GameService, and DownloadService.
func NewRomCodeService(
	registry ports.ProviderRegistry,
	gameSvc ports.GameService,
	downloadSvc ports.DownloadService,
) *RomCodeService {
	return &RomCodeService{
		registry:    registry,
		gameSvc:     gameSvc,
		downloadSvc: downloadSvc,
	}
}

// Decode unpacks a compact RO1 code instantaneously without hitting any upstream website.
func (s *RomCodeService) Decode(code string) (domain.RomRef, error) {
	decoded, err := romcode.Decode(code)
	if err != nil {
		return domain.RomRef{}, err
	}
	prov, ok := s.registry.Get(decoded.Source)
	if !ok {
		return domain.RomRef{}, domain.BadRequest("Fonte inválida no código.")
	}
	return domain.RomRef{
		Code:      decoded.Code,
		Source:    decoded.Source,
		Label:     prov.Label(),
		GameURL:   decoded.GameURL,
		FileIndex: decoded.FileIndex,
	}, nil
}

// Resolve fetches fresh game details and verifies/relocates the target file using the embedded hash.
func (s *RomCodeService) Resolve(ctx context.Context, code string) (domain.ResolvedRomResponse, error) {
	decoded, err := romcode.Decode(code)
	if err != nil {
		return domain.ResolvedRomResponse{}, err
	}
	gameResp, err := s.gameSvc.GetDetails(ctx, decoded.Source, decoded.GameURL)
	if err != nil {
		return domain.ResolvedRomResponse{}, err
	}

	matchedIdx, fileEntry, ok := matchFileByIndexAndHash(gameResp.Game.Downloads, decoded)
	if !ok {
		return domain.ResolvedRomResponse{}, domain.NotFound("O arquivo referenciado por este código não foi encontrado na página do jogo.")
	}

	return domain.ResolvedRomResponse{
		Code:      decoded.Code,
		Source:    gameResp.Source,
		Label:     gameResp.Label,
		GameURL:   decoded.GameURL,
		FileIndex: matchedIdx,
		File:      fileEntry,
		Game:      gameResp.Game,
	}, nil
}

// OpenDownload locates the exact file on the provider page and opens a pinned byte stream.
func (s *RomCodeService) OpenDownload(ctx context.Context, code, rangeHeader string) (domain.DownloadStream, error) {
	decoded, err := romcode.Decode(code)
	if err != nil {
		return domain.DownloadStream{}, err
	}

	fileIndex := decoded.FileIndex
	var expectedFilename *string
	if decoded.HasFile {
		gameResp, err := s.gameSvc.GetDetails(ctx, decoded.Source, decoded.GameURL)
		if err != nil {
			return domain.DownloadStream{}, err
		}
		matchedIdx, entry, ok := matchFileByIndexAndHash(gameResp.Game.Downloads, decoded)
		if !ok {
			return domain.DownloadStream{}, domain.NotFound("O arquivo referenciado por este código não foi encontrado na página do jogo.")
		}
		fileIndex = matchedIdx
		expectedFilename = entry.Filename
	}

	return s.downloadSvc.OpenDownload(ctx, decoded.Source, decoded.GameURL, fileIndex, expectedFilename, rangeHeader)
}

func matchFileByIndexAndHash(downloads []domain.DownloadDetails, decoded romcode.DecodedRef) (int, domain.DownloadDetails, bool) {
	if len(downloads) == 0 {
		return 0, domain.DownloadDetails{}, false
	}
	if !decoded.HasFile {
		return 0, downloads[0], true
	}
	if decoded.FileIndex >= 0 && decoded.FileIndex < len(downloads) {
		entry := downloads[decoded.FileIndex]
		name := ""
		if entry.Filename != nil {
			name = *entry.Filename
		}
		if romcode.FilenameHash(name) == decoded.FileHash {
			return decoded.FileIndex, entry, true
		}
	}
	for i, entry := range downloads {
		name := ""
		if entry.Filename != nil {
			name = *entry.Filename
		}
		if romcode.FilenameHash(name) == decoded.FileHash {
			return i, entry, true
		}
	}
	return 0, domain.DownloadDetails{}, false
}

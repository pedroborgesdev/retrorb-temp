package application

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/htmlutil"
	"retromancy/api/internal/infrastructure/netsec"
	"retromancy/api/internal/infrastructure/providers"
	"retromancy/api/internal/infrastructure/romcode"
	"retromancy/api/internal/ports"
)

const (
	gameCacheTTL         = 5 * time.Minute
	gameCacheMaxEntries  = 128
	downloadProbeTimeout = 4 * time.Second
)

type cachedGameEntry struct {
	response  domain.GameResponse
	expiresAt time.Time
}

// GameService fetches and normalizes individual game details with short-lived caching,
// fast download availability verification, and progressive streaming.
type GameService struct {
	registry ports.ProviderRegistry
	opener   ports.DownloadOpener
	cacheMu  sync.RWMutex
	cache    map[string]cachedGameEntry
}

// NewGameService creates a GameService backed by the provider registry and optional download opener for probing.
func NewGameService(registry ports.ProviderRegistry, opener ports.DownloadOpener) *GameService {
	return &GameService{
		registry: registry,
		opener:   opener,
		cache:    make(map[string]cachedGameEntry),
	}
}

// GetDetails validates source and URL, retrieves details from the provider, and normalizes download entries.
func (s *GameService) GetDetails(ctx context.Context, source, gameURL string) (domain.GameResponse, error) {
	return s.StreamDetails(ctx, source, gameURL, nil)
}

// StreamDetails validates source and URL and emits progressive game details stages ("details", "downloads", "done").
func (s *GameService) StreamDetails(
	ctx context.Context,
	source, gameURL string,
	emit func(stage string, resp domain.GameResponse),
) (domain.GameResponse, error) {
	prov, ok := s.registry.Get(source)
	if !ok {
		return domain.GameResponse{}, domain.BadRequest("Fonte inválida.")
	}
	if !htmlutil.ValidateGameURL(gameURL, prov.Domain()) {
		return domain.GameResponse{}, domain.BadRequest("URL inválida para esta fonte.")
	}

	cacheKey := source + "\x00" + gameURL
	if cached, hit := s.cacheGet(cacheKey); hit {
		if emit != nil {
			emit("done", cached)
		}
		return cached, nil
	}

	var (
		details       domain.GameDetails
		err           error
		emitMu        sync.Mutex
		latestPartial domain.GameDetails
		hasLatest     bool
	)
	probeSession := newDownloadProbeSession(s.opener)

	if progressive, ok := prov.(ports.ProgressiveDetailsProvider); ok {
		emittedDetails := false
		details, err = progressive.DetailsStream(ctx, gameURL, func(partial domain.GameDetails) {
			if emit == nil {
				return
			}
			// Run fast download probes outside emitMu so concurrent provider workers verify in parallel.
			if emittedDetails && s.opener != nil && len(partial.Downloads) > 0 {
				probeSession.probeNew(ctx, gameURL, partial.Downloads)
			}

			emitMu.Lock()
			defer emitMu.Unlock()
			stage := "downloads"
			if !emittedDetails {
				stage = "details"
				emittedDetails = true
			}
			merged := mergePartialDetails(&latestPartial, &hasLatest, partial)
			if s.opener != nil {
				merged = probeSession.filterVerified(merged)
			}
			emit(stage, s.buildResponse(source, prov.Label(), gameURL, merged))
		})
	} else {
		details, err = prov.Details(ctx, gameURL)
	}
	if err != nil {
		return domain.GameResponse{}, domain.BadGateway(
			fmt.Sprintf("Não foi possível carregar este jogo em %s. Tente novamente.", prov.Label()),
			err,
		)
	}

	if s.opener != nil && len(details.Downloads) > 0 {
		probeSession.waitAll(ctx, gameURL, details.Downloads)
		details = probeSession.filterVerified(details)
	}

	finalResp := s.buildResponse(source, prov.Label(), gameURL, details)
	s.cacheSet(cacheKey, finalResp)
	if emit != nil {
		emitMu.Lock()
		emit("done", finalResp)
		emitMu.Unlock()
	}
	return finalResp, nil
}

func mergePartialDetails(latest *domain.GameDetails, hasLatest *bool, incoming domain.GameDetails) domain.GameDetails {
	snap := providers.CloneGameDetails(incoming)
	if !*hasLatest {
		*latest = providers.CloneGameDetails(snap)
		*hasLatest = true
		return snap
	}
	if len(latest.Downloads) == len(snap.Downloads) {
		for i := range snap.Downloads {
			if snap.Downloads[i].DownloadURL == nil && latest.Downloads[i].DownloadURL != nil {
				snap.Downloads[i] = latest.Downloads[i]
			}
		}
	}
	*latest = providers.CloneGameDetails(snap)
	return snap
}

type probeSlot struct {
	done chan struct{}
	ok   bool
}

type probeTask struct {
	key   string
	entry domain.DownloadDetails
	slot  *probeSlot
}

type downloadProbeSession struct {
	opener ports.DownloadOpener
	mu     sync.Mutex
	slots  map[string]*probeSlot
}

func newDownloadProbeSession(opener ports.DownloadOpener) *downloadProbeSession {
	return &downloadProbeSession{
		opener: opener,
		slots:  make(map[string]*probeSlot),
	}
}

func probeSlotKey(entry domain.DownloadDetails) (string, bool) {
	if entry.DownloadURL == nil {
		return "", false
	}
	trimmed := strings.TrimSpace(*entry.DownloadURL)
	if trimmed == "" {
		return "", false
	}
	normalized, err := netsec.NormalizeDownloadURL(trimmed)
	if err != nil {
		return "", false
	}
	return normalized, true
}

func (p *downloadProbeSession) probeNew(ctx context.Context, gameURL string, entries []domain.DownloadDetails) {
	if p.opener == nil || len(entries) == 0 {
		return
	}

	var tasks []probeTask
	p.mu.Lock()
	for _, entry := range entries {
		key, valid := probeSlotKey(entry)
		if !valid {
			continue
		}
		if _, exists := p.slots[key]; exists {
			continue
		}
		slot := &probeSlot{done: make(chan struct{})}
		p.slots[key] = slot
		tasks = append(tasks, probeTask{key: key, entry: entry, slot: slot})
	}
	p.mu.Unlock()

	if len(tasks) == 0 {
		return
	}

	providers.ResolveConcurrently(ctx, len(tasks), 4, func(i int) {
		task := tasks[i]
		task.slot.ok = p.probeEntry(ctx, gameURL, task.key, task.entry)
		close(task.slot.done)
	})
}

func (p *downloadProbeSession) waitAll(ctx context.Context, gameURL string, entries []domain.DownloadDetails) {
	if p.opener == nil || len(entries) == 0 {
		return
	}
	p.probeNew(ctx, gameURL, entries)

	p.mu.Lock()
	slots := make([]*probeSlot, 0, len(entries))
	for _, entry := range entries {
		key, valid := probeSlotKey(entry)
		if !valid {
			continue
		}
		if slot, exists := p.slots[key]; exists {
			slots = append(slots, slot)
		}
	}
	p.mu.Unlock()

	for _, slot := range slots {
		select {
		case <-slot.done:
		case <-ctx.Done():
			return
		}
	}
}

func (p *downloadProbeSession) probeEntry(
	ctx context.Context,
	gameURL, normalizedURL string,
	entry domain.DownloadDetails,
) bool {
	referer := entry.ProbeReferer
	if referer == "" {
		referer = gameURL
	}
	method := entry.ProbeMethod
	if method == "" {
		method = "GET"
	}

	probeCtx, cancel := context.WithTimeout(ctx, downloadProbeTimeout)
	defer cancel()

	body, status, _, err := p.opener.OpenPinned(probeCtx, normalizedURL, ports.OpenPinnedOptions{
		Referer:   referer,
		Method:    method,
		FormData:  entry.ProbeFormData,
		UserAgent: netsec.BrowserUserAgent,
	})
	if body != nil {
		_ = body.Close()
	}
	return err == nil && status >= 200 && status < 300
}

func (p *downloadProbeSession) filterVerified(details domain.GameDetails) domain.GameDetails {
	normalized := netsec.NormalizeGameDownloads(details)
	if len(normalized.Downloads) == 0 {
		return normalized
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	for i := range normalized.Downloads {
		if normalized.Downloads[i].DownloadURL == nil {
			continue
		}
		key, valid := probeSlotKey(normalized.Downloads[i])
		verified := false
		if valid {
			if slot, exists := p.slots[key]; exists {
				select {
				case <-slot.done:
					verified = slot.ok
				default:
					verified = false
				}
			}
		}
		if !verified {
			normalized.Downloads[i].DownloadURL = nil
			normalized.Downloads[i].Code = nil
		}
	}
	return normalized
}

func (s *GameService) buildResponse(source, label, gameURL string, details domain.GameDetails) domain.GameResponse {
	normalized := netsec.NormalizeGameDownloads(details)
	for i := range normalized.Downloads {
		if normalized.Downloads[i].DownloadURL == nil {
			continue
		}
		filename := ""
		if normalized.Downloads[i].Filename != nil {
			filename = *normalized.Downloads[i].Filename
		}
		if code, err := romcode.Encode(source, gameURL, i, filename); err == nil {
			normalized.Downloads[i].Code = &code
		}
	}
	return domain.GameResponse{
		Source: source,
		Label:  label,
		Game:   normalized,
	}
}

func (s *GameService) cacheGet(key string) (domain.GameResponse, bool) {
	now := time.Now()
	s.cacheMu.RLock()
	entry, ok := s.cache[key]
	s.cacheMu.RUnlock()
	if !ok {
		return domain.GameResponse{}, false
	}
	if now.After(entry.expiresAt) {
		s.cacheMu.Lock()
		if cur, exists := s.cache[key]; exists && now.After(cur.expiresAt) {
			delete(s.cache, key)
		}
		s.cacheMu.Unlock()
		return domain.GameResponse{}, false
	}
	return cloneGameResponse(entry.response), true
}

func (s *GameService) cacheSet(key string, resp domain.GameResponse) {
	now := time.Now()
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	if s.cache == nil {
		s.cache = make(map[string]cachedGameEntry)
	}
	if len(s.cache) >= gameCacheMaxEntries {
		var oldestKey string
		var oldestExp time.Time
		for k, v := range s.cache {
			if now.After(v.expiresAt) {
				delete(s.cache, k)
				continue
			}
			if oldestKey == "" || v.expiresAt.Before(oldestExp) {
				oldestKey = k
				oldestExp = v.expiresAt
			}
		}
		if len(s.cache) >= gameCacheMaxEntries && oldestKey != "" {
			delete(s.cache, oldestKey)
		}
	}
	s.cache[key] = cachedGameEntry{
		response:  cloneGameResponse(resp),
		expiresAt: now.Add(gameCacheTTL),
	}
}

func cloneGameResponse(resp domain.GameResponse) domain.GameResponse {
	if resp.Game.Downloads != nil {
		copied := make([]domain.DownloadDetails, len(resp.Game.Downloads))
		copy(copied, resp.Game.Downloads)
		resp.Game.Downloads = copied
	}
	return resp
}

package domain

// DownloadDetails represents a downloadable file entry returned by /api/game.
// Nullable fields omit omitempty so JSON explicitly emits null when absent.
type DownloadDetails struct {
	Filename      *string           `json:"filename"`
	Type          *string           `json:"type"`
	Size          *string           `json:"size"`
	DownloadURL   *string           `json:"download_url"`
	Code          *string           `json:"code,omitempty"`
	ProbeMethod   string            `json:"-"`
	ProbeFormData map[string]string `json:"-"`
	ProbeReferer  string            `json:"-"`
}

// GameDetails holds normalized metadata and downloads for a game page.
// Nullable fields omit omitempty to match frontend Zod schemas expecting explicit nulls.
type GameDetails struct {
	Name         *string           `json:"name"`
	Description  *string           `json:"description"`
	ReleaseDate  *string           `json:"release_date"`
	ReviewsCount *int              `json:"reviews_count"`
	StarsRate    *float64          `json:"stars_rate"`
	Publisher    *string           `json:"publisher"`
	Regions      []string          `json:"regions"`
	Icon         *string           `json:"icon"`
	Screenshots  []string          `json:"screenshots"`
	Downloads    []DownloadDetails `json:"downloads"`
}

// GameResponse is the response envelope for GET /api/game.
type GameResponse struct {
	Source string      `json:"source"`
	Label  string      `json:"label"`
	Game   GameDetails `json:"game"`
}

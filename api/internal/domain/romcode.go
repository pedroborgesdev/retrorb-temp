package domain

// RomRef is the instant decoded identity extracted from an RO1 reference code.
type RomRef struct {
	Code      string `json:"code"`
	Source    string `json:"source"`
	Label     string `json:"label"`
	GameURL   string `json:"game_url"`
	FileIndex int    `json:"file_index"`
}

// ResolvedRomResponse combines the decoded RomRef with freshly fetched game details and matched file entry.
type ResolvedRomResponse struct {
	Code      string          `json:"code"`
	Source    string          `json:"source"`
	Label     string          `json:"label"`
	GameURL   string          `json:"game_url"`
	FileIndex int             `json:"file_index"`
	File      DownloadDetails `json:"file"`
	Game      GameDetails     `json:"game"`
}

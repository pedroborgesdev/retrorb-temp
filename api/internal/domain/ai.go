package domain

// DescribeRequest carries inputs to generate an editorial Markdown description.
type DescribeRequest struct {
	HeaderToken       string  `json:"-"`
	APIKey            *string `json:"api_key"`
	Model             *string `json:"model"`
	Title             *string `json:"title"`
	Console           *string `json:"console"`
	SourceDescription *string `json:"source_description"`
}

// DescribeResponse matches the frontend aiDescriptionResponseSchema discriminated union.
type DescribeResponse struct {
	Available   bool    `json:"available"`
	Description *string `json:"description"`
	Model       string  `json:"model"`
}

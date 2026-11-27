package providers

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

const BrowserUserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36"

// HTTPClientFactory creates or returns an HTTPDoer (optionally backed by an isolated CookieJar).
type HTTPClientFactory func(timeout time.Duration) ports.HTTPDoer

// DefaultClientFactory returns a redirect-blocking HTTP client with an in-memory CookieJar.
func DefaultClientFactory(timeout time.Duration) ports.HTTPDoer {
	jar, _ := cookiejar.New(nil)
	return &http.Client{
		Timeout: timeout,
		Jar:     jar,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// DoGet performs a GET request with query params and headers, validating non-3xx 2xx responses.
func DoGet(
	ctx context.Context,
	client ports.HTTPDoer,
	rawURL string,
	params map[string]string,
	headers map[string]string,
	providerLabel string,
) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if len(params) > 0 {
		q := parsed.Query()
		for k, v := range params {
			q.Set(k, v)
		}
		parsed.RawQuery = q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return "", fmt.Errorf("redirecionamento inesperado do %s", providerLabel)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("%s retornou HTTP %d", providerLabel, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// DoPostForm performs a form-urlencoded POST request with optional query params and headers.
func DoPostForm(
	ctx context.Context,
	client ports.HTTPDoer,
	rawURL string,
	queryParams map[string]string,
	formParams map[string]string,
	headers map[string]string,
	providerLabel string,
) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if len(queryParams) > 0 {
		q := parsed.Query()
		for k, v := range queryParams {
			q.Set(k, v)
		}
		parsed.RawQuery = q.Encode()
	}
	form := url.Values{}
	for k, v := range formParams {
		form.Set(k, v)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, parsed.String(), bytes.NewBufferString(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return "", fmt.Errorf("redirecionamento inesperado do %s", providerLabel)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("%s retornou HTTP %d", providerLabel, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// BuildHeaders merges base provider headers with per-request overrides.
func BuildHeaders(base map[string]string, overrides ...string) map[string]string {
	merged := make(map[string]string, len(base)+len(overrides)/2)
	for k, v := range base {
		merged[k] = v
	}
	for i := 0; i+1 < len(overrides); i += 2 {
		merged[overrides[i]] = overrides[i+1]
	}
	return merged
}

// SanitizeResultURL validates provider result links against expectedHost and provider rules.
func SanitizeResultURL(rawURL, expectedHost, providerName string) bool {
	if rawURL == "" {
		return false
	}
	decoded, err := url.PathUnescape(rawURL)
	if err != nil {
		decoded = rawURL
	}
	if strings.Contains(decoded, "\\") {
		return false
	}
	for i := 0; i < len(decoded); i++ {
		if decoded[i] < 32 || decoded[i] == 127 {
			return false
		}
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if parsed.Scheme != "https" || parsed.Hostname() != expectedHost || parsed.User != nil || parsed.Port() != "" {
		return false
	}
	if providerName == "romsgames" {
		return strings.Contains(parsed.Path, "-rom-")
	}
	return true
}

// CleanSliceNil ensures empty string slices serialize cleanly or nil stays nil.
func StrIfNotEmpty(s string) *string {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// BudgetDeadline computes a per-request deadline helper matching SEARCH_BUDGET_SECONDS.
func BudgetDeadline(budgetSeconds int) (time.Time, func() bool) {
	deadline := time.Now().Add(time.Duration(budgetSeconds) * time.Second)
	return deadline, func() bool {
		return time.Now().Before(deadline)
	}
}

// ValidatePage ensures page is a positive integer.
func ValidatePage(page int) error {
	if page < 1 {
		return domain.BadRequest("A página deve ser um inteiro positivo.")
	}
	return nil
}

// CloneGameDetails copies a GameDetails value and its mutable Downloads slice so progressive
// callbacks never race with concurrent workers updating download links.
func CloneGameDetails(d domain.GameDetails) domain.GameDetails {
	if d.Downloads != nil {
		copied := make([]domain.DownloadDetails, len(d.Downloads))
		copy(copied, d.Downloads)
		d.Downloads = copied
	}
	return d
}

// ResolveConcurrently runs work(i) across n items with bounded concurrency while respecting ctx cancellation.
func ResolveConcurrently(ctx context.Context, n, maxWorkers int, work func(index int)) {
	if n <= 0 {
		return
	}
	if maxWorkers < 1 {
		maxWorkers = 1
	}
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		if ctx.Err() != nil {
			break
		}
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}
			work(idx)
		}(i)
	}
	wg.Wait()
}

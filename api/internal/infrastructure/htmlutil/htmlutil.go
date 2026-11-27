package htmlutil

import (
	"encoding/json"
	stdhtml "html"
	"net/url"
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

var spaceCollapseRe = regexp.MustCompile(`\s+`)

// ParseHTML parses an HTML document or fragment into a DOM tree.
func ParseHTML(raw string) (*html.Node, error) {
	return html.Parse(strings.NewReader(raw))
}

// FindFirst performs a depth-first search and returns the first matching element node.
func FindFirst(root *html.Node, match func(*html.Node) bool) *html.Node {
	if root == nil {
		return nil
	}
	var found *html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if found != nil {
			return
		}
		if n.Type == html.ElementNode && match(n) {
			found = n
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return found
}

// FindAll collects all element nodes matching the predicate in document order.
func FindAll(root *html.Node, match func(*html.Node) bool) []*html.Node {
	if root == nil {
		return nil
	}
	var out []*html.Node
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && match(n) {
			out = append(out, n)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return out
}

// Attr returns the named attribute value on node (case-insensitive).
func Attr(node *html.Node, key string) (string, bool) {
	if node == nil {
		return "", false
	}
	lowerKey := strings.ToLower(key)
	for _, a := range node.Attr {
		if strings.ToLower(a.Key) == lowerKey {
			return a.Val, true
		}
	}
	return "", false
}

// HasClass checks whether className is one of the space-separated classes on node.
func HasClass(node *html.Node, className string) bool {
	cls, ok := Attr(node, "class")
	if !ok {
		return false
	}
	for _, field := range strings.Fields(cls) {
		if field == className {
			return true
		}
	}
	return false
}

// HasClassSubstring checks whether marker appears in the node's raw class attribute.
func HasClassSubstring(node *html.Node, marker string) bool {
	cls, ok := Attr(node, "class")
	if !ok {
		return false
	}
	return strings.Contains(cls, marker)
}

// CollapseSpaces normalizes whitespace runs to single spaces and trims ends.
func CollapseSpaces(s string) string {
	return strings.TrimSpace(spaceCollapseRe.ReplaceAllString(s, " "))
}

// Text extracts visible text within node, ignoring script/style/svg subtrees.
func Text(node *html.Node) string {
	if node == nil {
		return ""
	}
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			tag := strings.ToLower(n.Data)
			if tag == "script" || tag == "style" || tag == "svg" {
				return
			}
			b.WriteByte(' ')
		} else if n.Type == html.TextNode {
			b.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
		if n.Type == html.ElementNode {
			b.WriteByte(' ')
		}
	}
	walk(node)
	return CollapseSpaces(b.String())
}

// ParagraphText extracts visible text preserving <br> line breaks and <p> paragraph breaks.
func ParagraphText(node *html.Node) string {
	if node == nil {
		return ""
	}
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			tag := strings.ToLower(n.Data)
			if tag == "script" || tag == "style" || tag == "svg" {
				return
			}
			if tag == "br" {
				b.WriteByte('\n')
				return
			}
		} else if n.Type == html.TextNode {
			b.WriteString(strings.ReplaceAll(n.Data, "\r", ""))
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
		if n.Type == html.ElementNode && strings.ToLower(n.Data) == "p" {
			b.WriteString("\n\n")
		}
	}
	walk(node)

	lines := strings.Split(b.String(), "\n")
	paragraphs := make([]string, 0, len(lines))
	for _, line := range lines {
		cleaned := CollapseSpaces(line)
		if cleaned != "" {
			paragraphs = append(paragraphs, cleaned)
		}
	}
	return strings.Join(paragraphs, "\n\n")
}

// ExtractJSONLDVideoGame returns the first VideoGame schema object found in JSON-LD script tags.
func ExtractJSONLDVideoGame(root *html.Node) map[string]any {
	scripts := FindAll(root, func(n *html.Node) bool {
		if n.Data != "script" {
			return false
		}
		t, ok := Attr(n, "type")
		return ok && strings.EqualFold(strings.TrimSpace(t), "application/ld+json")
	})

	for _, script := range scripts {
		if script.FirstChild == nil {
			continue
		}
		raw := strings.TrimSpace(stdhtml.UnescapeString(script.FirstChild.Data))
		if raw == "" {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			continue
		}
		candidates := []any{payload}
		if graph, ok := payload["@graph"]; ok {
			switch typed := graph.(type) {
			case []any:
				candidates = append(candidates, typed...)
			case map[string]any:
				candidates = append(candidates, typed)
			}
		}
		for _, cand := range candidates {
			obj, ok := cand.(map[string]any)
			if !ok {
				continue
			}
			if isVideoGameType(obj["@type"]) {
				return obj
			}
		}
	}
	return nil
}

func isVideoGameType(value any) bool {
	switch t := value.(type) {
	case string:
		return t == "VideoGame"
	case []any:
		for _, item := range t {
			if s, ok := item.(string); ok && s == "VideoGame" {
				return true
			}
		}
	}
	return false
}

// SafeURLJoin resolves candidate relative to baseURL, returning empty string on parse failure.
func SafeURLJoin(baseURL, candidate string) string {
	base, err := url.Parse(baseURL)
	if err != nil {
		return ""
	}
	ref, err := url.Parse(candidate)
	if err != nil {
		return ""
	}
	return base.ResolveReference(ref).String()
}

// ValidateGameURL checks that rawURL uses HTTPS, belongs to domain (or optional www.<domain>),
// has no credentials, custom port, control characters, backslash, fragment, or empty path.
func ValidateGameURL(rawURL, domain string) bool {
	if rawURL == "" || len(rawURL) > 2048 || strings.Contains(rawURL, "\\") {
		return false
	}
	for i := 0; i < len(rawURL); i++ {
		if rawURL[i] < 33 {
			return false
		}
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if parsed.Scheme != "https" || parsed.User != nil || parsed.Fragment != "" {
		return false
	}
	if strings.Contains(rawURL, "#") {
		return false
	}
	if parsed.Port() != "" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	lowerDomain := strings.ToLower(domain)
	if host != lowerDomain && host != "www."+lowerDomain {
		return false
	}
	if strings.Trim(parsed.Path, "/") == "" {
		return false
	}
	return true
}

// StrPtr returns a pointer to s when non-empty, or nil otherwise.
func StrPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// IntPtr returns a pointer to v.
func IntPtr(v int) *int {
	return &v
}

// FloatPtr returns a pointer to v.
func FloatPtr(v float64) *float64 {
	return &v
}

package handler

import (
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/ports"
)

// DownloadHandler handles GET /api/download and streams remote files cleanly with Range support.
type DownloadHandler struct {
	service ports.DownloadService
	logger  *slog.Logger
}

// NewDownloadHandler creates a DownloadHandler with an injected DownloadService.
func NewDownloadHandler(service ports.DownloadService, logger *slog.Logger) *DownloadHandler {
	return &DownloadHandler{service: service, logger: logger}
}

// Stream resolves and proxies the selected download file with byte-range resumption support.
func (h *DownloadHandler) Stream(c *gin.Context) {
	source := c.Query("source")
	gameURL := c.Query("url")
	var expectedFilename *string
	if rawFilename, ok := c.GetQuery("filename"); ok {
		expectedFilename = &rawFilename
	}

	fileIndex, err := strconv.Atoi(c.Query("file"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Arquivo inválido."})
		return
	}

	rangeHeader := c.GetHeader("Range")
	stream, err := h.service.OpenDownload(
		c.Request.Context(),
		source,
		gameURL,
		fileIndex,
		expectedFilename,
		rangeHeader,
	)
	if err != nil {
		status, msg := domain.StatusFromError(err, "Não foi possível preparar este download.")
		if status >= 500 && h.logger != nil {
			h.logger.Error("download resolution failed", "source", source, "error", err)
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	defer stream.Body.Close()
	streamDownload(c, stream, rangeHeader != "")
}

func streamDownload(c *gin.Context, stream domain.DownloadStream, hasRange bool) {
	statusCode := http.StatusOK
	if hasRange && stream.Status == http.StatusPartialContent {
		statusCode = http.StatusPartialContent
	}

	c.Header("Accept-Ranges", "bytes")
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Disposition", formatAttachment(stream.Filename))

	if contentLength := stream.Headers.Get("Content-Length"); isAllDigits(contentLength) {
		c.Header("Content-Length", contentLength)
	}
	if statusCode == http.StatusPartialContent {
		if contentRange := stream.Headers.Get("Content-Range"); contentRange != "" {
			c.Header("Content-Range", contentRange)
		}
	}

	c.Status(statusCode)
	buf := make([]byte, 64*1024)
	_, _ = io.CopyBuffer(c.Writer, stream.Body, buf)
}

func formatAttachment(filename string) string {
	formatted := mime.FormatMediaType("attachment", map[string]string{"filename": filename})
	if formatted != "" {
		return formatted
	}
	return `attachment; filename="download.zip"`
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

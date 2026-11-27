package domain

import (
	"errors"
	"net/http"
)

// AppError represents a domain/application error safe to surface to HTTP clients.
type AppError struct {
	Status  int
	Message string
	Err     error
}

func (e *AppError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

// NewAppError creates a client-safe AppError wrapping an optional internal error.
func NewAppError(status int, message string, err error) *AppError {
	return &AppError{
		Status:  status,
		Message: message,
		Err:     err,
	}
}

// BadRequest builds a 400 AppError.
func BadRequest(message string) *AppError {
	return NewAppError(http.StatusBadRequest, message, nil)
}

// NotFound builds a 404 AppError.
func NotFound(message string) *AppError {
	return NewAppError(http.StatusNotFound, message, nil)
}

// Conflict builds a 409 AppError.
func Conflict(message string) *AppError {
	return NewAppError(http.StatusConflict, message, nil)
}

// BadGateway builds a 502 AppError.
func BadGateway(message string, err error) *AppError {
	return NewAppError(http.StatusBadGateway, message, err)
}

// ServiceUnavailable builds a 503 AppError.
func ServiceUnavailable(message string, err error) *AppError {
	return NewAppError(http.StatusServiceUnavailable, message, err)
}

// GatewayTimeout builds a 504 AppError.
func GatewayTimeout(message string, err error) *AppError {
	return NewAppError(http.StatusGatewayTimeout, message, err)
}

// StatusFromError extracts the HTTP status and safe message from err, defaulting to 502.
func StatusFromError(err error, fallback string) (int, string) {
	var appErr *AppError
	if errors.As(err, &appErr) && appErr != nil {
		status := appErr.Status
		if status < 400 || status > 599 {
			status = http.StatusBadGateway
		}
		msg := appErr.Message
		if msg == "" {
			msg = fallback
		}
		return status, msg
	}
	return http.StatusBadGateway, fallback
}

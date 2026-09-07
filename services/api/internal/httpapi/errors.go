package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// Error codes of the single envelope every non-2xx response uses
// (ARCHITECTURE §8.6).
const (
	CodeNotFound     = "not_found"
	CodeBadRequest   = "bad_request"
	CodeUnauthorized = "unauthorized"
	CodeConflict     = "conflict"
	CodeInternal     = "internal"
)

func errorBody(code, message string) Error {
	return Error{Error: ErrorBody{Code: ErrorBodyCode(code), Message: message}}
}

// writeError renders the error envelope for the plain net/http handlers
// (middleware and the SSE route), which sit outside the strict server.
func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorBody(code, message))
}

func parseUUID(s string) (uuid.UUID, error) { return uuid.Parse(s) }

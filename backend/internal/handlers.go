package internal

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

type Handler struct {
	Users *UserService
}

type createUserRequest struct {
	FirstName            string `json:"first_name"`
	LastName             string `json:"last_name"`
	Email                string `json:"email"`
	Password             string `json:"password"`
	PasswordConfirmation string `json:"password_confirmation"`
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		fmt.Println("JSON RESPONSE ERROR:", err)
	}
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.Email == "" || req.Password == "" || req.PasswordConfirmation == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Passwords do not match",
		})
		return
	}

	if req.Password != req.PasswordConfirmation {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Passwords do not match",
		})
		return
	}

	err := h.Users.CreateUser(req.FirstName, req.LastName, req.Email, req.Password)
	if err != nil {
		fmt.Println("CREATE USER ERROR:", err)

		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "User created successfully",
	})
}

func NewRouter(h *Handler) http.Handler {
	r := mux.NewRouter()

	corsHandler := handlers.CORS(
		handlers.AllowedOrigins([]string{"http://localhost:5173"}),
		handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
	)(r)

	r.HandleFunc("/signup", h.CreateUser).Methods("POST")

	return corsHandler
}

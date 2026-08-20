package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"backend/services"
	"backend/util"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)

type HandlerLayerInstance struct {
	services *services.ServiceLayerInstance
}

var (
	handlerInstance *HandlerLayerInstance
	once            sync.Once
)

func NewHandlerLayer(s *services.ServiceLayerInstance) *HandlerLayerInstance {
	once.Do(func() {
		handlerInstance = &HandlerLayerInstance{
			services: s,
		}
	})
	return handlerInstance
}

func (h *HandlerLayerInstance) NewRouter() (*mux.Router, http.Handler) {
	r := mux.NewRouter()

	corsHandler := handlers.CORS(
		handlers.AllowedOrigins([]string{"http://localhost:5173"}),
		handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
	)(r)

	return r, corsHandler
}

func (h *HandlerLayerInstance) CreateUser(w http.ResponseWriter, r *http.Request) {
	type createUserRequest struct {
		FirstName            string `json:"first_name"`
		LastName             string `json:"last_name"`
		Email                string `json:"email"`
		Password             string `json:"password"`
		PasswordConfirmation string `json:"password_confirmation"`
	}

	var req createUserRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.Email == "" || req.Password == "" || req.PasswordConfirmation == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Passwords do not match",
		})
		return
	}

	if req.Password != req.PasswordConfirmation {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Passwords do not match",
		})
		return
	}

	err := h.services.CreateUser(req.FirstName, req.LastName, req.Email, req.Password)
	if err != nil {
		fmt.Println("CREATE USER ERROR:", err)

		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "User created successfully",
	})
}

func (h *HandlerLayerInstance) LoginUser(w http.ResponseWriter, r *http.Request) {
	type loginUserRequest struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	var req loginUserRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		http.Error(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	//check if user exists and password is correct
	user, err := h.services.LoginUser(req.Email)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Invalid email or password",
		})
		return
	}

	if bcrypt.CompareHashAndPassword(
		[]byte(user.Password),
		[]byte(req.Password),
	) != nil {
		//create session token and return it
		err := h.services.CreateSession(user.ID)
		if err != nil {
			util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
				"error": "Cannot hash password",
			})
			return
		}
	}

}

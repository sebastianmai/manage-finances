package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sync"
	"time"

	"backend/models"
	"backend/services"
	"backend/util"

	"github.com/google/uuid"
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
		handlers.AllowedMethods([]string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
		handlers.AllowCredentials(),
	)(r)

	return r, corsHandler
}

func (h *HandlerLayerInstance) CreateUser(w http.ResponseWriter, r *http.Request) {
	userUUID := util.GenerateUUID()

	type createUserRequest struct {
		UUID                 string
		FirstName            string `json:"first_name"`
		LastName             string `json:"last_name"`
		Email                string `json:"email"`
		Password             string `json:"password"`
		PasswordConfirmation string `json:"password_confirmation"`
	}

	var req createUserRequest
	req.UUID = userUUID

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.Email == "" || req.Password == "" || req.PasswordConfirmation == "" || req.UUID == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "All fields are required",
		})
		return
	}

	if req.Password != req.PasswordConfirmation {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Passwords do not match",
		})
		return
	}

	err := h.services.CreateUser(req.UUID, req.FirstName, req.LastName, req.Email, req.Password)
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
			"test":  err.Error(),
		})
		return
	}

	if bcrypt.CompareHashAndPassword(
		[]byte(user.Password),
		[]byte(req.Password),
	) == nil {

		sessionID := util.GenerateUUID()
		createdAt := time.Now()
		expiresAt := createdAt.Add(24 * time.Hour)

		sessionID, err := h.services.CreateSession(util.GenerateUUID(), user.ID, createdAt, expiresAt)
		if err != nil {
			util.WriteJSON(w, http.StatusInternalServerError, map[string]string{
				"error":   "Failed to create session",
				"details": err.Error(),
			})
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session_id",
			Value:    sessionID,
			Expires:  expiresAt,
			HttpOnly: true,
			Secure:   false, // false only in local http dev
			SameSite: http.SameSiteLaxMode,
			Path:     "/",
		})

		util.WriteJSON(w, http.StatusOK, map[string]string{
			"message":    "Login successful",
			"session_id": sessionID,
		})

		return

	}

	util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
		"error": "Invalid email or password",
	})

}

func (h *HandlerLayerInstance) GetUser(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	sessionID := cookie.Value

	user, err := h.services.GetUserBySession(sessionID)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: Invalid session",
		})
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"user": user,
	})
}

func (h *HandlerLayerInstance) GetBalance(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	user, err := h.services.GetUserBySession(cookie.Value)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: Invalid session",
		})
		return
	}

	balance, err := h.services.GetBalance(user.ID)
	if err != nil {
		fmt.Println("GET BALANCE ERROR:", err)
		http.Error(w, "Failed to retrieve balance", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"balance": balance,
	})
}

func (h *HandlerLayerInstance) GetAccounts(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	user, err := h.services.GetUserBySession(cookie.Value)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: Invalid session",
		})
		return
	}

	accounts, err := h.services.GetAccounts(user.ID)
	if err != nil {
		fmt.Println("GET ACCOUNTS ERROR:", err)
		http.Error(w, "Failed to retrieve accounts", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"accounts": accounts,
	})
}

func (h *HandlerLayerInstance) CreateAccount(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	currentUser, err := h.services.GetUserBySession(cookie.Value)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: Invalid session",
		})
		return
	}

	var req models.Account
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// The decoder cannot have touched UUID (json:"-"), so the session user
	// is the only possible owner.
	req.UUID = currentUser.ID
	// Account.ID is tagged json:"id", so unlike UUID a client CAN put an id
	// in the request body. Assigning here unconditionally overwrites
	// anything supplied, which is what keeps ids server-generated --
	// assigning before the decode would let a client choose its own
	// primary key.
	req.ID = util.GenerateUUID()

	if req.Type == "" || req.AccountNumber == "" || req.FullName == "" || req.ShortName == "" || req.ActiveSince == "" || req.OwnerName == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "All fields except Vollmacht are required",
		})
		return
	}

	if err := h.services.CreateAccount(req); err != nil {
		fmt.Println("CREATE ACCOUNT ERROR:", err)
		http.Error(w, "Failed to create account", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "Account created successfully",
	})
}

func (h *HandlerLayerInstance) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	currentUser, err := h.services.GetUserBySession(cookie.Value)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: Invalid session",
		})
		return
	}

	vars := mux.Vars(r)
	// This is a syntax validation gate, not a conversion step -- the
	// service wants the original path-segment string, not the parsed
	// value. Failing early with a clean 400 stops a bad id from surfacing
	// as a raw driver/scan error further down.
	if _, err := uuid.Parse(vars["id"]); err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Invalid account id",
		})
		return
	}

	deleted, err := h.services.DeleteAccount(vars["id"], currentUser.ID)
	if err != nil {
		fmt.Println("DELETE ACCOUNT ERROR:", err)
		http.Error(w, "Failed to delete account", http.StatusInternalServerError)
		return
	}

	// Same status and message whether the id belongs to another user or
	// does not exist at all -- one shared path, no ownership oracle.
	if !deleted {
		util.WriteJSON(w, http.StatusNotFound, map[string]string{
			"error": "Account not found",
		})
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Account deleted successfully",
	})
}

func (h *HandlerLayerInstance) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	currentUser, err := h.services.GetUserBySession(cookie.Value)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: Invalid session",
		})
		return
	}

	var req models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// The decoder cannot have touched UUID (json:"-"), so the session user
	// is the only possible owner.
	req.UUID = currentUser.ID

	if req.AccountID == "" || req.TransactionDate == "" || req.Category == "" || req.Description == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Account, date, category, and description are required",
		})
		return
	}

	if req.Amount == 0 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Amount cannot be zero",
		})
		return
	}

	// The column is VARCHAR(255) and a transfer appends a marker naming the
	// counterpart account; capping the raw input here keeps the composed
	// string inside the column no matter which account is named.
	if len(req.Description) > 180 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Description must be 180 characters or fewer",
		})
		return
	}

	isTransfer := req.TransferToAccountID != ""

	if isTransfer && req.TransferToAccountID == req.AccountID {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Transfer source and destination must be different accounts",
		})
		return
	}

	// Resolving both ids against this call proves ownership of both -- the
	// FK alone only proves an account exists somewhere, not that this user
	// owns it -- and supplies the short_names needed for transfer
	// descriptions, with no new query.
	accounts, err := h.services.GetAccounts(currentUser.ID)
	if err != nil {
		fmt.Println("CREATE TRANSACTION ERROR:", err)
		http.Error(w, "Failed to create transaction", http.StatusInternalServerError)
		return
	}

	var sourceAccount, destAccount *models.Account
	for i := range accounts {
		if accounts[i].ID == req.AccountID {
			sourceAccount = &accounts[i]
		}
		if isTransfer && accounts[i].ID == req.TransferToAccountID {
			destAccount = &accounts[i]
		}
	}

	// Same status and message whether an id belongs to another user or does
	// not exist at all -- one shared path, no ownership oracle, matching
	// DeleteAccount.
	if sourceAccount == nil || (isTransfer && destAccount == nil) {
		util.WriteJSON(w, http.StatusNotFound, map[string]string{
			"error": "Account not found",
		})
		return
	}

	var legs []models.Transaction
	if !isTransfer {
		legs = []models.Transaction{
			{
				UUID:            req.UUID,
				AccountID:       req.AccountID,
				Amount:          req.Amount,
				Description:     req.Description,
				Category:        req.Category,
				TransactionDate: req.TransactionDate,
			},
		}
	} else {
		// The magnitude is taken as the absolute value of the entered
		// amount regardless of its typed sign -- a negative entry must not
		// silently invert which account is debited. The source leg always
		// gets the negated magnitude, the destination the positive one.
		magnitude := math.Abs(req.Amount)
		legs = []models.Transaction{
			{
				UUID:            req.UUID,
				AccountID:       req.AccountID,
				Amount:          -magnitude,
				Description:     fmt.Sprintf("%s (transfer to %s)", req.Description, destAccount.ShortName),
				Category:        req.Category,
				TransactionDate: req.TransactionDate,
			},
			{
				UUID:            req.UUID,
				AccountID:       req.TransferToAccountID,
				Amount:          magnitude,
				Description:     fmt.Sprintf("%s (transfer from %s)", req.Description, sourceAccount.ShortName),
				Category:        req.Category,
				TransactionDate: req.TransactionDate,
			},
		}
	}

	if err := h.services.CreateBooking(legs); err != nil {
		fmt.Println("CREATE TRANSACTION ERROR:", err)
		http.Error(w, "Failed to create transaction", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"message": "Transaction created successfully",
	})
}

func (h *HandlerLayerInstance) UpdateUser(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	currentUser, err := h.services.GetUserBySession(cookie.Value)
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: Invalid session",
		})
		return
	}

	var req models.User
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.FirstName == "" || req.LastName == "" || req.Email == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "First name, last name, and email are required",
		})
		return
	}

	if err := h.services.UpdateUser(currentUser.ID, req.FirstName, req.LastName, req.Email); err != nil {
		fmt.Println("UPDATE USER ERROR:", err)
		http.Error(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"user": map[string]string{
			"id":         currentUser.ID,
			"first_name": req.FirstName,
			"last_name":  req.LastName,
			"email":      req.Email,
		},
	})
}

func (h *HandlerLayerInstance) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized: No session cookie",
		})
		return
	}

	if err := h.services.Logout(cookie.Value); err != nil {
		fmt.Println("LOGOUT ERROR:", err)
		http.Error(w, "Failed to log out", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   false, // false only in local http dev
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	util.WriteJSON(w, http.StatusOK, map[string]string{
		"message": "Logged out successfully",
	})
}

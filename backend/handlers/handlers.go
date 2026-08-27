package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
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

	// Mirrors users.first_name's and users.last_name's width.
	if len(req.FirstName) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "First name must be 50 characters or fewer",
		})
		return
	}
	if len(req.LastName) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Last name must be 50 characters or fewer",
		})
		return
	}

	// Mirrors users.email's width.
	if len(req.Email) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Email must be 100 characters or fewer",
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

	user, err := h.services.LoginUser(req.Email)
	if err != nil {
		// Generic message only: distinguishing an unknown email from any
		// other failure here would hand an unauthenticated caller an
		// oracle for which emails have accounts.
		util.WriteJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Invalid email or password",
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

// No query params -- account/year narrowing happens client-side.
func (h *HandlerLayerInstance) GetBalanceHistory(w http.ResponseWriter, r *http.Request) {
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

	history, err := h.services.GetBalanceHistory(user.ID)
	if err != nil {
		fmt.Println("GET BALANCE HISTORY ERROR:", err)
		http.Error(w, "Failed to retrieve balance history", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"history": history,
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

func (h *HandlerLayerInstance) GetCategories(w http.ResponseWriter, r *http.Request) {
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

	categories, err := h.services.GetCategories(user.ID)
	if err != nil {
		fmt.Println("GET CATEGORIES ERROR:", err)
		http.Error(w, "Failed to retrieve categories", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"categories": categories,
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

	// Double-unmarshal: distinguishes omitted flag from explicit false.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var req models.Account
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var flags struct {
		Aktiv          *bool `json:"aktiv"`
		IncludeInSaldo *bool `json:"include_in_saldo"`
	}
	if err := json.Unmarshal(body, &flags); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// UUID never comes from the client.
	req.UUID = currentUser.ID
	// Server-generated id, always overwrites any client-supplied id.
	req.ID = util.GenerateUUID()

	// Defaults match the column defaults.
	if flags.Aktiv == nil {
		req.Aktiv = true
	} else {
		req.Aktiv = *flags.Aktiv
	}
	if flags.IncludeInSaldo == nil {
		req.IncludeInSaldo = true
	} else {
		req.IncludeInSaldo = *flags.IncludeInSaldo
	}

	if req.Type == "" || req.AccountNumber == "" || req.FullName == "" || req.ShortName == "" || req.ActiveSince == "" || req.OwnerName == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Type, account number, full name, short name, saldo, active since and owner are required",
		})
		return
	}

	// Mirrors the DB CHECK constraint for a clean 400.
	if req.Type != "Haupt" && req.Type != "Anlage" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Type must be Haupt or Anlage",
		})
		return
	}

	// Column is VARCHAR(500).
	if len(req.Comment) > 500 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Comment must be 500 characters or fewer",
		})
		return
	}

	// Format gate at the boundary, not a business rule: active_since
	// forwards into a DATE column, so a value Postgres can't parse would
	// otherwise surface as a 500 instead of a clean 400.
	if _, err := time.Parse("2006-01-02", req.ActiveSince); err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Active since must be a valid date in YYYY-MM-DD format",
		})
		return
	}

	// Mirrors accounts.account_number's and accounts.short_name's width.
	if len(req.AccountNumber) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Account number must be 50 characters or fewer",
		})
		return
	}
	if len(req.ShortName) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Short name must be 50 characters or fewer",
		})
		return
	}

	// Mirrors accounts.full_name's, owner_name's and vollmacht's width.
	if len(req.FullName) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Full name must be 100 characters or fewer",
		})
		return
	}
	if len(req.OwnerName) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Owner name must be 100 characters or fewer",
		})
		return
	}
	if len(req.Vollmacht) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Vollmacht must be 100 characters or fewer",
		})
		return
	}

	// Both rate columns are DECIMAL(5, 2): an absolute value of 1000 or
	// more cannot be stored. Checked only when present -- absent is a
	// legitimate value for both. Like every gate above, this checks only
	// the shape of the submitted value, never whether a record exists or
	// who owns it -- turning a shape gate into an existence check would
	// hand back the ownership oracle the other handlers deliberately avoid.
	if req.Zinssatz != nil && math.Abs(*req.Zinssatz) >= 1000 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Zinssatz must have an absolute value below 1000",
		})
		return
	}
	if req.Basiszins != nil && math.Abs(*req.Basiszins) >= 1000 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Basiszins must have an absolute value below 1000",
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
	// Syntax gate: fail clean 400 before a bad id hits the driver.
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

	// No ownership oracle: same response either way.
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

func (h *HandlerLayerInstance) UpdateAccountFlags(w http.ResponseWriter, r *http.Request) {
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
	if _, err := uuid.Parse(vars["id"]); err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Invalid account id",
		})
		return
	}

	// Plain bool, not pointers -- always sent together, never partial.
	var req struct {
		Aktiv          bool `json:"aktiv"`
		IncludeInSaldo bool `json:"include_in_saldo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	updated, err := h.services.UpdateAccountFlags(vars["id"], currentUser.ID, req.Aktiv, req.IncludeInSaldo)
	if err != nil {
		fmt.Println("UPDATE ACCOUNT FLAGS ERROR:", err)
		http.Error(w, "Failed to update account", http.StatusInternalServerError)
		return
	}

	// No ownership oracle: same response either way.
	if !updated {
		util.WriteJSON(w, http.StatusNotFound, map[string]string{
			"error": "Account not found",
		})
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Account updated successfully",
	})
}

// Full replace (PUT); UpdateAccountFlags handles the partial toggle case.
func (h *HandlerLayerInstance) UpdateAccount(w http.ResponseWriter, r *http.Request) {
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
	if _, err := uuid.Parse(vars["id"]); err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Invalid account id",
		})
		return
	}

	// Same double-unmarshal as CreateAccount.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var req models.Account
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var flags struct {
		Aktiv          *bool `json:"aktiv"`
		IncludeInSaldo *bool `json:"include_in_saldo"`
	}
	if err := json.Unmarshal(body, &flags); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Id comes from the URL, never the body.
	req.ID = vars["id"]
	req.UUID = currentUser.ID

	if flags.Aktiv == nil {
		req.Aktiv = true
	} else {
		req.Aktiv = *flags.Aktiv
	}
	if flags.IncludeInSaldo == nil {
		req.IncludeInSaldo = true
	} else {
		req.IncludeInSaldo = *flags.IncludeInSaldo
	}

	if req.Type == "" || req.AccountNumber == "" || req.FullName == "" || req.ShortName == "" || req.ActiveSince == "" || req.OwnerName == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Type, account number, full name, short name, saldo, active since and owner are required",
		})
		return
	}

	if req.Type != "Haupt" && req.Type != "Anlage" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Type must be Haupt or Anlage",
		})
		return
	}

	if len(req.Comment) > 500 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Comment must be 500 characters or fewer",
		})
		return
	}

	// Format gate at the boundary, not a business rule: active_since
	// forwards into a DATE column.
	if _, err := time.Parse("2006-01-02", req.ActiveSince); err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Active since must be a valid date in YYYY-MM-DD format",
		})
		return
	}

	if len(req.AccountNumber) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Account number must be 50 characters or fewer",
		})
		return
	}
	if len(req.ShortName) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Short name must be 50 characters or fewer",
		})
		return
	}

	if len(req.FullName) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Full name must be 100 characters or fewer",
		})
		return
	}
	if len(req.OwnerName) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Owner name must be 100 characters or fewer",
		})
		return
	}
	if len(req.Vollmacht) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Vollmacht must be 100 characters or fewer",
		})
		return
	}

	// Both rate columns are DECIMAL(5, 2). Checked only when present --
	// absent is a legitimate value for both -- and, like every gate above,
	// checks only shape, never existence or ownership.
	if req.Zinssatz != nil && math.Abs(*req.Zinssatz) >= 1000 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Zinssatz must have an absolute value below 1000",
		})
		return
	}
	if req.Basiszins != nil && math.Abs(*req.Basiszins) >= 1000 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Basiszins must have an absolute value below 1000",
		})
		return
	}

	updated, err := h.services.UpdateAccount(currentUser.ID, req)
	if err != nil {
		fmt.Println("UPDATE ACCOUNT ERROR:", err)
		http.Error(w, "Failed to update account", http.StatusInternalServerError)
		return
	}

	// No ownership oracle: same response either way.
	if !updated {
		util.WriteJSON(w, http.StatusNotFound, map[string]string{
			"error": "Account not found",
		})
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Account updated successfully",
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

	// UUID never comes from the client.
	req.UUID = currentUser.ID

	// Trim before the required-fields check.
	req.Category = strings.TrimSpace(req.Category)

	if req.AccountID == "" || req.TransactionDate == "" || req.Category == "" || req.Description == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Account, date, category, and description are required",
		})
		return
	}

	// Format gate at the boundary, not a business rule: transaction_date
	// forwards into a DATE column.
	if _, err := time.Parse("2006-01-02", req.TransactionDate); err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Transaction date must be a valid date in YYYY-MM-DD format",
		})
		return
	}

	// Mirrors categories.name's width.
	if len(req.Category) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Category must be 50 characters or fewer",
		})
		return
	}

	if req.Amount == 0 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Amount cannot be zero",
		})
		return
	}

	// Column is VARCHAR(255); leaves room for the transfer marker.
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

	// Proves ownership of both ids and supplies short_names for transfers.
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

	// No ownership oracle: same response either way.
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
		// Sign comes from source/dest, not the typed value.
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

func (h *HandlerLayerInstance) GetTransactions(w http.ResponseWriter, r *http.Request) {
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

	var filter models.TransactionFilter

	// Empty = unfiltered. Ownership check happens in the query, not here.
	if accountID := r.URL.Query().Get("account_id"); accountID != "" {
		if _, err := uuid.Parse(accountID); err != nil {
			util.WriteJSON(w, http.StatusBadRequest, map[string]string{
				"error": "Invalid account id",
			})
			return
		}
		filter.AccountID = accountID
	}

	// Empty = unfiltered; length-only gate, not a whitelist.
	if category := r.URL.Query().Get("category"); category != "" {
		if len(category) > 50 {
			util.WriteJSON(w, http.StatusBadRequest, map[string]string{
				"error": "Category must be 50 characters or fewer",
			})
			return
		}
		filter.Category = category
	}

	transactions, err := h.services.GetTransactions(currentUser.ID, filter)
	if err != nil {
		fmt.Println("GET TRANSACTIONS ERROR:", err)
		http.Error(w, "Failed to retrieve transactions", http.StatusInternalServerError)
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"transactions": transactions,
	})
}

func (h *HandlerLayerInstance) UpdateTransaction(w http.ResponseWriter, r *http.Request) {
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
	// BIGINT identity, not a UUID -- ParseInt as syntax gate.
	transactionID, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Invalid transaction id",
		})
		return
	}

	var req models.Transaction
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	// AccountID is inert here: a transaction can't change accounts.

	// Trim before the required-fields check.
	req.Category = strings.TrimSpace(req.Category)

	if req.TransactionDate == "" || req.Category == "" || req.Description == "" {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Date, category, and description are required",
		})
		return
	}

	// Format gate at the boundary, not a business rule: transaction_date
	// forwards into a DATE column.
	if _, err := time.Parse("2006-01-02", req.TransactionDate); err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Transaction date must be a valid date in YYYY-MM-DD format",
		})
		return
	}

	// Mirrors categories.name's width.
	if len(req.Category) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Category must be 50 characters or fewer",
		})
		return
	}

	if req.Amount == 0 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Amount cannot be zero",
		})
		return
	}

	if len(req.Description) > 180 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Description must be 180 characters or fewer",
		})
		return
	}

	req.ID = transactionID

	updated, err := h.services.UpdateTransaction(currentUser.ID, req)
	if err != nil {
		fmt.Println("UPDATE TRANSACTION ERROR:", err)
		http.Error(w, "Failed to update transaction", http.StatusInternalServerError)
		return
	}

	// No ownership oracle: same response either way.
	if !updated {
		util.WriteJSON(w, http.StatusNotFound, map[string]string{
			"error": "Transaction not found",
		})
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Transaction updated successfully",
	})
}

func (h *HandlerLayerInstance) DeleteTransaction(w http.ResponseWriter, r *http.Request) {
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
	transactionID, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Invalid transaction id",
		})
		return
	}

	deleted, err := h.services.DeleteTransaction(transactionID, currentUser.ID)
	if err != nil {
		fmt.Println("DELETE TRANSACTION ERROR:", err)
		http.Error(w, "Failed to delete transaction", http.StatusInternalServerError)
		return
	}

	if !deleted {
		util.WriteJSON(w, http.StatusNotFound, map[string]string{
			"error": "Transaction not found",
		})
		return
	}

	util.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Transaction deleted successfully",
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

	// Mirrors users.first_name's and users.last_name's width.
	if len(req.FirstName) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "First name must be 50 characters or fewer",
		})
		return
	}
	if len(req.LastName) > 50 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Last name must be 50 characters or fewer",
		})
		return
	}

	// Mirrors users.email's width.
	if len(req.Email) > 100 {
		util.WriteJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Email must be 100 characters or fewer",
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

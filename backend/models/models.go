package models

type User struct {
	ID        string `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Password  string `json:"-"`
}

type Account struct {
	ID string `json:"id"`
	// Owning user; derived from the session, never the request body.
	UUID string `json:"-"`
	// Haupt or Anlage, enforced by a DB CHECK constraint.
	Type          string  `json:"type"`
	AccountNumber string  `json:"account_number"`
	FullName      string  `json:"full_name"`
	ShortName     string  `json:"short_name"`
	Saldo         float64 `json:"saldo"`
	// Plain YYYY-MM-DD; DATE column cast to text to skip lib/pq's time.Time.
	ActiveSince string `json:"active_since"`
	OwnerName   string `json:"owner_name"`
	Vollmacht   string `json:"vollmacht"`
	Aktiv       bool   `json:"aktiv"`
	// Gates this account out of the aggregate GET /balance total only.
	IncludeInSaldo bool `json:"include_in_saldo"`
	// Pointers: NULL and 0 are genuinely different for a rate.
	Zinssatz  *float64 `json:"zinssatz"`
	Basiszins *float64 `json:"basiszins"`
	Comment   string   `json:"comment"`
}

// Bearer credential; both fields json:"-" so it can never leak in a response.
type Session struct {
	SessionID string `json:"-"`
	UUID      string `json:"-"`
}

type Transaction struct {
	ID int64 `json:"id"`
	// Owning user; derived from the session, never the request body.
	UUID        string  `json:"-"`
	AccountID   string  `json:"account_id"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	// Plain YYYY-MM-DD, same reason as Account.ActiveSince.
	TransactionDate string `json:"transaction_date"`
	// Empty string means not a transfer.
	TransferToAccountID string `json:"transfer_to_account_id"`
	// Plain string, same reason as TransactionDate.
	UpdatedAt string `json:"updated_at"`
}

// An empty or nil slice means unfiltered for that field. Values within one
// field are OR-ed together (any match passes); AccountIDs and Categories are
// then AND-ed against each other. An explicitly-empty non-nil slice behaves
// identically to nil -- both mean "no constraint on this field".
type TransactionFilter struct {
	AccountIDs []string
	Categories []string
}

// One reconstructed end-of-month balance.
type BalancePoint struct {
	Month   string  `json:"month"`
	Balance float64 `json:"balance"`
}

// One account's monthly balance history plus label/drill-down metadata.
type AccountBalanceSeries struct {
	AccountID      string         `json:"account_id"`
	ShortName      string         `json:"short_name"`
	IncludeInSaldo bool           `json:"include_in_saldo"`
	Points         []BalancePoint `json:"points"`
}

// GET /balance/history payload; Total and every Accounts[i].Points share Months' length/order.
type BalanceHistory struct {
	Months   []string               `json:"months"`
	Total    []BalancePoint         `json:"total"`
	Accounts []AccountBalanceSeries `json:"accounts"`
}

// ResolvedCategory carries the canonical spelling of a submitted category
// name plus whether the repository still has to insert it. Create is set
// only on a case-insensitive miss against the user's existing categories;
// the named unique index on the categories table
// (categories_uuid_name_lower_key) remains the backstop if two requests
// race between this lookup and the repository's insert.
type ResolvedCategory struct {
	Name   string
	Create bool
}

// UserSettings carries no UUID field: the owning uuid is always a
// session-derived parameter passed alongside this struct, never a value a
// request body could populate.
type UserSettings struct {
	BalanceThreshold float64 `json:"balance_threshold"`
	ShowDecimals     bool    `json:"show_decimals"`
}

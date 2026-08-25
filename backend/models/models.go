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
	// UUID is the owning user and is derived exclusively from the session
	// cookie, never the request body: json:"-" keeps it unreachable to the
	// decoder on the way in and out of the response on the way out.
	UUID          string  `json:"-"`
	Type          string  `json:"type"`
	AccountNumber string  `json:"account_number"`
	FullName      string  `json:"full_name"`
	ShortName     string  `json:"short_name"`
	Saldo         float64 `json:"saldo"`
	// ActiveSince is a string, not time.Time, because the SELECT casts the
	// DATE column to text -- keeps the wire format a plain YYYY-MM-DD and
	// avoids lib/pq's time.Time round-trip entirely.
	ActiveSince string `json:"active_since"`
	OwnerName   string `json:"owner_name"`
	Vollmacht   string `json:"vollmacht"`
}

// Session is a bearer credential: whoever holds SessionID is logged in as
// UUID. Both fields carry json:"-" so a future handler cannot accidentally
// hand out a live session token by dropping a Session into a response.
type Session struct {
	SessionID string `json:"-"`
	UUID      string `json:"-"`
}

type Transaction struct {
	ID int64 `json:"id"`
	// UUID is the owning user and is derived exclusively from the session
	// cookie, never the request body: json:"-" keeps it unreachable to the
	// decoder on the way in and out of the response on the way out.
	UUID        string  `json:"-"`
	AccountID   string  `json:"account_id"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Category    string  `json:"category"`
	// TransactionDate is a string, not time.Time, for the same reason
	// Account.ActiveSince is: the wire format stays a plain YYYY-MM-DD and
	// lib/pq's time.Time round-trip is avoided entirely.
	TransactionDate string `json:"transaction_date"`
	// TransferToAccountID is the empty string when this booking is not a
	// transfer. There is no separate boolean flag on the wire -- this
	// single field is what makes a request a transfer.
	TransferToAccountID string `json:"transfer_to_account_id"`
}

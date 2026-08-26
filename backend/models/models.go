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
	UUID string `json:"-"`
	// Type is a fixed two-value classification, Haupt or Anlage, enforced
	// by the column's CHECK constraint with the handler mirroring it at
	// the API boundary. It used to be a separate free-text field alongside
	// a Category field with this same constraint -- they turned out to be
	// the same concept, so Category was dropped and its constraint moved
	// here.
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
	Aktiv       bool   `json:"aktiv"`
	// IncludeInSaldo gates the account out of the aggregate GET /balance
	// total when false. It does not gate anything else -- the account is
	// still returned in full by GET /accounts and still shown in the
	// accounts table.
	IncludeInSaldo bool `json:"include_in_saldo"`
	// Zinssatz and Basiszins are pointers because NULL and 0 are genuinely
	// different for a numeric rate -- an account with no rate at all must
	// not report an explicit 0%. Comment follows the Vollmacht precedent
	// already in this struct instead (NULLIF on the way in, COALESCE on the
	// way out): for free text there is no meaningful difference between NULL
	// and the empty string, so a pointer here would buy nothing and would
	// fork this struct's nullability style for one field.
	Zinssatz  *float64 `json:"zinssatz"`
	Basiszins *float64 `json:"basiszins"`
	Comment   string   `json:"comment"`
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
	// UpdatedAt is a string, not time.Time, for the same reason
	// TransactionDate is: the SELECT casts the column to text, keeping the
	// wire format plain and avoiding lib/pq's time.Time round-trip.
	UpdatedAt string `json:"updated_at"`
}

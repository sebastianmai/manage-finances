package models

type User struct {
	ID        string `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Password  string `json:"-"`
}

type Account struct {
	ID int64 `json:"id"`
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

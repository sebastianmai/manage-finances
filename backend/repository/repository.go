package repository

import (
	"backend/models"
	"backend/util"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

type dbConfig struct {
	host     string
	port     string
	user     string
	password string
	dbname   string
}

func LoadEnv() (*dbConfig, error) {
	cfg := &dbConfig{
		host:     os.Getenv("DB_HOST"),
		port:     os.Getenv("DB_PORT"),
		user:     os.Getenv("DB_USER"),
		password: os.Getenv("DB_PASSWORD"),
		dbname:   os.Getenv("DB_NAME"),
	}

	if cfg.host == "" ||
		cfg.port == "" ||
		cfg.user == "" ||
		cfg.dbname == "" {
		return nil, fmt.Errorf("missing required database configuration")
	}

	return cfg, nil
}

type RepositoryLayerInstance struct {
	db *sql.DB
}

var (
	repositoryInstance *RepositoryLayerInstance
	repositoryErr      error
	once               sync.Once
)

func NewRepositoryLayer() (*RepositoryLayerInstance, error) {
	once.Do(func() {
		cfg, err := LoadEnv()
		if err != nil {
			repositoryErr = err
			return
		}

		dsn := fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			cfg.host,
			cfg.port,
			cfg.user,
			cfg.password,
			cfg.dbname,
		)

		fmt.Print(dsn)

		db, err := connectToDatabase(dsn)
		if err != nil {
			repositoryErr = fmt.Errorf("failed to connect to database: %w", err)
			return
		}

		repositoryInstance = &RepositoryLayerInstance{
			db: db,
		}
	})

	return repositoryInstance, repositoryErr
}

func connectToDatabase(dsn string) (*sql.DB, error) {
	database, err := sql.Open("postgres", dsn)

	if err != nil {
		return nil, err
	}

	if err := database.Ping(); err != nil {
		_ = database.Close()
		return nil, err
	}
	fmt.Println("Connected to the database successfully")

	return database, nil
}

func (r *RepositoryLayerInstance) PutUser(UUID, firstName, lastName, email, password string) error {

	hash, err := util.HashPwd(password)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	_, err = r.db.Exec(`
		INSERT INTO users (uuid, first_name, last_name, email, password_hash)
		VALUES ($1, $2, $3, $4, $5)
	`, UUID, firstName, lastName, email, hash)

	if err != nil {
		return fmt.Errorf("inserting user: %w", err)
	}

	return nil
}

func (r *RepositoryLayerInstance) DeleteUser(email string) error {
	_, err := r.db.Exec(`
		DELETE FROM users WHERE email = $1
	`, email)

	if err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}

	return nil
}

func (r *RepositoryLayerInstance) GetAllUsers() (*sql.Rows, error) {
	users, err := r.db.Query(`
		SELECT uuid, email, password_hash FROM users
	`)
	if err != nil {
		fmt.Println("Error retrieving users:", err)
		return nil, fmt.Errorf("retrieving users: %w", err)
	}

	return users, nil

}

func (r *RepositoryLayerInstance) GetSingleUser(userID string) *models.User {

	var user models.User

	err := r.db.QueryRow(`
		SELECT uuid, first_name, last_name, email FROM users WHERE uuid = $1
	`, userID).Scan(&user.ID, &user.FirstName, &user.LastName, &user.Email)

	if err != nil {
		fmt.Println("Error retrieving user:", err)
		return nil
	}

	return &user
}

func (r *RepositoryLayerInstance) UpdateUser(userID, firstName, lastName, email string) error {
	_, err := r.db.Exec(`
		UPDATE users SET first_name = $1, last_name = $2, email = $3 WHERE uuid = $4
	`, firstName, lastName, email, userID)

	if err != nil {
		return fmt.Errorf("updating user: %w", err)
	}

	return nil
}

func (r *RepositoryLayerInstance) DeleteSession(userID string) error {
	_, err := r.db.Exec(`
		DELETE FROM sessions WHERE uuid = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("deleting session: %w", err)
	}
	return nil
}

func (r *RepositoryLayerInstance) DeleteSessionByID(sessionID string) error {
	_, err := r.db.Exec(`
		DELETE FROM sessions WHERE session_id = $1
	`, sessionID)
	if err != nil {
		return fmt.Errorf("deleting session: %w", err)
	}
	return nil
}

func (r *RepositoryLayerInstance) CreateSession(sessionID, userID string, createdAt, expiresAt time.Time) (string, error) {
	var returnedID string
	err := r.db.QueryRow(`
		INSERT INTO sessions (session_id, uuid, created_at, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING session_id
	`, sessionID, userID, createdAt, expiresAt).Scan(&returnedID)

	if err != nil {
		return "", fmt.Errorf("creating session: %w", err)
	}

	return returnedID, nil
}

func (r *RepositoryLayerInstance) GetBalanceByUser(userUUID string) (float64, error) {
	var balance float64

	err := r.db.QueryRow(`
		SELECT COALESCE(SUM(saldo), 0)::float8 FROM accounts WHERE uuid = $1
	`, userUUID).Scan(&balance)

	if err != nil {
		return 0, fmt.Errorf("retrieving balance: %w", err)
	}

	return balance, nil
}

func (r *RepositoryLayerInstance) GetAccountsByUser(userUUID string) ([]models.Account, error) {
	rows, err := r.db.Query(`
		SELECT account_id, type, account_number, full_name, short_name,
			saldo::float8, active_since::text, owner_name, COALESCE(vollmacht, '')
		FROM accounts WHERE uuid = $1 ORDER BY active_since ASC, full_name ASC
	`, userUUID)
	if err != nil {
		return nil, fmt.Errorf("retrieving accounts: %w", err)
	}
	defer rows.Close()

	accounts := []models.Account{}
	for rows.Next() {
		var account models.Account
		if err := rows.Scan(
			&account.ID,
			&account.Type,
			&account.AccountNumber,
			&account.FullName,
			&account.ShortName,
			&account.Saldo,
			&account.ActiveSince,
			&account.OwnerName,
			&account.Vollmacht,
		); err != nil {
			return nil, fmt.Errorf("scanning account: %w", err)
		}
		accounts = append(accounts, account)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating accounts: %w", err)
	}

	return accounts, nil
}

// CreateAccount takes a models.Account rather than nine positional
// parameters: eight adjacent same-typed string arguments is a silent-swap
// hazard, and the style guide ranks clarity above consistency with PutUser's
// positional shape.
func (r *RepositoryLayerInstance) CreateAccount(account models.Account) error {
	_, err := r.db.Exec(`
		INSERT INTO accounts (uuid, type, account_number, full_name, short_name, saldo, active_since, owner_name, vollmacht)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''))
	`,
		account.UUID,
		account.Type,
		account.AccountNumber,
		account.FullName,
		account.ShortName,
		account.Saldo,
		account.ActiveSince,
		account.OwnerName,
		account.Vollmacht,
	)

	if err != nil {
		return fmt.Errorf("inserting account: %w", err)
	}

	return nil
}

// DeleteAccount enforces ownership in the WHERE clause rather than a
// separate Go-side check: a delete that matches nothing is reported
// identically whether the row is absent or owned by someone else.
func (r *RepositoryLayerInstance) DeleteAccount(accountID int64, userUUID string) (bool, error) {
	result, err := r.db.Exec(`
		DELETE FROM accounts WHERE account_id = $1 AND uuid = $2
	`, accountID, userUUID)

	if err != nil {
		return false, fmt.Errorf("deleting account: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("deleting account: %w", err)
	}

	return rowsAffected > 0, nil
}

// CreateBooking posts one or two transaction legs (two only for a transfer)
// and their matching saldo updates inside a single sql.Tx: either every leg
// lands, or none does. The caller has already decided each leg's sign; this
// method just posts what it is given, atomically.
func (r *RepositoryLayerInstance) CreateBooking(legs []models.Transaction) (err error) {
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("beginning booking transaction: %w", err)
	}

	// Rolls back only when the named return err is non-nil at the time this
	// closure runs. err must stay a named return and must never be shadowed
	// with := anywhere in this function -- either mistake would leave this
	// check looking at a nil err after a failed leg and silently skip the
	// rollback, committing half a transfer. After a successful Commit, err
	// is nil here and this is a no-op; if Commit itself fails, Rollback on
	// an already-finished tx returns sql.ErrTxDone, which is expected and
	// intentionally discarded.
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	for _, leg := range legs {
		if _, err = tx.Exec(`
			INSERT INTO transactions (uuid, account_id, amount, description, category, transaction_date)
			VALUES ($1, $2, $3, $4, $5, $6::date)
		`, leg.UUID, leg.AccountID, leg.Amount, leg.Description, leg.Category, leg.TransactionDate); err != nil {
			err = fmt.Errorf("inserting transaction: %w", err)
			return err
		}

		var result sql.Result
		result, err = tx.Exec(`
			UPDATE accounts SET saldo = saldo + $1 WHERE account_id = $2 AND uuid = $3
		`, leg.Amount, leg.AccountID, leg.UUID)
		if err != nil {
			err = fmt.Errorf("updating account saldo: %w", err)
			return err
		}

		var rowsAffected int64
		rowsAffected, err = result.RowsAffected()
		if err != nil {
			err = fmt.Errorf("checking saldo update result: %w", err)
			return err
		}

		// The uuid condition in the WHERE clause above is not redundant
		// with the handler's ownership check -- it is the last line of
		// defence at the exact statement that mutates money. A zero-row
		// result here means the account id and uuid did not match
		// together, and this turns that silent no-op into a rolled-back
		// error instead of a booking that "succeeded" without moving money.
		if rowsAffected != 1 {
			err = fmt.Errorf("updating account saldo: expected 1 row affected, got %d", rowsAffected)
			return err
		}
	}

	if err = tx.Commit(); err != nil {
		err = fmt.Errorf("committing booking transaction: %w", err)
		return err
	}

	return nil
}

func (r *RepositoryLayerInstance) GetAllSessions() (*sql.Rows, error) {
	sessions, err := r.db.Query(`
		SELECT session_id, uuid, created_at, expires_at FROM sessions
	`)
	if err != nil {
		fmt.Println("Error retrieving sessions:", err)
		return nil, fmt.Errorf("retrieving sessions: %w", err)
	}

	return sessions, nil
}

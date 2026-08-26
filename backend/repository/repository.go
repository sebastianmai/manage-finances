package repository

import (
	"backend/models"
	"backend/util"
	"database/sql"
	"errors"
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

	// These limits are a backstop against a connection pool growing
	// unbounded, not a substitute for closing every cursor the repository
	// opens. Applied on top of code that already returns its connections
	// they simply cap steady-state usage; applied to code that still leaked
	// connections they would convert an unbounded leak into a hard deadlock
	// instead -- every query blocking on the pool once the cap is reached.
	// 25 is comfortably below Postgres's default max_connections of 100,
	// leaving room for psql and pgadmin alongside a single backend instance.
	database.SetMaxOpenConns(25)
	database.SetMaxIdleConns(25)
	database.SetConnMaxLifetime(5 * time.Minute)

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

// GetAllUsers scans every column into models.User rather than the three the
// caller happens to need today. Scanning a subset would leave FirstName and
// LastName silently empty on a struct that otherwise looks fully populated --
// GetSingleUser already returns a fully populated *models.User, and two
// differently-partial shapes of the same type circulating in one package
// costs more clarity than two extra text columns cost performance.
// Password carries json:"-", so widening the scan cannot put a hash on the
// wire.
func (r *RepositoryLayerInstance) GetAllUsers() ([]models.User, error) {
	rows, err := r.db.Query(`
		SELECT uuid, first_name, last_name, email, password_hash FROM users
	`)
	if err != nil {
		return nil, fmt.Errorf("retrieving users: %w", err)
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		var user models.User
		if err := rows.Scan(
			&user.ID,
			&user.FirstName,
			&user.LastName,
			&user.Email,
			&user.Password,
		); err != nil {
			return nil, fmt.Errorf("scanning user: %w", err)
		}
		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating users: %w", err)
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

func (r *RepositoryLayerInstance) GetAccountsByUser(userUUID string) ([]models.Account, error) {
	rows, err := r.db.Query(`
		SELECT account_id, type, account_number, full_name, short_name,
			saldo::float8, active_since::text, owner_name, COALESCE(vollmacht, ''),
			aktiv, include_in_saldo, zinssatz::float8, basiszins::float8,
			COALESCE(comment, '')
		FROM accounts WHERE uuid = $1 ORDER BY active_since ASC, full_name ASC
	`, userUUID)
	if err != nil {
		return nil, fmt.Errorf("retrieving accounts: %w", err)
	}
	defer rows.Close()

	accounts := []models.Account{}
	for rows.Next() {
		var account models.Account
		// zinssatz/basiszins are declared here, inside the loop body, rather
		// than hoisted above it: the code below takes their address, and a
		// single declaration hoisted above the loop would leave every
		// returned account's Zinssatz pointer aliasing the same variable --
		// every row would report the last row's rate. Go gives the loop body
		// a fresh variable per iteration, which is what makes this safe.
		var zinssatz, basiszins sql.NullFloat64
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
			&account.Aktiv,
			&account.IncludeInSaldo,
			&zinssatz,
			&basiszins,
			&account.Comment,
		); err != nil {
			return nil, fmt.Errorf("scanning account: %w", err)
		}
		if zinssatz.Valid {
			account.Zinssatz = &zinssatz.Float64
		}
		if basiszins.Valid {
			account.Basiszins = &basiszins.Float64
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
		INSERT INTO accounts (
			account_id, uuid, type, account_number, full_name, short_name,
			saldo, active_since, owner_name, vollmacht, aktiv,
			include_in_saldo, zinssatz, basiszins, comment
		)
		VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, ''), $11,
			$12, $13, $14, NULLIF($15, '')
		)
	`,
		account.ID,
		account.UUID,
		account.Type,
		account.AccountNumber,
		account.FullName,
		account.ShortName,
		account.Saldo,
		account.ActiveSince,
		account.OwnerName,
		account.Vollmacht,
		account.Aktiv,
		account.IncludeInSaldo,
		// Zinssatz and Basiszins are passed as pointers directly, with no nil
		// check and no sql.NullFloat64 on the write side: database/sql's
		// default parameter converter dereferences a non-nil pointer and
		// maps a nil pointer to NULL, so a nil *float64 already produces
		// exactly the NULL this needs.
		account.Zinssatz,
		account.Basiszins,
		account.Comment,
	)

	if err != nil {
		return fmt.Errorf("inserting account: %w", err)
	}

	return nil
}

// DeleteAccount enforces ownership in the WHERE clause rather than a
// separate Go-side check: a delete that matches nothing is reported
// identically whether the row is absent or owned by someone else.
func (r *RepositoryLayerInstance) DeleteAccount(accountID string, userUUID string) (bool, error) {
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

// UpdateAccountFlags enforces ownership in the WHERE clause, matching
// DeleteAccount's pattern: an update that matches nothing is reported
// identically whether the row is absent or owned by someone else.
func (r *RepositoryLayerInstance) UpdateAccountFlags(accountID, userUUID string, aktiv, includeInSaldo bool) (bool, error) {
	result, err := r.db.Exec(`
		UPDATE accounts SET aktiv = $1, include_in_saldo = $2 WHERE account_id = $3 AND uuid = $4
	`, aktiv, includeInSaldo, accountID, userUUID)

	if err != nil {
		return false, fmt.Errorf("updating account flags: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("updating account flags: %w", err)
	}

	return rowsAffected > 0, nil
}

// UpdateAccount replaces every editable field on an existing account. It
// enforces ownership in the WHERE clause, matching DeleteAccount and
// UpdateAccountFlags: an update that matches nothing is reported identically
// whether the row is absent or owned by someone else. account_id and uuid
// are deliberately absent from the SET list -- an account cannot be moved
// to a different id or a different owner via this call.
func (r *RepositoryLayerInstance) UpdateAccount(userUUID string, account models.Account) (bool, error) {
	result, err := r.db.Exec(`
		UPDATE accounts SET
			type = $1, account_number = $2, full_name = $3, short_name = $4,
			saldo = $5, active_since = $6, owner_name = $7, vollmacht = NULLIF($8, ''),
			aktiv = $9, include_in_saldo = $10, zinssatz = $11, basiszins = $12,
			comment = NULLIF($13, '')
		WHERE account_id = $14 AND uuid = $15
	`,
		account.Type,
		account.AccountNumber,
		account.FullName,
		account.ShortName,
		account.Saldo,
		account.ActiveSince,
		account.OwnerName,
		account.Vollmacht,
		account.Aktiv,
		account.IncludeInSaldo,
		account.Zinssatz,
		account.Basiszins,
		account.Comment,
		account.ID,
		userUUID,
	)

	if err != nil {
		return false, fmt.Errorf("updating account: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("updating account: %w", err)
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

// GetTransactionsByUser follows GetAccountsByUser's shape exactly.
// description and category are nullable columns, hence the COALESCE -- the
// same treatment GetAccountsByUser gives vollmacht. transaction_date is
// narrowed to plain YYYY-MM-DD, which is both the wire format
// Account.ActiveSince already uses and exactly what an <input type="date">
// accepts. The transaction_id tiebreaker on ORDER BY makes the order total,
// so the default view is stable across refetches.
func (r *RepositoryLayerInstance) GetTransactionsByUser(userUUID string) ([]models.Transaction, error) {
	rows, err := r.db.Query(`
		SELECT transaction_id, account_id, amount::float8, COALESCE(description, ''),
			COALESCE(category, ''), transaction_date::date::text, updated_at::text
		FROM transactions WHERE uuid = $1
		ORDER BY transaction_date DESC, transaction_id DESC
	`, userUUID)
	if err != nil {
		return nil, fmt.Errorf("retrieving transactions: %w", err)
	}
	defer rows.Close()

	transactions := []models.Transaction{}
	for rows.Next() {
		var transaction models.Transaction
		if err := rows.Scan(
			&transaction.ID,
			&transaction.AccountID,
			&transaction.Amount,
			&transaction.Description,
			&transaction.Category,
			&transaction.TransactionDate,
			&transaction.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning transaction: %w", err)
		}
		transactions = append(transactions, transaction)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating transactions: %w", err)
	}

	return transactions, nil
}

// UpdateTransaction takes a models.Transaction rather than positional
// parameters for the reason already documented on CreateAccount:
// description, category and transactionDate are three adjacent same-typed
// strings and a silent swap between them is worse than the extra type.
// txn.ID carries which row; the editable fields carry the new values. It is
// atomic and follows CreateBooking's idiom precisely -- err is a named
// return, a deferred rollback guard sits right after Begin, and err is
// never shadowed with := anywhere in the body.
func (r *RepositoryLayerInstance) UpdateTransaction(userUUID string, txn models.Transaction) (updated bool, err error) {
	tx, err := r.db.Begin()
	if err != nil {
		return false, fmt.Errorf("beginning update transaction: %w", err)
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	var accountID string
	var oldAmount float64
	// FOR UPDATE holds the row for the rest of the transaction so a
	// concurrent edit cannot read the same oldAmount and apply a second
	// delta against it. Ownership lives in this WHERE clause, matching
	// DeleteAccount.
	err = tx.QueryRow(`
		SELECT account_id, amount::float8 FROM transactions
		WHERE transaction_id = $1 AND uuid = $2 FOR UPDATE
	`, txn.ID, userUUID).Scan(&accountID, &oldAmount)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// The row is absent or owned by someone else -- report both
			// identically. The deferred guard above cannot cover this path:
			// returning nil for the named err before the defer runs would
			// make the guard see a nil err and skip the rollback, leaking
			// an open transaction out of the pool. Roll back explicitly.
			_ = tx.Rollback()
			return false, nil
		}
		err = fmt.Errorf("locking transaction row: %w", err)
		return false, err
	}

	// account_id is deliberately absent from the SET list -- a transaction
	// cannot be moved between accounts, and leaving the column out of the
	// statement is what makes that true no matter what a client sends.
	// updated_at is stamped here in the statement rather than by a database
	// trigger, because this codebase does every write explicitly in Go/SQL
	// and has no triggers anywhere.
	if _, err = tx.Exec(`
		UPDATE transactions
		SET description = $1, category = $2, transaction_date = $3::date, amount = $4, updated_at = CURRENT_TIMESTAMP
		WHERE transaction_id = $5 AND uuid = $6
	`, txn.Description, txn.Category, txn.TransactionDate, txn.Amount, txn.ID, userUUID); err != nil {
		err = fmt.Errorf("updating transaction: %w", err)
		return false, err
	}

	// Applying the delta, not the new amount, is the whole point of
	// reading oldAmount first.
	delta := txn.Amount - oldAmount

	var result sql.Result
	result, err = tx.Exec(`
		UPDATE accounts SET saldo = saldo + $1 WHERE account_id = $2 AND uuid = $3
	`, delta, accountID, userUUID)
	if err != nil {
		err = fmt.Errorf("updating account saldo: %w", err)
		return false, err
	}

	var rowsAffected int64
	rowsAffected, err = result.RowsAffected()
	if err != nil {
		err = fmt.Errorf("checking saldo update result: %w", err)
		return false, err
	}

	// The uuid condition in the WHERE clause above is the last line of
	// defence at the statement that moves money -- a zero-row result must
	// become a rolled-back error rather than a silent no-op, matching
	// CreateBooking's reasoning.
	if rowsAffected != 1 {
		err = fmt.Errorf("updating account saldo: expected 1 row affected, got %d", rowsAffected)
		return false, err
	}

	if err = tx.Commit(); err != nil {
		err = fmt.Errorf("committing update transaction: %w", err)
		return false, err
	}

	return true, nil
}

// DeleteTransaction is the same shape as UpdateTransaction: the same named-
// return guard, the same explicit-rollback-on-not-found branch, and the
// same RowsAffected != 1 check, reversing exactly the deleted row's
// contribution to the linked account's saldo.
func (r *RepositoryLayerInstance) DeleteTransaction(transactionID int64, userUUID string) (deleted bool, err error) {
	tx, err := r.db.Begin()
	if err != nil {
		return false, fmt.Errorf("beginning delete transaction: %w", err)
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	var accountID string
	var amount float64
	err = tx.QueryRow(`
		SELECT account_id, amount::float8 FROM transactions
		WHERE transaction_id = $1 AND uuid = $2 FOR UPDATE
	`, transactionID, userUUID).Scan(&accountID, &amount)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Same not-found handling as UpdateTransaction: explicit
			// rollback because the deferred guard cannot see a nil err on
			// this path.
			_ = tx.Rollback()
			return false, nil
		}
		err = fmt.Errorf("locking transaction row: %w", err)
		return false, err
	}

	if _, err = tx.Exec(`
		DELETE FROM transactions WHERE transaction_id = $1 AND uuid = $2
	`, transactionID, userUUID); err != nil {
		err = fmt.Errorf("deleting transaction: %w", err)
		return false, err
	}

	var result sql.Result
	result, err = tx.Exec(`
		UPDATE accounts SET saldo = saldo - $1 WHERE account_id = $2 AND uuid = $3
	`, amount, accountID, userUUID)
	if err != nil {
		err = fmt.Errorf("updating account saldo: %w", err)
		return false, err
	}

	var rowsAffected int64
	rowsAffected, err = result.RowsAffected()
	if err != nil {
		err = fmt.Errorf("checking saldo update result: %w", err)
		return false, err
	}

	if rowsAffected != 1 {
		err = fmt.Errorf("updating account saldo: expected 1 row affected, got %d", rowsAffected)
		return false, err
	}

	if err = tx.Commit(); err != nil {
		err = fmt.Errorf("committing delete transaction: %w", err)
		return false, err
	}

	return true, nil
}

func (r *RepositoryLayerInstance) GetAllSessions() ([]models.Session, error) {
	rows, err := r.db.Query(`
		SELECT session_id, uuid FROM sessions
	`)
	if err != nil {
		return nil, fmt.Errorf("retrieving sessions: %w", err)
	}
	defer rows.Close()

	sessions := []models.Session{}
	for rows.Next() {
		var session models.Session
		if err := rows.Scan(&session.SessionID, &session.UUID); err != nil {
			return nil, fmt.Errorf("scanning session: %w", err)
		}
		sessions = append(sessions, session)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating sessions: %w", err)
	}

	return sessions, nil
}

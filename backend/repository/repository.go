package repository

import (
	"backend/models"
	"backend/util"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
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

// Must stay in sync with migration 005_categories.sql's seed list.
var defaultCategories = []string{
	"Groceries",
	"Housing",
	"Transportation",
	"Utilities",
	"Entertainment",
	"Health",
	"Dining",
	"Savings",
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

	// Backstop against an unbounded connection pool.
	database.SetMaxOpenConns(25)
	database.SetMaxIdleConns(25)
	database.SetConnMaxLifetime(5 * time.Minute)

	fmt.Println("Connected to the database successfully")

	return database, nil
}

// Transactional: user row and starter categories commit or roll back together.
func (r *RepositoryLayerInstance) PutUser(UUID, firstName, lastName, email, password string) (err error) {

	hash, err := util.HashPwd(password)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("beginning user creation transaction: %w", err)
	}

	// Rolls back only if named return err is non-nil; never shadow err with :=.
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(`
		INSERT INTO users (uuid, first_name, last_name, email, password_hash)
		VALUES ($1, $2, $3, $4, $5)
	`, UUID, firstName, lastName, email, hash); err != nil {
		err = fmt.Errorf("inserting user: %w", err)
		return err
	}

	for _, name := range defaultCategories {
		if _, err = tx.Exec(`
			INSERT INTO categories (uuid, name) VALUES ($1, $2)
		`, UUID, name); err != nil {
			err = fmt.Errorf("seeding default category: %w", err)
			return err
		}
	}

	if err = tx.Commit(); err != nil {
		err = fmt.Errorf("committing user creation transaction: %w", err)
		return err
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

// Scans every column, not just what today's caller needs, for a consistent shape.
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
		// Declared per-iteration so pointers below don't alias across rows.
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

// Takes a struct, not positional args -- avoids a same-typed-string swap hazard.
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
		// Nil *float64 already maps to NULL via database/sql's converter.
		account.Zinssatz,
		account.Basiszins,
		account.Comment,
	)

	if err != nil {
		return fmt.Errorf("inserting account: %w", err)
	}

	return nil
}

// Ownership enforced in the WHERE clause: no ownership oracle.
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

// Ownership enforced in the WHERE clause: no ownership oracle.
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

// Full replace; ownership enforced in the WHERE clause, id/uuid never in SET.
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

// Returns the canonical spelling, creating the row only on a case-insensitive miss.
func (r *RepositoryLayerInstance) resolveCategory(tx *sql.Tx, userUUID, name string) (string, error) {
	trimmed := strings.TrimSpace(name)

	var stored string
	err := tx.QueryRow(`
		SELECT name FROM categories WHERE uuid = $1 AND lower(name) = lower($2)
	`, userUUID, trimmed).Scan(&stored)
	if err == nil {
		return stored, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("looking up category: %w", err)
	}

	// No match yet: insert. Unique index is the race backstop.
	if err := tx.QueryRow(`
		INSERT INTO categories (uuid, name) VALUES ($1, $2) RETURNING name
	`, userUUID, trimmed).Scan(&stored); err != nil {
		return "", fmt.Errorf("inserting category: %w", err)
	}

	return stored, nil
}

// Posts one or two legs and their saldo updates atomically.
func (r *RepositoryLayerInstance) CreateBooking(legs []models.Transaction) (err error) {
	if len(legs) == 0 {
		return fmt.Errorf("creating booking: no legs supplied")
	}

	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("beginning booking transaction: %w", err)
	}

	// Rolls back only if named return err is non-nil; never shadow err with :=.
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// Resolved once against the first leg; both legs share one category.
	var category string
	category, err = r.resolveCategory(tx, legs[0].UUID, legs[0].Category)
	if err != nil {
		err = fmt.Errorf("resolving category: %w", err)
		return err
	}

	for _, leg := range legs {
		if _, err = tx.Exec(`
			INSERT INTO transactions (uuid, account_id, amount, description, category, transaction_date)
			VALUES ($1, $2, $3, $4, $5, $6::date)
		`, leg.UUID, leg.AccountID, leg.Amount, leg.Description, category, leg.TransactionDate); err != nil {
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

		// Last line of defence at the statement that moves money.
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

// Pure function so placeholder numbering is unit-testable without a DB.
func buildTransactionFilterClause(filter models.TransactionFilter, nextIndex int) (string, []any) {
	var clause strings.Builder
	var args []any
	index := nextIndex

	if filter.AccountID != "" {
		fmt.Fprintf(&clause, " AND account_id = $%d", index)
		args = append(args, filter.AccountID)
		index++
	}

	// Appended after account so placeholder numbering matches arg order.
	if filter.Category != "" {
		fmt.Fprintf(&clause, " AND category = $%d", index)
		args = append(args, filter.Category)
		index++
	}

	return clause.String(), args
}

// uuid = $1 stays first and unconditional; filter only narrows further.
func (r *RepositoryLayerInstance) GetTransactionsByUser(userUUID string, filter models.TransactionFilter) ([]models.Transaction, error) {
	whereClause, filterArgs := buildTransactionFilterClause(filter, 2)

	args := append([]any{userUUID}, filterArgs...)

	query := `
		SELECT transaction_id, account_id, amount::float8, COALESCE(description, ''),
			COALESCE(category, ''), transaction_date::date::text, updated_at::text
		FROM transactions WHERE uuid = $1` + whereClause + `
		ORDER BY transaction_date DESC, transaction_id DESC
	`

	rows, err := r.db.Query(query, args...)
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

// Takes a struct, not positional args, for the same reason as CreateAccount.
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
	// FOR UPDATE prevents a concurrent edit from racing on oldAmount.
	err = tx.QueryRow(`
		SELECT account_id, amount::float8 FROM transactions
		WHERE transaction_id = $1 AND uuid = $2 FOR UPDATE
	`, txn.ID, userUUID).Scan(&accountID, &oldAmount)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Explicit rollback: deferred guard can't see a nil err here.
			_ = tx.Rollback()
			return false, nil
		}
		err = fmt.Errorf("locking transaction row: %w", err)
		return false, err
	}

	var category string
	category, err = r.resolveCategory(tx, userUUID, txn.Category)
	if err != nil {
		err = fmt.Errorf("resolving category: %w", err)
		return false, err
	}

	// account_id absent from SET: a transaction can't change accounts.
	if _, err = tx.Exec(`
		UPDATE transactions
		SET description = $1, category = $2, transaction_date = $3::date, amount = $4, updated_at = CURRENT_TIMESTAMP
		WHERE transaction_id = $5 AND uuid = $6
	`, txn.Description, category, txn.TransactionDate, txn.Amount, txn.ID, userUUID); err != nil {
		err = fmt.Errorf("updating transaction: %w", err)
		return false, err
	}

	// Delta, not new amount, applied against saldo.
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

	// Last line of defence at the statement that moves money.
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

// Same shape as UpdateTransaction; reverses the row's saldo contribution.
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
			// Explicit rollback: deferred guard can't see a nil err here.
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

// Scan-only shape between GetMonthlyBalancesByUser and groupMonthlyBalanceRows.
type monthlyBalanceRow struct {
	AccountID      string
	ShortName      string
	IncludeInSaldo bool
	Month          string
	Balance        float64
}

// Reconstructs a true end-of-month balance per account from saldo + history.
func (r *RepositoryLayerInstance) GetMonthlyBalancesByUser(userUUID string) ([]string, []models.AccountBalanceSeries, error) {
	rows, err := r.db.Query(`
		WITH bounds AS (
			-- LEAST/GREATEST skip NULLs; degrades to empty history cleanly.
			SELECT
				LEAST(
					(SELECT date_trunc('month', MIN(active_since))::date FROM accounts WHERE uuid = $1),
					(SELECT date_trunc('month', MIN(transaction_date))::date FROM transactions WHERE uuid = $1)
				) AS first_month,
				GREATEST(
					date_trunc('month', CURRENT_DATE)::date,
					(SELECT date_trunc('month', MAX(transaction_date))::date FROM transactions WHERE uuid = $1),
					(SELECT date_trunc('month', MAX(active_since))::date FROM accounts WHERE uuid = $1)
				) AS last_month
		),
		months AS (
			SELECT generate_series(first_month, last_month, interval '1 month')::date AS month FROM bounds
		),
		acct AS (
			-- opening = saldo minus all current transaction amounts.
			SELECT
				a.account_id,
				a.short_name,
				a.include_in_saldo,
				a.saldo - COALESCE(
					(SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.account_id AND t.uuid = a.uuid),
					0
				) AS opening
			FROM accounts a
			WHERE a.uuid = $1
		),
		deltas AS (
			SELECT account_id, date_trunc('month', transaction_date)::date AS month, SUM(amount) AS delta
			FROM transactions
			WHERE uuid = $1
			GROUP BY account_id, date_trunc('month', transaction_date)
		)
		-- CROSS JOIN + COALESCE(delta, 0) carries balance forward for gap months.
		SELECT
			a.account_id,
			a.short_name,
			a.include_in_saldo,
			to_char(m.month, 'YYYY-MM') AS month,
			(a.opening + SUM(COALESCE(d.delta, 0)) OVER (
				PARTITION BY a.account_id ORDER BY m.month
				ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
			))::float8 AS balance
		FROM acct a
		CROSS JOIN months m
		LEFT JOIN deltas d ON d.account_id = a.account_id AND d.month = m.month
		ORDER BY a.short_name ASC, a.account_id ASC, m.month ASC
	`, userUUID)
	if err != nil {
		return nil, nil, fmt.Errorf("retrieving monthly balances: %w", err)
	}
	defer rows.Close()

	balanceRows := []monthlyBalanceRow{}
	for rows.Next() {
		var row monthlyBalanceRow
		if err := rows.Scan(
			&row.AccountID,
			&row.ShortName,
			&row.IncludeInSaldo,
			&row.Month,
			&row.Balance,
		); err != nil {
			return nil, nil, fmt.Errorf("scanning monthly balance: %w", err)
		}
		balanceRows = append(balanceRows, row)
	}

	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterating monthly balances: %w", err)
	}

	months, series := groupMonthlyBalanceRows(balanceRows)
	return months, series, nil
}

// Pure function so grouping is unit-testable without a live Postgres.
func groupMonthlyBalanceRows(rows []monthlyBalanceRow) ([]string, []models.AccountBalanceSeries) {
	// Empty literals, not nil: nil marshals to JSON null.
	months := []string{}
	series := []models.AccountBalanceSeries{}

	seenMonths := map[string]bool{}
	seriesIndex := map[string]int{}

	for _, row := range rows {
		if !seenMonths[row.Month] {
			seenMonths[row.Month] = true
			months = append(months, row.Month)
		}

		idx, ok := seriesIndex[row.AccountID]
		if !ok {
			series = append(series, models.AccountBalanceSeries{
				AccountID:      row.AccountID,
				ShortName:      row.ShortName,
				IncludeInSaldo: row.IncludeInSaldo,
				Points:         []models.BalancePoint{},
			})
			idx = len(series) - 1
			seriesIndex[row.AccountID] = idx
		}

		series[idx].Points = append(series[idx].Points, models.BalancePoint{
			Month:   row.Month,
			Balance: row.Balance,
		})
	}

	return months, series
}

// Returns bare names; the surrogate id is a storage detail no client needs.
func (r *RepositoryLayerInstance) GetCategoriesByUser(userUUID string) ([]string, error) {
	rows, err := r.db.Query(`
		SELECT name FROM categories WHERE uuid = $1 ORDER BY name ASC
	`, userUUID)
	if err != nil {
		return nil, fmt.Errorf("retrieving categories: %w", err)
	}
	defer rows.Close()

	categories := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scanning category: %w", err)
		}
		categories = append(categories, name)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating categories: %w", err)
	}

	return categories, nil
}

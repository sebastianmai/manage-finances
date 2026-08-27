package services

import (
	"backend/models"
	"backend/repository"
	"fmt"
	"math"
	"sync"
	"time"
)

type ServiceLayerInstance struct {
	repository *repository.RepositoryLayerInstance
}

var (
	serviceInstance *ServiceLayerInstance
	serviceOnce     sync.Once
)

type User struct {
	ID       string
	Email    string
	Password string
}

func NewServiceLayer(r *repository.RepositoryLayerInstance) *ServiceLayerInstance {
	serviceOnce.Do(func() {
		serviceInstance = &ServiceLayerInstance{
			repository: r,
		}
	})
	return serviceInstance
}

func (s *ServiceLayerInstance) CreateUser(UUID, firstName, lastName, email, password string) error {
	return s.repository.PutUser(UUID, firstName, lastName, email, password)
}

func (s *ServiceLayerInstance) LoginUser(email string) (*User, error) {

	users, err := s.repository.GetAllUsers()
	if err != nil {
		return nil, fmt.Errorf("retrieving users: %w", err)
	}

	for _, user := range users {
		if user.Email == email {
			return &User{
				ID:       user.ID,
				Email:    user.Email,
				Password: user.Password,
			}, nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

func (s *ServiceLayerInstance) CreateSession(sessionID, userID string, createdAt, expiresAt time.Time) (string, error) {
	if err := s.repository.DeleteSession(userID); err != nil {
		return "", fmt.Errorf("deleting existing session: %w", err)
	}

	sessionID, err := s.repository.CreateSession(sessionID, userID, createdAt, expiresAt)

	if err != nil {
		return "", fmt.Errorf("creating new session: %w", err)
	}
	return sessionID, nil
}

func (s *ServiceLayerInstance) UpdateUser(userID, firstName, lastName, email string) error {
	return s.repository.UpdateUser(userID, firstName, lastName, email)
}

func (s *ServiceLayerInstance) Logout(sessionID string) error {
	return s.repository.DeleteSessionByID(sessionID)
}

// GetBalance sums Saldo across the user's accounts in Go rather than asking
// Postgres for SUM(saldo). The database column is numeric(10,2), summed
// exactly server-side; GetAccountsByUser already casts each row to float8
// before this function ever sees it, so every intermediate here is a
// float64 approximation and naively summing them can drift off the
// two-decimal domain (0.10 + 0.20 becomes 0.30000000000000004 rather than
// 0.3). Rounding to two decimals restores exact parity with the column's own
// domain: the true sum is always a two-decimal quantity, so the float64
// result is always within ~1e-13 of it, multiplying by 100 lands within
// ~1e-11 of an integer, and math.Round recovers that integer exactly.
// Accounts flagged out of the saldo are skipped from this total only --
// they are still returned in full by GetAccountsByUser/GET /accounts and
// still shown in the accounts table.
func (s *ServiceLayerInstance) GetBalance(userUUID string) (float64, error) {
	accounts, err := s.repository.GetAccountsByUser(userUUID)
	if err != nil {
		return 0, fmt.Errorf("retrieving balance: %w", err)
	}

	var sum float64
	for _, account := range accounts {
		if !account.IncludeInSaldo {
			continue
		}
		sum += account.Saldo
	}

	return math.Round(sum*100) / 100, nil
}

func (s *ServiceLayerInstance) GetAccounts(userUUID string) ([]models.Account, error) {
	return s.repository.GetAccountsByUser(userUUID)
}

func (s *ServiceLayerInstance) CreateAccount(account models.Account) error {
	return s.repository.CreateAccount(account)
}

func (s *ServiceLayerInstance) DeleteAccount(accountID string, userUUID string) (bool, error) {
	return s.repository.DeleteAccount(accountID, userUUID)
}

func (s *ServiceLayerInstance) UpdateAccountFlags(accountID, userUUID string, aktiv, includeInSaldo bool) (bool, error) {
	return s.repository.UpdateAccountFlags(accountID, userUUID, aktiv, includeInSaldo)
}

func (s *ServiceLayerInstance) UpdateAccount(userUUID string, account models.Account) (bool, error) {
	return s.repository.UpdateAccount(userUUID, account)
}

func (s *ServiceLayerInstance) CreateBooking(legs []models.Transaction) error {
	return s.repository.CreateBooking(legs)
}

func (s *ServiceLayerInstance) GetTransactions(userUUID string, filter models.TransactionFilter) ([]models.Transaction, error) {
	return s.repository.GetTransactionsByUser(userUUID, filter)
}

func (s *ServiceLayerInstance) GetCategories(userUUID string) ([]string, error) {
	return s.repository.GetCategoriesByUser(userUUID)
}

func (s *ServiceLayerInstance) UpdateTransaction(userUUID string, txn models.Transaction) (bool, error) {
	return s.repository.UpdateTransaction(userUUID, txn)
}

func (s *ServiceLayerInstance) DeleteTransaction(transactionID int64, userUUID string) (bool, error) {
	return s.repository.DeleteTransaction(transactionID, userUUID)
}

// GetBalanceHistory assembles the GET /balance/history payload: Months and
// Accounts come straight from the repository's reconstruction, and Total is
// derived here by totalSeries so the "total balance" gating rule lives in
// one place, shared with GetBalance.
func (s *ServiceLayerInstance) GetBalanceHistory(userUUID string) (models.BalanceHistory, error) {
	months, accounts, err := s.repository.GetMonthlyBalancesByUser(userUUID)
	if err != nil {
		return models.BalanceHistory{}, fmt.Errorf("retrieving balance history: %w", err)
	}

	return models.BalanceHistory{
		Months:   months,
		Total:    totalSeries(months, accounts),
		Accounts: accounts,
	}, nil
}

// totalSeries sums each month's balance across every account flagged
// IncludeInSaldo. Three things are worth stating explicitly:
//
// (1) It gates on IncludeInSaldo because that is already what "total
// balance" means everywhere else in this app -- GetBalance does the same,
// and a Total line that disagreed with the Home page's headline number
// would read as a bug. Excluded accounts are still returned in full and
// still drillable, exactly as GetAccountsByUser still returns them.
//
// (2) The rounding is the same defence GetBalance documents at length: the
// repository hands over float64 approximations of a two-decimal column,
// naive summation drifts off that domain, and rounding to two decimals
// recovers the exact value.
//
// (3) Lookup is by month key rather than slice index so that a future
// change to the repository's ordering cannot silently misalign one
// account's history against another's -- with money, a silently-shifted
// series is worse than a loud failure.
func totalSeries(months []string, accounts []models.AccountBalanceSeries) []models.BalancePoint {
	// One month-to-balance map per included account, built once rather than
	// scanning every account's Points slice once per month.
	balancesByAccount := make([]map[string]float64, 0, len(accounts))
	for _, account := range accounts {
		if !account.IncludeInSaldo {
			continue
		}
		byMonth := make(map[string]float64, len(account.Points))
		for _, point := range account.Points {
			byMonth[point.Month] = point.Balance
		}
		balancesByAccount = append(balancesByAccount, byMonth)
	}

	total := []models.BalancePoint{}
	for _, month := range months {
		var sum float64
		for _, byMonth := range balancesByAccount {
			sum += byMonth[month]
		}
		total = append(total, models.BalancePoint{
			Month:   month,
			Balance: math.Round(sum*100) / 100,
		})
	}

	return total
}

func (s *ServiceLayerInstance) GetUserBySession(sessionID string) (*models.User, error) {
	sessions, err := s.repository.GetAllSessions()
	if err != nil {
		return nil, fmt.Errorf("retrieving user ID by session: %w", err)
	}

	for _, session := range sessions {
		if session.SessionID == sessionID {
			return s.repository.GetSingleUser(session.UUID), nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

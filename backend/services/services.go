package services

import (
	"backend/models"
	"backend/repository"
	"cmp"
	"fmt"
	"math"
	"slices"
	"strings"
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

// Sums Saldo in Go, rounded to 2dp to correct float64 summation drift.
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

// resolveCategoryName trims the submitted name and matches it
// case-insensitively against the user's existing category names, returning
// the stored spelling on the first hit -- deterministic even if the
// existing list somehow contains two names differing only by case. On a
// miss it returns the trimmed name with Create set, telling the repository
// it still has to insert the row.
func resolveCategoryName(existing []string, submitted string) models.ResolvedCategory {
	trimmed := strings.TrimSpace(submitted)
	for _, name := range existing {
		if strings.EqualFold(name, trimmed) {
			return models.ResolvedCategory{Name: name}
		}
	}
	return models.ResolvedCategory{Name: trimmed, Create: true}
}

// ResolveCategory fetches the user's existing categories and runs the
// submitted name through resolveCategoryName -- the read half of what used
// to be one repository method; the write half (insertCategory) stays
// behind because the unique index backing it is a genuine storage
// guarantee, not a filtering decision.
func (s *ServiceLayerInstance) ResolveCategory(userUUID, name string) (models.ResolvedCategory, error) {
	existing, err := s.repository.GetCategoriesByUser(userUUID)
	if err != nil {
		return models.ResolvedCategory{}, fmt.Errorf("retrieving categories: %w", err)
	}
	return resolveCategoryName(existing, name), nil
}

func (s *ServiceLayerInstance) CreateBooking(legs []models.Transaction) error {
	// Resolved once against the first leg's user and category, exactly as
	// the repository did before this split; both legs share one category.
	var resolved models.ResolvedCategory
	if len(legs) > 0 {
		var err error
		resolved, err = s.ResolveCategory(legs[0].UUID, legs[0].Category)
		if err != nil {
			return fmt.Errorf("resolving category: %w", err)
		}
	}
	return s.repository.CreateBooking(legs, resolved)
}

// filterTransactions narrows a broad fetch to a filter's account and/or
// category, in Go, rather than in the query -- deciding what a request
// returns is the service layer's job, and the row counts in this
// application are small enough that fetching broadly is not the cost the
// SQL predicate was buying. Empty filter fields mean unfiltered, per the
// contract documented on models.TransactionFilter. Only ever drops rows,
// so the caller's ordering is preserved.
func filterTransactions(transactions []models.Transaction, filter models.TransactionFilter) []models.Transaction {
	filtered := []models.Transaction{}
	for _, txn := range transactions {
		if filter.AccountID != "" && txn.AccountID != filter.AccountID {
			continue
		}
		// Case-sensitive, matching the equality predicate the retired SQL
		// used -- widening what a filter matches is a behaviour change the
		// frontend has not asked for.
		if filter.Category != "" && txn.Category != filter.Category {
			continue
		}
		filtered = append(filtered, txn)
	}
	return filtered
}

func (s *ServiceLayerInstance) GetTransactions(userUUID string, filter models.TransactionFilter) ([]models.Transaction, error) {
	transactions, err := s.repository.GetTransactionsByUser(userUUID)
	if err != nil {
		return nil, err
	}
	return filterTransactions(transactions, filter), nil
}

func (s *ServiceLayerInstance) GetCategories(userUUID string) ([]string, error) {
	return s.repository.GetCategoriesByUser(userUUID)
}

func (s *ServiceLayerInstance) UpdateTransaction(userUUID string, txn models.Transaction) (bool, error) {
	resolved, err := s.ResolveCategory(userUUID, txn.Category)
	if err != nil {
		return false, fmt.Errorf("resolving category: %w", err)
	}
	return s.repository.UpdateTransaction(userUUID, txn, resolved)
}

func (s *ServiceLayerInstance) DeleteTransaction(transactionID int64, userUUID string) (bool, error) {
	return s.repository.DeleteTransaction(transactionID, userUUID)
}

// monthKey turns a plain YYYY-MM-DD date string into a YYYY-MM month key.
// Every date entering the balance-history reconstruction goes through this,
// so a value Postgres could not have produced surfaces as an error from the
// endpoint rather than as a wrong number in a chart.
func monthKey(date string) (string, error) {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", fmt.Errorf("parsing date %q: %w", date, err)
	}
	return t.Format("2006-01"), nil
}

// monthAxis reproduces the retired SQL's bounds exactly: the first month is
// the earliest month across every account's active_since and every
// transaction's date, and the last month is the latest of the current
// month, the latest transaction's month, and the latest active_since
// month -- so the axis always reaches at least the present, and further if
// data runs ahead of it. now is a parameter, not time.Now called inline,
// so the axis is testable.
//
// An empty axis is returned when there are no accounts, because the retired
// query cross-joined its month series against the account set and
// therefore produced nothing at all for a user with no accounts -- matching
// that keeps the empty-state payload identical.
func monthAxis(accounts []models.Account, transactions []models.Transaction, now time.Time) ([]string, error) {
	axis := []string{}
	if len(accounts) == 0 {
		return axis, nil
	}

	// Zero-padded YYYY-MM keys sort lexicographically in calendar order, so
	// the bounds can be taken directly on the strings without parsing back
	// to a time.Time for every comparison.
	last := now.Format("2006-01")
	var first string
	haveFirst := false

	for _, account := range accounts {
		key, err := monthKey(account.ActiveSince)
		if err != nil {
			return nil, fmt.Errorf("parsing account active_since: %w", err)
		}
		if !haveFirst || key < first {
			first = key
			haveFirst = true
		}
		if key > last {
			last = key
		}
	}

	for _, txn := range transactions {
		key, err := monthKey(txn.TransactionDate)
		if err != nil {
			return nil, fmt.Errorf("parsing transaction date: %w", err)
		}
		if !haveFirst || key < first {
			first = key
			haveFirst = true
		}
		if key > last {
			last = key
		}
	}

	// Parsing back onto day one of the month is what makes adding a month
	// at a time safe -- AddDate on any other day risks skipping or
	// repeating a month across different month lengths.
	cursor, err := time.Parse("2006-01", first)
	if err != nil {
		return nil, fmt.Errorf("parsing axis start %q: %w", first, err)
	}
	for {
		key := cursor.Format("2006-01")
		axis = append(axis, key)
		if key >= last {
			break
		}
		cursor = cursor.AddDate(0, 1, 0)
	}

	return axis, nil
}

// accountSeries recovers each account's opening balance and walks the axis
// accumulating that account's per-month delta, emitting one point per
// month -- including months before that account's active_since, since the
// retired query did exactly that and the frontend indexes the arrays
// positionally against months.
func accountSeries(accounts []models.Account, transactions []models.Transaction, axis []string) ([]models.AccountBalanceSeries, error) {
	series := []models.AccountBalanceSeries{}
	if len(accounts) == 0 {
		return series, nil
	}

	type accountTotals struct {
		amountSum    float64
		monthlyDelta map[string]float64
	}

	// One pass over the transactions builds both the total used to recover
	// the opening balance and the per-month deltas used to walk the axis --
	// both must come from this one broad, unfiltered slice, or the anchor
	// property silently breaks.
	totalsByAccount := make(map[string]*accountTotals, len(accounts))
	for _, account := range accounts {
		totalsByAccount[account.ID] = &accountTotals{monthlyDelta: map[string]float64{}}
	}

	for _, txn := range transactions {
		totals, ok := totalsByAccount[txn.AccountID]
		if !ok {
			// A transaction naming an account outside the fetched set is
			// skipped rather than creating a phantom series.
			continue
		}
		key, err := monthKey(txn.TransactionDate)
		if err != nil {
			return nil, fmt.Errorf("parsing transaction date: %w", err)
		}
		totals.amountSum += txn.Amount
		totals.monthlyDelta[key] += txn.Amount
	}

	for _, account := range accounts {
		totals := totalsByAccount[account.ID]

		// Float64 addition is not associative, so recovering the opening
		// balance by subtraction and then adding the same amounts back in
		// a different grouping order lands a fraction of a cent away from
		// saldo. Every money column is two-decimal, so rounding to cents
		// here is lossless and is what makes the last point land exactly
		// on saldo.
		opening := math.Round((account.Saldo-totals.amountSum)*100) / 100

		points := make([]models.BalancePoint, 0, len(axis))
		running := opening
		for _, month := range axis {
			running += totals.monthlyDelta[month]
			points = append(points, models.BalancePoint{
				Month:   month,
				Balance: math.Round(running*100) / 100,
			})
		}

		series = append(series, models.AccountBalanceSeries{
			AccountID:      account.ID,
			ShortName:      account.ShortName,
			IncludeInSaldo: account.IncludeInSaldo,
			Points:         points,
		})
	}

	// Reproduces the retired query's ORDER BY short_name ASC, account_id
	// ASC -- StatisticsPage takes backend order as its stable chart-series
	// order, so this is a payload contract, not a cosmetic choice. Stable
	// so equal keys keep fetch order.
	slices.SortStableFunc(series, func(a, b models.AccountBalanceSeries) int {
		if c := cmp.Compare(a.ShortName, b.ShortName); c != 0 {
			return c
		}
		return cmp.Compare(a.AccountID, b.AccountID)
	})

	return series, nil
}

// Assembles the GET /balance/history payload; Total shares gating with GetBalance.
func (s *ServiceLayerInstance) GetBalanceHistory(userUUID string) (models.BalanceHistory, error) {
	accounts, err := s.repository.GetAccountsByUser(userUUID)
	if err != nil {
		return models.BalanceHistory{}, fmt.Errorf("retrieving accounts for balance history: %w", err)
	}

	transactions, err := s.repository.GetTransactionsByUser(userUUID)
	if err != nil {
		return models.BalanceHistory{}, fmt.Errorf("retrieving transactions for balance history: %w", err)
	}

	months, err := monthAxis(accounts, transactions, time.Now())
	if err != nil {
		return models.BalanceHistory{}, fmt.Errorf("building balance history month axis: %w", err)
	}

	series, err := accountSeries(accounts, transactions, months)
	if err != nil {
		return models.BalanceHistory{}, fmt.Errorf("building balance history series: %w", err)
	}

	return models.BalanceHistory{
		Months:   months,
		Total:    totalSeries(months, series),
		Accounts: series,
	}, nil
}

// Sums each month across IncludeInSaldo accounts; lookup by month key, not index.
func totalSeries(months []string, accounts []models.AccountBalanceSeries) []models.BalancePoint {
	// One map per included account, built once.
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

package services

import (
	"backend/models"
	"strings"
	"testing"
	"time"
)

// TestTotalSeries exercises totalSeries directly, with no database
// involved -- it is a pure function precisely so this is possible,
// following buildTransactionFilterClause's precedent in the repository
// package.
func TestTotalSeries(t *testing.T) {
	tests := []struct {
		name     string
		months   []string
		accounts []models.AccountBalanceSeries
		want     []models.BalancePoint
	}{
		{
			name:     "empty months returns an empty-but-non-nil slice",
			months:   []string{},
			accounts: []models.AccountBalanceSeries{},
			want:     []models.BalancePoint{},
		},
		{
			name:   "two accounts both included sum per month",
			months: []string{"2024-01", "2024-02"},
			accounts: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
						{Month: "2024-02", Balance: 150},
					},
				},
				{
					AccountID:      "a2",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 1000},
						{Month: "2024-02", Balance: 1000},
					},
				},
			},
			want: []models.BalancePoint{
				{Month: "2024-01", Balance: 1100},
				{Month: "2024-02", Balance: 1150},
			},
		},
		{
			name:   "an account with include_in_saldo false is excluded from every month's total",
			months: []string{"2024-01"},
			accounts: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					IncludeInSaldo: true,
					Points:         []models.BalancePoint{{Month: "2024-01", Balance: 100}},
				},
				{
					AccountID:      "a2",
					IncludeInSaldo: false,
					Points:         []models.BalancePoint{{Month: "2024-01", Balance: 99999}},
				},
			},
			want: []models.BalancePoint{
				{Month: "2024-01", Balance: 100},
			},
		},
		{
			name:   "every account excluded still produces a point per month with balance 0",
			months: []string{"2024-01", "2024-02"},
			accounts: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					IncludeInSaldo: false,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 500},
						{Month: "2024-02", Balance: 500},
					},
				},
			},
			want: []models.BalancePoint{
				{Month: "2024-01", Balance: 0},
				{Month: "2024-02", Balance: 0},
			},
		},
		{
			name:   "float drift is rounded away: 0.10 + 0.20 totals exactly 0.3",
			months: []string{"2024-01"},
			accounts: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					IncludeInSaldo: true,
					Points:         []models.BalancePoint{{Month: "2024-01", Balance: 0.10}},
				},
				{
					AccountID:      "a2",
					IncludeInSaldo: true,
					Points:         []models.BalancePoint{{Month: "2024-01", Balance: 0.20}},
				},
			},
			want: []models.BalancePoint{
				{Month: "2024-01", Balance: 0.3},
			},
		},
		{
			name:   "a month absent from one account's Points contributes 0 for that account, looked up by key not index",
			months: []string{"2024-01", "2024-02", "2024-03"},
			accounts: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
						{Month: "2024-02", Balance: 200},
						{Month: "2024-03", Balance: 300},
					},
				},
				{
					AccountID:      "a2",
					IncludeInSaldo: true,
					// Deliberately missing the 2024-02 point -- a2 opened
					// late or the row for that month is absent. This must
					// contribute 0, not shift a1's 2024-03 value into the
					// 2024-02 slot.
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 10},
						{Month: "2024-03", Balance: 30},
					},
				},
			},
			want: []models.BalancePoint{
				{Month: "2024-01", Balance: 110},
				{Month: "2024-02", Balance: 200},
				{Month: "2024-03", Balance: 330},
			},
		},
		{
			name:   "point count always equals len(months), months come out in the given order",
			months: []string{"2024-03", "2024-01", "2024-02"},
			accounts: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 1},
						{Month: "2024-02", Balance: 2},
						{Month: "2024-03", Balance: 3},
					},
				},
			},
			want: []models.BalancePoint{
				{Month: "2024-03", Balance: 3},
				{Month: "2024-01", Balance: 1},
				{Month: "2024-02", Balance: 2},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := totalSeries(tt.months, tt.accounts)

			if got == nil {
				t.Fatal("totalSeries returned nil, want empty-but-non-nil")
			}

			assertPointsEqual(t, got, tt.want)
		})
	}
}

func assertPointsEqual(t *testing.T, got, want []models.BalancePoint) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("points = %+v, want %+v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("points[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// TestMonthKey exercises monthKey directly -- a pure function precisely so
// this is possible, following TestTotalSeries's precedent.
func TestMonthKey(t *testing.T) {
	tests := []struct {
		name    string
		date    string
		want    string
		wantErr bool
	}{
		{name: "a plain YYYY-MM-DD date reduces to its YYYY-MM key", date: "2024-03-15", want: "2024-03"},
		{name: "the first of the month reduces the same way as any other day", date: "2024-12-01", want: "2024-12"},
		{name: "a malformed date returns an error rather than a wrong key", date: "not-a-date", wantErr: true},
		{name: "an empty date returns an error", date: "", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := monthKey(tt.date)

			if tt.wantErr {
				if err == nil {
					t.Fatalf("monthKey(%q) = %q, nil, want an error", tt.date, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("monthKey(%q) returned unexpected error: %v", tt.date, err)
			}
			if got != tt.want {
				t.Errorf("monthKey(%q) = %q, want %q", tt.date, got, tt.want)
			}
		})
	}
}

// TestMonthAxis exercises monthAxis directly, with no database involved --
// it is a pure function taking now as a parameter precisely so this is
// possible.
func TestMonthAxis(t *testing.T) {
	// "Current" for every case that doesn't test the year boundary --
	// chosen as a fixed reference so tests don't depend on the wall clock.
	juneNow := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name         string
		accounts     []models.Account
		transactions []models.Transaction
		now          time.Time
		want         []string
		wantErr      bool
	}{
		{
			name:     "no accounts and no transactions -> empty but non-nil axis",
			accounts: []models.Account{},
			now:      juneNow,
			want:     []string{},
		},
		{
			name: "one account active since a past month, no transactions -> axis runs through the current month inclusive",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "2024-01-10"},
			},
			now:  juneNow,
			want: []string{"2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"},
		},
		{
			name: "latest transaction older than the current month -> axis still ends at the current month",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "2024-01-01"},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", TransactionDate: "2024-02-01"},
			},
			now:  juneNow,
			want: []string{"2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"},
		},
		{
			name: "a transaction dated in a future month -> axis ends at that later month, not the current one",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "2024-01-01"},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", TransactionDate: "2024-09-01"},
			},
			now:  juneNow,
			want: []string{"2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06", "2024-07", "2024-08", "2024-09"},
		},
		{
			name: "an account's active_since predating the earliest transaction starts the axis at active_since's month",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "2023-11-05"},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", TransactionDate: "2024-01-15"},
			},
			now:  juneNow,
			want: []string{"2023-11", "2023-12", "2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"},
		},
		{
			name: "the reverse case starts the axis at the transaction's month",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "2024-03-01"},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", TransactionDate: "2023-12-20"},
			},
			now:  juneNow,
			want: []string{"2023-12", "2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"},
		},
		{
			name: "a year boundary is crossed correctly: December to January increments the year and does not repeat the month",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "2023-12-01"},
			},
			now:  time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
			want: []string{"2023-12", "2024-01"},
		},
		{
			name: "a malformed active_since returns an error rather than panicking or silently producing a wrong axis",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "not-a-date"},
			},
			now:     juneNow,
			wantErr: true,
		},
		{
			name: "a malformed transaction date returns an error",
			accounts: []models.Account{
				{ID: "a1", ActiveSince: "2024-01-01"},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", TransactionDate: "not-a-date"},
			},
			now:     juneNow,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := monthAxis(tt.accounts, tt.transactions, tt.now)

			if tt.wantErr {
				if err == nil {
					t.Fatalf("monthAxis() = %v, nil, want an error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("monthAxis() returned unexpected error: %v", err)
			}
			if got == nil {
				t.Fatal("monthAxis() returned nil, want empty-but-non-nil")
			}
			assertMonthAxisEqual(t, got, tt.want)
		})
	}
}

func assertMonthAxisEqual(t *testing.T, got, want []string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("axis = %v, want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("axis[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

// TestAccountSeries exercises accountSeries directly, with no database
// involved.
func TestAccountSeries(t *testing.T) {
	tests := []struct {
		name         string
		accounts     []models.Account
		transactions []models.Transaction
		axis         []string
		want         []models.AccountBalanceSeries
		wantErr      bool
	}{
		{
			name:     "no accounts -> empty but non-nil series, regardless of the axis",
			accounts: []models.Account{},
			axis:     []string{"2024-01", "2024-02"},
			want:     []models.AccountBalanceSeries{},
		},
		{
			name: "one account, no transactions -> one point per month, every point equal to saldo, including the first",
			accounts: []models.Account{
				{ID: "a1", ShortName: "Giro", Saldo: 100, IncludeInSaldo: true},
			},
			axis: []string{"2024-01", "2024-02", "2024-03"},
			want: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
						{Month: "2024-02", Balance: 100},
						{Month: "2024-03", Balance: 100},
					},
				},
			},
		},
		{
			name: "transactions in some months only step the balance and hold flat across the others; the first month is the recovered opening balance, not zero",
			accounts: []models.Account{
				{ID: "a1", ShortName: "Giro", Saldo: 300, IncludeInSaldo: true},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", Amount: 100, TransactionDate: "2024-02-15"},
			},
			axis: []string{"2024-01", "2024-02", "2024-03"},
			want: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 200},
						{Month: "2024-02", Balance: 300},
						{Month: "2024-03", Balance: 300},
					},
				},
			},
		},
		{
			name: "anchor: mixed positive and negative amounts across several months still land the last point on saldo exactly",
			accounts: []models.Account{
				{ID: "a1", ShortName: "Giro", Saldo: 500, IncludeInSaldo: true},
				{ID: "a2", ShortName: "Tages", Saldo: -1000, IncludeInSaldo: true},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", Amount: 200, TransactionDate: "2024-01-05"},
				{AccountID: "a1", Amount: -50, TransactionDate: "2024-03-10"},
				{AccountID: "a2", Amount: -300, TransactionDate: "2024-02-01"},
				{AccountID: "a2", Amount: 100, TransactionDate: "2024-02-15"},
			},
			axis: []string{"2024-01", "2024-02", "2024-03"},
			want: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 550},
						{Month: "2024-02", Balance: 550},
						{Month: "2024-03", Balance: 500},
					},
				},
				{
					AccountID:      "a2",
					ShortName:      "Tages",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: -800},
						{Month: "2024-02", Balance: -1000},
						{Month: "2024-03", Balance: -1000},
					},
				},
			},
		},
		{
			name: "anchor under float drift: a saldo of 0.10 against amounts of 0.20 and 0.10 still lands exactly on saldo",
			accounts: []models.Account{
				{ID: "a1", ShortName: "Giro", Saldo: 0.10, IncludeInSaldo: true},
			},
			transactions: []models.Transaction{
				{AccountID: "a1", Amount: 0.20, TransactionDate: "2024-01-01"},
				{AccountID: "a1", Amount: 0.10, TransactionDate: "2024-01-01"},
			},
			axis: []string{"2024-01"},
			want: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 0.10},
					},
				},
			},
		},
		{
			name: "density: an account still gets exactly len(axis) points even though it has no transactions across most of it",
			accounts: []models.Account{
				{ID: "a1", ShortName: "Giro", Saldo: 100, IncludeInSaldo: true},
			},
			axis: []string{"2024-01", "2024-02", "2024-03"},
			want: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
						{Month: "2024-02", Balance: 100},
						{Month: "2024-03", Balance: 100},
					},
				},
			},
		},
		{
			name: "ordering: accounts sort by short name ascending then account id ascending, regardless of fetch order",
			accounts: []models.Account{
				{ID: "z9", ShortName: "Zulu", Saldo: 0, IncludeInSaldo: true},
				{ID: "a2", ShortName: "Alpha", Saldo: 0, IncludeInSaldo: true},
				{ID: "a1", ShortName: "Alpha", Saldo: 0, IncludeInSaldo: true},
			},
			axis: []string{"2024-01"},
			want: []models.AccountBalanceSeries{
				{AccountID: "a1", ShortName: "Alpha", IncludeInSaldo: true, Points: []models.BalancePoint{{Month: "2024-01", Balance: 0}}},
				{AccountID: "a2", ShortName: "Alpha", IncludeInSaldo: true, Points: []models.BalancePoint{{Month: "2024-01", Balance: 0}}},
				{AccountID: "z9", ShortName: "Zulu", IncludeInSaldo: true, Points: []models.BalancePoint{{Month: "2024-01", Balance: 0}}},
			},
		},
		{
			name: "an account with include_in_saldo false is present in the series with a complete set of points",
			accounts: []models.Account{
				{ID: "a1", ShortName: "Depot", Saldo: 50, IncludeInSaldo: false},
			},
			axis: []string{"2024-01", "2024-02"},
			want: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Depot",
					IncludeInSaldo: false,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 50},
						{Month: "2024-02", Balance: 50},
					},
				},
			},
		},
		{
			name: "a transaction whose account_id matches no fetched account is ignored rather than creating a phantom series",
			accounts: []models.Account{
				{ID: "a1", ShortName: "Giro", Saldo: 100, IncludeInSaldo: true},
			},
			transactions: []models.Transaction{
				{AccountID: "ghost", Amount: 9999, TransactionDate: "2024-01-01"},
			},
			axis: []string{"2024-01"},
			want: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := accountSeries(tt.accounts, tt.transactions, tt.axis)

			if tt.wantErr {
				if err == nil {
					t.Fatal("accountSeries() = nil error, want an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("accountSeries() returned unexpected error: %v", err)
			}
			if got == nil {
				t.Fatal("accountSeries() returned nil, want empty-but-non-nil")
			}
			assertAccountSeriesEqual(t, got, tt.want)
		})
	}
}

func assertAccountSeriesEqual(t *testing.T, got, want []models.AccountBalanceSeries) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("series = %+v, want %+v", got, want)
	}
	for i := range got {
		if got[i].AccountID != want[i].AccountID {
			t.Errorf("series[%d].AccountID = %q, want %q", i, got[i].AccountID, want[i].AccountID)
		}
		if got[i].ShortName != want[i].ShortName {
			t.Errorf("series[%d].ShortName = %q, want %q", i, got[i].ShortName, want[i].ShortName)
		}
		if got[i].IncludeInSaldo != want[i].IncludeInSaldo {
			t.Errorf("series[%d].IncludeInSaldo = %v, want %v", i, got[i].IncludeInSaldo, want[i].IncludeInSaldo)
		}
		assertPointsEqual(t, got[i].Points, want[i].Points)
	}
}

// TestFilterTransactions exercises filterTransactions directly, with no
// database involved -- it carries over the intent of the retired
// buildTransactionFilterClause test ("the narrowing is exactly right and
// nothing leaks"), now applied to a Go predicate instead of generated SQL.
func TestFilterTransactions(t *testing.T) {
	rows := []models.Transaction{
		{ID: 3, AccountID: "acct-1", Category: "Groceries", TransactionDate: "2024-01-03"},
		{ID: 2, AccountID: "acct-2", Category: "Housing", TransactionDate: "2024-01-02"},
		{ID: 1, AccountID: "acct-1", Category: "Housing", TransactionDate: "2024-01-01"},
	}

	tests := []struct {
		name   string
		rows   []models.Transaction
		filter models.TransactionFilter
		want   []models.Transaction
	}{
		{
			name:   "a zero-value filter returns every input row, in the input order, unchanged",
			rows:   rows,
			filter: models.TransactionFilter{},
			want:   rows,
		},
		{
			name:   "an account-only filter returns only rows carrying that account id",
			rows:   rows,
			filter: models.TransactionFilter{AccountIDs: []string{"acct-1"}},
			want:   []models.Transaction{rows[0], rows[2]},
		},
		{
			name:   "a category-only filter returns only rows carrying that category",
			rows:   rows,
			filter: models.TransactionFilter{Categories: []string{"Housing"}},
			want:   []models.Transaction{rows[1], rows[2]},
		},
		{
			name:   "both fields set returns the intersection, not the union",
			rows:   rows,
			filter: models.TransactionFilter{AccountIDs: []string{"acct-1"}, Categories: []string{"Housing"}},
			want:   []models.Transaction{rows[2]},
		},
		{
			name:   "a filter matching nothing returns an empty but non-nil slice",
			rows:   rows,
			filter: models.TransactionFilter{AccountIDs: []string{"no-such-account"}},
			want:   []models.Transaction{},
		},
		{
			name:   "category matching stays exactly case-sensitive -- a differently-cased value does not match",
			rows:   rows,
			filter: models.TransactionFilter{Categories: []string{"groceries"}},
			want:   []models.Transaction{},
		},
		{
			name:   "input order is preserved: rows already ordered by date descending come out in the same relative order",
			rows:   rows,
			filter: models.TransactionFilter{AccountIDs: []string{"acct-1"}},
			want:   []models.Transaction{rows[0], rows[2]},
		},
		{
			name:   "an empty input slice with a set filter returns empty, not nil",
			rows:   []models.Transaction{},
			filter: models.TransactionFilter{AccountIDs: []string{"acct-1"}},
			want:   []models.Transaction{},
		},
		{
			name:   "two account ids in AccountIDs returns the union of both accounts' rows",
			rows:   rows,
			filter: models.TransactionFilter{AccountIDs: []string{"acct-1", "acct-2"}},
			want:   []models.Transaction{rows[0], rows[1], rows[2]},
		},
		{
			name:   "two categories returns the union of both categories' rows",
			rows:   rows,
			filter: models.TransactionFilter{Categories: []string{"Groceries", "Housing"}},
			want:   []models.Transaction{rows[0], rows[1], rows[2]},
		},
		{
			name:   "two account ids plus one category returns the intersection: rows in either account AND carrying that category",
			rows:   rows,
			filter: models.TransactionFilter{AccountIDs: []string{"acct-1", "acct-2"}, Categories: []string{"Housing"}},
			want:   []models.Transaction{rows[1], rows[2]},
		},
		{
			name:   "an explicitly-empty non-nil slice behaves identically to nil, i.e. unfiltered",
			rows:   rows,
			filter: models.TransactionFilter{AccountIDs: []string{}, Categories: []string{}},
			want:   rows,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := filterTransactions(tt.rows, tt.filter)

			if got == nil {
				t.Fatal("filterTransactions() returned nil, want empty-but-non-nil")
			}
			assertTransactionsEqual(t, got, tt.want)
		})
	}
}

func assertTransactionsEqual(t *testing.T, got, want []models.Transaction) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("transactions = %+v, want %+v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("transactions[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// TestResolveCategoryName exercises resolveCategoryName directly, with no
// database involved.
func TestResolveCategoryName(t *testing.T) {
	tests := []struct {
		name      string
		existing  []string
		submitted string
		want      models.ResolvedCategory
	}{
		{
			name:      "an exact match against an existing name returns that name and does not ask for a create",
			existing:  []string{"Groceries", "Housing"},
			submitted: "Groceries",
			want:      models.ResolvedCategory{Name: "Groceries", Create: false},
		},
		{
			name:      "a differently-cased spelling of an existing name returns the stored canonical spelling, not the submitted one",
			existing:  []string{"Groceries", "Housing"},
			submitted: "groceries",
			want:      models.ResolvedCategory{Name: "Groceries", Create: false},
		},
		{
			name:      "a name surrounded by whitespace matches its trimmed equivalent and returns the stored spelling",
			existing:  []string{"Groceries"},
			submitted: "  Groceries  ",
			want:      models.ResolvedCategory{Name: "Groceries", Create: false},
		},
		{
			name:      "a name matching nothing returns the trimmed submitted name and asks for a create",
			existing:  []string{"Groceries"},
			submitted: "  Wildcard  ",
			want:      models.ResolvedCategory{Name: "Wildcard", Create: true},
		},
		{
			name:      "an empty existing list always asks for a create",
			existing:  []string{},
			submitted: "Anything",
			want:      models.ResolvedCategory{Name: "Anything", Create: true},
		},
		{
			name:      "the first match wins when the existing list somehow contains two names differing only by case",
			existing:  []string{"groceries", "Groceries"},
			submitted: "GROCERIES",
			want:      models.ResolvedCategory{Name: "groceries", Create: false},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveCategoryName(tt.existing, tt.submitted)

			if got != tt.want {
				t.Errorf("resolveCategoryName(%v, %q) = %+v, want %+v", tt.existing, tt.submitted, got, tt.want)
			}
			if got.Name != strings.TrimSpace(got.Name) {
				t.Errorf("resolveCategoryName(%v, %q).Name = %q, want a trimmed value", tt.existing, tt.submitted, got.Name)
			}
		})
	}
}

// TestComposedBalanceHistory exercises monthAxis, accountSeries and
// totalSeries together the way GetBalanceHistory composes them, without a
// database.
func TestComposedBalanceHistory(t *testing.T) {
	t.Run("months, total and every account's points share one length; total excludes the non-included account while accounts still contains it", func(t *testing.T) {
		now := time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC)
		accounts := []models.Account{
			{ID: "a1", ShortName: "Giro", Saldo: 100, ActiveSince: "2024-01-01", IncludeInSaldo: true},
			{ID: "a2", ShortName: "Depot", Saldo: 9999, ActiveSince: "2024-01-01", IncludeInSaldo: false},
		}

		months, err := monthAxis(accounts, nil, now)
		if err != nil {
			t.Fatalf("monthAxis() returned unexpected error: %v", err)
		}
		series, err := accountSeries(accounts, nil, months)
		if err != nil {
			t.Fatalf("accountSeries() returned unexpected error: %v", err)
		}
		total := totalSeries(months, series)

		if len(total) != len(months) {
			t.Errorf("len(total) = %d, want %d (len(months))", len(total), len(months))
		}
		if len(series) != 2 {
			t.Fatalf("len(series) = %d, want 2 -- the non-included account must still appear", len(series))
		}
		for _, s := range series {
			if len(s.Points) != len(months) {
				t.Errorf("account %s: len(points) = %d, want %d (len(months))", s.AccountID, len(s.Points), len(months))
			}
		}

		for _, point := range total {
			if point.Balance != 100 {
				t.Errorf("total[%s] = %v, want 100 -- the include_in_saldo=false account must not contribute", point.Month, point.Balance)
			}
		}
	})

	t.Run("a user with no accounts produces empty but non-nil months, total and accounts", func(t *testing.T) {
		now := time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC)

		months, err := monthAxis(nil, nil, now)
		if err != nil {
			t.Fatalf("monthAxis() returned unexpected error: %v", err)
		}
		series, err := accountSeries(nil, nil, months)
		if err != nil {
			t.Fatalf("accountSeries() returned unexpected error: %v", err)
		}
		total := totalSeries(months, series)

		if months == nil {
			t.Error("months is nil, want empty-but-non-nil")
		}
		if series == nil {
			t.Error("series (accounts) is nil, want empty-but-non-nil")
		}
		if total == nil {
			t.Error("total is nil, want empty-but-non-nil")
		}
		if len(months) != 0 || len(series) != 0 || len(total) != 0 {
			t.Errorf("months=%v series=%v total=%v, want all empty", months, series, total)
		}
	})
}

// TestSettingsOrDefault exercises settingsOrDefault directly, with no
// database involved -- a pure-function test following TestTotalSeries's
// precedent. The repository's upsert is deliberately not unit-tested here
// because this package has no database test harness; task 1's human-check
// curl loop is what proves the upsert.
func TestSettingsOrDefault(t *testing.T) {
	tests := []struct {
		name   string
		stored models.UserSettings
		found  bool
		want   models.UserSettings
	}{
		{
			name:   "a never-saved user (not found) gets the 100000/true defaults",
			stored: models.UserSettings{},
			found:  false,
			want:   models.UserSettings{BalanceThreshold: 100000, ShowDecimals: true},
		},
		{
			name:   "a stored row is returned untouched, never overwritten by the defaults",
			stored: models.UserSettings{BalanceThreshold: 250000, ShowDecimals: false},
			found:  true,
			want:   models.UserSettings{BalanceThreshold: 250000, ShowDecimals: false},
		},
		{
			name:   "a stored row that happens to equal the defaults is still the stored row, not a re-defaulted one",
			stored: models.UserSettings{BalanceThreshold: 100000, ShowDecimals: true},
			found:  true,
			want:   models.UserSettings{BalanceThreshold: 100000, ShowDecimals: true},
		},
		{
			name:   "a genuinely-stored zero value is found, so the defaulting rule must not fire",
			stored: models.UserSettings{},
			found:  true,
			want:   models.UserSettings{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := settingsOrDefault(tt.stored, tt.found)
			if got != tt.want {
				t.Errorf("settingsOrDefault(%+v, %v) = %+v, want %+v", tt.stored, tt.found, got, tt.want)
			}
		})
	}
}

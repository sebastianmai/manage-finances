package services

import (
	"backend/models"
	"testing"
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

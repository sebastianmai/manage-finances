package repository

import (
	"backend/models"
	"strings"
	"testing"
)

// TestBuildTransactionFilterClause exercises buildTransactionFilterClause
// directly, with no database involved -- it is an unexported, pure function
// precisely so this is possible. package repository (internal, not
// repository_test) is what makes the unexported function reachable here.
func TestBuildTransactionFilterClause(t *testing.T) {
	tests := []struct {
		name      string
		filter    models.TransactionFilter
		nextIndex int
		wantSQL   string
		wantArgs  []any
	}{
		{
			name:      "empty filter produces an empty clause and no arguments",
			filter:    models.TransactionFilter{},
			nextIndex: 2,
			wantSQL:   "",
			wantArgs:  nil,
		},
		{
			name:      "account id alone numbers its placeholder from nextIndex",
			filter:    models.TransactionFilter{AccountID: "acct-123"},
			nextIndex: 2,
			wantSQL:   " AND account_id = $2",
			wantArgs:  []any{"acct-123"},
		},
		{
			name:      "a different start index shifts the generated placeholder number",
			filter:    models.TransactionFilter{AccountID: "acct-123"},
			nextIndex: 5,
			wantSQL:   " AND account_id = $5",
			wantArgs:  []any{"acct-123"},
		},
		{
			name:      "category alone numbers its placeholder from nextIndex",
			filter:    models.TransactionFilter{Category: "Groceries"},
			nextIndex: 2,
			wantSQL:   " AND category = $2",
			wantArgs:  []any{"Groceries"},
		},
		{
			name:      "both fields set: placeholders two and three in that order, arguments in matching order",
			filter:    models.TransactionFilter{AccountID: "acct-123", Category: "Groceries"},
			nextIndex: 2,
			wantSQL:   " AND account_id = $2 AND category = $3",
			wantArgs:  []any{"acct-123", "Groceries"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotSQL, gotArgs := buildTransactionFilterClause(tt.filter, tt.nextIndex)

			if gotSQL != tt.wantSQL {
				t.Errorf("clause = %q, want %q", gotSQL, tt.wantSQL)
			}

			assertArgsEqual(t, gotArgs, tt.wantArgs)
			assertNoValueLeaksIntoSQL(t, gotSQL, gotArgs)
		})
	}
}

// assertArgsEqual compares two []any argument slices positionally.
func assertArgsEqual(t *testing.T, got, want []any) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("args = %v, want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("args[%d] = %v, want %v", i, got[i], want[i])
		}
	}
}

// assertNoValueLeaksIntoSQL proves values travel as parameters, not
// interpolation: the clause text must never contain an argument value, and
// no argument may itself carry SQL syntax.
func assertNoValueLeaksIntoSQL(t *testing.T, clause string, args []any) {
	t.Helper()

	for _, arg := range args {
		argStr, ok := arg.(string)
		if !ok {
			continue
		}
		if argStr != "" && strings.Contains(clause, argStr) {
			t.Errorf("clause %q contains argument value %q -- value leaked into SQL text", clause, argStr)
		}
		if strings.Contains(argStr, "AND") || strings.Contains(argStr, "$") {
			t.Errorf("argument %q looks like it contains SQL text", argStr)
		}
	}
}

// TestGroupMonthlyBalanceRows exercises groupMonthlyBalanceRows directly,
// with no database involved -- it is an unexported, pure function precisely
// so this is possible, following buildTransactionFilterClause's precedent.
func TestGroupMonthlyBalanceRows(t *testing.T) {
	tests := []struct {
		name       string
		rows       []monthlyBalanceRow
		wantMonths []string
		wantSeries []models.AccountBalanceSeries
	}{
		{
			name:       "empty input returns empty-but-non-nil months and series",
			rows:       []monthlyBalanceRow{},
			wantMonths: []string{},
			wantSeries: []models.AccountBalanceSeries{},
		},
		{
			name: "one account, three consecutive months: one series, three points",
			rows: []monthlyBalanceRow{
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-01", Balance: 100},
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-02", Balance: 150},
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-03", Balance: 200},
			},
			wantMonths: []string{"2024-01", "2024-02", "2024-03"},
			wantSeries: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
						{Month: "2024-02", Balance: 150},
						{Month: "2024-03", Balance: 200},
					},
				},
			},
		},
		{
			name: "two accounts over the same three months: two series, months deduplicated to three",
			rows: []monthlyBalanceRow{
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-01", Balance: 100},
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-02", Balance: 150},
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-03", Balance: 200},
				{AccountID: "a2", ShortName: "Tages", IncludeInSaldo: true, Month: "2024-01", Balance: 1000},
				{AccountID: "a2", ShortName: "Tages", IncludeInSaldo: true, Month: "2024-02", Balance: 1000},
				{AccountID: "a2", ShortName: "Tages", IncludeInSaldo: true, Month: "2024-03", Balance: 1050},
			},
			wantMonths: []string{"2024-01", "2024-02", "2024-03"},
			wantSeries: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
						{Month: "2024-02", Balance: 150},
						{Month: "2024-03", Balance: 200},
					},
				},
				{
					AccountID:      "a2",
					ShortName:      "Tages",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 1000},
						{Month: "2024-02", Balance: 1000},
						{Month: "2024-03", Balance: 1050},
					},
				},
			},
		},
		{
			name: "an account with include_in_saldo false is still grouped and returned in full",
			rows: []monthlyBalanceRow{
				{AccountID: "a1", ShortName: "Depot", IncludeInSaldo: false, Month: "2024-01", Balance: 500},
			},
			wantMonths: []string{"2024-01"},
			wantSeries: []models.AccountBalanceSeries{
				{
					AccountID:      "a1",
					ShortName:      "Depot",
					IncludeInSaldo: false,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 500},
					},
				},
			},
		},
		{
			name: "input row order is preserved: series in account first-appearance order, points in arrival order",
			rows: []monthlyBalanceRow{
				{AccountID: "a2", ShortName: "Tages", IncludeInSaldo: true, Month: "2024-02", Balance: 1000},
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-01", Balance: 100},
				{AccountID: "a2", ShortName: "Tages", IncludeInSaldo: true, Month: "2024-01", Balance: 900},
				{AccountID: "a1", ShortName: "Giro", IncludeInSaldo: true, Month: "2024-02", Balance: 150},
			},
			wantMonths: []string{"2024-02", "2024-01"},
			wantSeries: []models.AccountBalanceSeries{
				{
					AccountID:      "a2",
					ShortName:      "Tages",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-02", Balance: 1000},
						{Month: "2024-01", Balance: 900},
					},
				},
				{
					AccountID:      "a1",
					ShortName:      "Giro",
					IncludeInSaldo: true,
					Points: []models.BalancePoint{
						{Month: "2024-01", Balance: 100},
						{Month: "2024-02", Balance: 150},
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotMonths, gotSeries := groupMonthlyBalanceRows(tt.rows)

			if gotMonths == nil {
				t.Fatal("months is nil, want empty-but-non-nil")
			}
			if gotSeries == nil {
				t.Fatal("series is nil, want empty-but-non-nil")
			}

			assertMonthsEqual(t, gotMonths, tt.wantMonths)
			assertSeriesEqual(t, gotSeries, tt.wantSeries)
		})
	}
}

func assertMonthsEqual(t *testing.T, got, want []string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("months = %v, want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("months[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func assertSeriesEqual(t *testing.T, got, want []models.AccountBalanceSeries) {
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
		if len(got[i].Points) != len(want[i].Points) {
			t.Fatalf("series[%d].Points = %+v, want %+v", i, got[i].Points, want[i].Points)
		}
		for j := range got[i].Points {
			if got[i].Points[j] != want[i].Points[j] {
				t.Errorf("series[%d].Points[%d] = %+v, want %+v", i, j, got[i].Points[j], want[i].Points[j])
			}
		}
	}
}

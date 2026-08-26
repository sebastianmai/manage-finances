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

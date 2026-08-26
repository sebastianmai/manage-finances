// Frontend-only mock category list -- deliberately not backed by an
// endpoint, table, or column. Shared by NewTransactionPage and
// TransactionsPage so the two booking forms cannot drift into two
// different lists of valid categories.
export const CATEGORIES = [
  'Groceries',
  'Housing',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Health',
  'Dining',
  'Savings',
];

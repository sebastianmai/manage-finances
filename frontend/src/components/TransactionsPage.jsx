import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import FilterMultiSelect from './FilterMultiSelect';

const amountFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

const EMPTY_FILTERS = {
    account_ids: [],
    categories: [],
};

export default function TransactionsPage() {

    const navigate = useNavigate();

    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ column: 'transaction_date', direction: 'desc' });
    const [filters, setFilters] = useState({ ...EMPTY_FILTERS });

    // Filters passed explicitly to avoid stale closures.
    const getTransactions = useCallback(async (activeFilters) => {
        try {
            const params = new URLSearchParams();
            // .append, never .set: repeated parameters carry every selected
            // value, and .set would silently overwrite all but the last.
            // Accounts emitted before categories so the URL order is
            // deterministic and assertable.
            activeFilters.account_ids.forEach((accountId) => {
                params.append('account_id', accountId);
            });
            activeFilters.categories.forEach((category) => {
                params.append('category', category);
            });
            const queryString = params.toString();
            const url = `http://localhost:8080/transactions${queryString ? `?${queryString}` : ''}`;

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
            });

            if (response.status === 401) {
                navigate('/login');
                return;
            }

            if (!response.ok) {
                setError('Failed to load transactions');
                return;
            }

            const { transactions: userTransactions } = await response.json();
            setTransactions(userTransactions);
            setError('');
        } catch (err) {
            console.error('Error getting transactions:', err);
            setError('Failed to load transactions');
        }
    }, [navigate]);

    // Resolves account ids to names for the table.
    const getAccounts = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/accounts', {
                method: 'GET',
                credentials: 'include',
            });

            if (!response.ok) {
                setError('Failed to load accounts');
                return;
            }

            const { accounts: userAccounts } = await response.json();
            setAccounts(userAccounts);
        } catch (err) {
            console.error('Error getting accounts:', err);
            setError('Failed to load accounts');
        }
    }, []);

    // Non-blocking: failure just leaves the filter list empty.
    const getCategories = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/categories', {
                method: 'GET',
                credentials: 'include',
            });

            if (!response.ok) {
                console.error('Failed to load categories:', response.status);
                return;
            }

            const { categories: userCategories } = await response.json();
            setCategories(userCategories);
        } catch (err) {
            console.error('Error getting categories:', err);
        }
    }, []);

    useEffect(() => {
        const loadOnMount = async () => {
            await getTransactions(EMPTY_FILTERS);
            await getAccounts();
            await getCategories();
            setLoading(false);
        };

        loadOnMount();
    }, [getTransactions, getAccounts, getCategories]);

    // Avoids racing a stale filters closure.
    const applyFilter = async (field, values) => {
        const nextFilters = { ...filters, [field]: values };
        setFilters(nextFilters);
        await getTransactions(nextFilters);
    };

    const handleRemoveAccountFilter = (accountId) => {
        applyFilter('account_ids', filters.account_ids.filter((id) => id !== accountId));
    };

    const handleRemoveCategoryFilter = (category) => {
        applyFilter('categories', filters.categories.filter((value) => value !== category));
    };

    const handleClearFilters = async () => {
        setFilters({ ...EMPTY_FILTERS });
        await getTransactions({ ...EMPTY_FILTERS });
    };

    const isFilterActive = filters.account_ids.length > 0 || filters.categories.length > 0;

    const accountNamesById = accounts.reduce((map, account) => {
        map[account.id] = account.short_name;
        return map;
    }, {});

    const handleSort = (column) => {
        setSort((prev) => {
            if (prev.column === column) {
                return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { column, direction: 'asc' };
        });
    };

    const sortIndicator = (column) => {
        if (sort.column !== column) {
            return '';
        }
        return sort.direction === 'asc' ? ' ▲' : ' ▼';
    };

    const filteredTransactions = transactions.filter((transaction) =>
        transaction.description.toLowerCase().includes(search.trim().toLowerCase())
    );

    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
        let result;
        if (sort.column === 'amount') {
            result = a.amount - b.amount;
        } else if (sort.column === 'account') {
            const nameA = accountNamesById[a.account_id] || '';
            const nameB = accountNamesById[b.account_id] || '';
            result = nameA.localeCompare(nameB);
        } else if (sort.column === 'transaction_date') {
            result = a.transaction_date.localeCompare(b.transaction_date);
        } else {
            result = a[sort.column].localeCompare(b[sort.column]);
        }
        return sort.direction === 'desc' ? result * -1 : result;
    });

    const handleDelete = async (transaction) => {
        const confirmed = window.confirm(
            `Delete transaction "${transaction.description}"? This cannot be undone.`
        );
        if (!confirmed) {
            return;
        }

        setError('');

        try {
            const response = await fetch(`http://localhost:8080/transactions/${transaction.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!response.ok) {
                setError('Failed to delete transaction');
                return;
            }

            await getTransactions(filters);
        } catch (err) {
            console.error('Error deleting transaction:', err);
            setError('Failed to delete transaction');
        }
    };

    if (loading) {
        return (
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-7xl text-ui-text">
                Loading...
            </div>
        );
    }

    return (
        <div className="w-full max-w-7xl flex flex-col gap-4">
            <h1 className="text-4xl font-bold text-ui-text">Transactions</h1>
            {error && (
                <p className="text-ui-btn-warn">{error}</p>
            )}
            <div className="flex flex-col items-center gap-1">
                <label htmlFor="search" className="text-ui-text font-bold text-sm">
                    Search descriptions:
                </label>
                <div className="relative">
                    <svg
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-text/50"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                    >
                        <circle cx="9" cy="9" r="6" />
                        <line x1="17" y1="17" x2="13.5" y2="13.5" strokeLinecap="round" />
                    </svg>
                    <input
                        className="w-[28rem] max-w-full rounded-full border border-ui-text/20 bg-ui-bg text-ui-text py-2 pl-9 pr-9 focus:outline-none focus:ring-2 focus:border-ui-btn"
                        type="text"
                        id="search"
                        placeholder="e.g. groceries, rent…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-ui-text/50 hover:text-ui-text"
                            aria-label="Clear search"
                            onClick={() => setSearch('')}
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1">
                        <FilterMultiSelect
                            label="Account:"
                            allLabel="All accounts"
                            options={accounts.map((account) => ({
                                value: account.id,
                                label: account.short_name,
                            }))}
                            selectedValues={filters.account_ids}
                            onChange={(values) => applyFilter('account_ids', values)}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <FilterMultiSelect
                            label="Category:"
                            allLabel="All categories"
                            options={categories.map((category) => ({
                                value: category,
                                label: category,
                            }))}
                            selectedValues={filters.categories}
                            onChange={(values) => applyFilter('categories', values)}
                        />
                    </div>
                    {isFilterActive && (
                        <button
                            type="button"
                            className="text-ui-text/70 hover:text-ui-text underline text-sm pb-2"
                            onClick={handleClearFilters}
                        >
                            Clear filters
                        </button>
                    )}
                </div>
                <NavLink
                    to="/transactions/new"
                    className="inline-block bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md"
                >
                    Add booking
                </NavLink>
            </div>
            {isFilterActive && (
                <div className="flex flex-wrap items-center gap-2">
                    {filters.account_ids.map((accountId) => (
                        <span
                            key={`account-${accountId}`}
                            className="flex items-center gap-1 rounded-full border border-ui-text/20 bg-ui-light-bg text-ui-text text-sm py-1 px-3"
                        >
                            {accountNamesById[accountId] || accountId}
                            <button
                                type="button"
                                className="text-ui-text/70 font-bold hover:text-ui-btn-warn"
                                aria-label={`Remove account filter: ${accountNamesById[accountId] || accountId}`}
                                onClick={() => handleRemoveAccountFilter(accountId)}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    {filters.categories.map((category) => (
                        <span
                            key={`category-${category}`}
                            className="flex items-center gap-1 rounded-full border border-ui-text/20 bg-ui-light-bg text-ui-text text-sm py-1 px-3"
                        >
                            {category}
                            <button
                                type="button"
                                className="text-ui-text/70 font-bold hover:text-ui-btn-warn"
                                aria-label={`Remove category filter: ${category}`}
                                onClick={() => handleRemoveCategoryFilter(category)}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                {isFilterActive && transactions.length === 0 ? (
                    <p className="text-ui-text/70">No transactions match your filters.</p>
                ) : transactions.length === 0 ? (
                    <p className="text-ui-text/70">No transactions yet.</p>
                ) : sortedTransactions.length === 0 ? (
                    <p className="text-ui-text/70">No transactions match your search.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm text-left">
                            <thead className="bg-ui-bg">
                                <tr>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">
                                        <button type="button" onClick={() => handleSort('transaction_date')}>
                                            Date{sortIndicator('transaction_date')}
                                        </button>
                                    </th>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">
                                        <button type="button" onClick={() => handleSort('account')}>
                                            Account{sortIndicator('account')}
                                        </button>
                                    </th>
                                    <th className="px-3 py-2 font-bold text-right whitespace-nowrap">
                                        <button type="button" onClick={() => handleSort('amount')}>
                                            Amount{sortIndicator('amount')}
                                        </button>
                                    </th>
                                    <th className="px-3 py-2 font-bold text-left">
                                        <button type="button" onClick={() => handleSort('description')}>
                                            Description{sortIndicator('description')}
                                        </button>
                                    </th>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">
                                        <button type="button" onClick={() => handleSort('category')}>
                                            Category{sortIndicator('category')}
                                        </button>
                                    </th>
                                    <th className="px-3 py-2 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTransactions.map((transaction) => (
                                    <tr key={transaction.id} className="border-b border-ui-text/10 hover:bg-ui-bg/40">
                                        <td className="px-3 py-2 whitespace-nowrap">{transaction.transaction_date}</td>
                                        <td className="px-3 py-2">{accountNamesById[transaction.account_id] || '—'}</td>
                                        <td className={`px-3 py-2 tabular-nums text-right whitespace-nowrap ${transaction.amount > 0 ? 'text-green-600' : transaction.amount < 0 ? 'text-red-500' : ''}`}>
                                            {amountFormatter.format(transaction.amount)}
                                        </td>
                                        <td className="px-3 py-2">{transaction.description}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{transaction.category}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            <NavLink
                                                to={`/transactions/${transaction.id}/edit`}
                                                className="inline-block bg-ui-btn text-ui-btn-text font-bold py-1 px-3 rounded-md mr-2"
                                                aria-label={`Edit ${transaction.description}`}
                                            >
                                                Edit
                                            </NavLink>
                                            <button
                                                type="button"
                                                className="bg-ui-btn-warn text-ui-btn-text font-bold py-1 px-3 rounded-md"
                                                aria-label={`Delete ${transaction.description}`}
                                                onClick={() => handleDelete(transaction)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

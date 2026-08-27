import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

const amountFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

const EMPTY_FILTERS = {
    account_id: '',
    category: '',
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

    // activeFilters is passed explicitly rather than read back from the
    // filters state closure: that is what keeps a filter change's request
    // in step with the control that triggered it, and keeps this
    // callback's dependency list at navigate only, so a filter change can
    // never re-trigger the mount effect's accounts load.
    const getTransactions = useCallback(async (activeFilters) => {
        try {
            const params = new URLSearchParams();
            if (activeFilters.account_id) {
                params.set('account_id', activeFilters.account_id);
            }
            if (activeFilters.category) {
                params.set('category', activeFilters.category);
            }
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

    // getAccounts does no 401 navigation -- the transactions fetch already
    // covers auth. This call exists only to resolve account ids to names.
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

    // Non-blocking by design (D-10): the category filter is suggestions and
    // filter options, not data this page's rendering depends on, unlike the
    // accounts fetch above. No 401 navigation either -- the transactions
    // fetch already covers auth. A failure is logged and the filter's
    // option list simply stays empty.
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

    // Stores the next filters immediately and awaits the refetch with that
    // same object, rather than reading filters back from state -- reading
    // state back here could race a second change against a stale closure.
    const applyFilter = async (field, value) => {
        const nextFilters = { ...filters, [field]: value };
        setFilters(nextFilters);
        await getTransactions(nextFilters);
    };

    const handleClearFilters = async () => {
        setFilters({ ...EMPTY_FILTERS });
        await getTransactions({ ...EMPTY_FILTERS });
    };

    const isFilterActive = filters.account_id !== '' || filters.category !== '';

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
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1">
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
                                className="w-72 max-w-full rounded-full bg-ui-bg text-ui-text py-2 pl-9 pr-9 focus:outline-none focus:ring-2"
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
                    <div className="flex flex-col gap-1">
                        <label htmlFor="filter-account" className="text-ui-text font-bold text-sm">
                            Account:
                        </label>
                        <select
                            className="rounded-full bg-ui-bg text-ui-text py-2 px-4 focus:outline-none focus:ring-2"
                            id="filter-account"
                            value={filters.account_id}
                            onChange={(e) => applyFilter('account_id', e.target.value)}
                        >
                            <option value="">All accounts</option>
                            {accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {account.short_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label htmlFor="filter-category" className="text-ui-text font-bold text-sm">
                            Category:
                        </label>
                        <select
                            className="rounded-full bg-ui-bg text-ui-text py-2 px-4 focus:outline-none focus:ring-2"
                            id="filter-category"
                            value={filters.category}
                            onChange={(e) => applyFilter('category', e.target.value)}
                        >
                            <option value="">All categories</option>
                            {categories.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
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

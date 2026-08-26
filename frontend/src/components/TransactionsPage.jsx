import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

const amountFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

const EMPTY_EDIT_FORM = {
    transaction_date: '',
    category: '',
    description: '',
    amount: '',
};

export default function TransactionsPage() {

    const navigate = useNavigate();

    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState({ column: 'transaction_date', direction: 'desc' });
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ ...EMPTY_EDIT_FORM });

    const getTransactions = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/transactions', {
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

    useEffect(() => {
        const loadOnMount = async () => {
            await getTransactions();
            await getAccounts();
            setLoading(false);
        };

        loadOnMount();
    }, [getTransactions, getAccounts]);

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

    const handleEdit = (transaction) => {
        setEditingId(transaction.id);
        setEditForm({
            transaction_date: transaction.transaction_date,
            category: transaction.category,
            description: transaction.description,
            amount: transaction.amount,
        });
        setError('');
    };

    const handleEditChange = (e) => {
        const { id, value } = e.target;
        setEditForm({
            ...editForm,
            [id]: value,
        });
    };

    const handleEditCancel = () => {
        setEditingId(null);
        setEditForm({ ...EMPTY_EDIT_FORM });
        setError('');
    };

    const handleEditSave = async () => {
        setError('');

        if (
            !editForm.transaction_date ||
            !editForm.category ||
            !editForm.description ||
            !editForm.amount
        ) {
            setError('All fields are required');
            return;
        }

        const amountNumber = Number(editForm.amount);
        if (amountNumber === 0) {
            setError('Amount cannot be zero');
            return;
        }

        try {
            const response = await fetch(`http://localhost:8080/transactions/${editingId}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    transaction_date: editForm.transaction_date,
                    category: editForm.category,
                    description: editForm.description,
                    amount: amountNumber,
                }),
            });

            if (!response.ok) {
                setError('Failed to update transaction');
                return;
            }

            setEditingId(null);
            setEditForm({ ...EMPTY_EDIT_FORM });
            await getTransactions();
        } catch (err) {
            console.error('Error updating transaction:', err);
            setError('Failed to update transaction');
        }
    };

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

            await getTransactions();
        } catch (err) {
            console.error('Error deleting transaction:', err);
            setError('Failed to delete transaction');
        }
    };

    if (loading) {
        return (
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-md text-ui-text">
                Loading...
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl flex flex-col gap-4">
            <h1 className="text-4xl font-bold text-ui-text">Transactions</h1>
            {error && (
                <p className="text-ui-btn-warn">{error}</p>
            )}
            <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                <label htmlFor="search" className="text-ui-text font-bold">
                    Search descriptions:
                </label>
                <input
                    className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                    type="text"
                    id="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                {transactions.length === 0 ? (
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
                                        {editingId === transaction.id ? (
                                            <>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <input
                                                        className="bg-ui-bg text-ui-text rounded-md py-1 px-2 focus:outline-none focus:ring-2"
                                                        type="date"
                                                        id="transaction_date"
                                                        aria-label={`Date: ${transaction.description}`}
                                                        value={editForm.transaction_date}
                                                        onChange={handleEditChange}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">{accountNamesById[transaction.account_id] || '—'}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    <input
                                                        className="bg-ui-bg text-ui-text rounded-md py-1 px-2 focus:outline-none focus:ring-2 w-24 text-right"
                                                        type="number"
                                                        step="0.01"
                                                        id="amount"
                                                        aria-label={`Amount: ${transaction.description}`}
                                                        value={editForm.amount}
                                                        onChange={handleEditChange}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        className="bg-ui-bg text-ui-text rounded-md py-1 px-2 focus:outline-none focus:ring-2"
                                                        type="text"
                                                        id="description"
                                                        maxLength={180}
                                                        aria-label={`Description: ${transaction.description}`}
                                                        value={editForm.description}
                                                        onChange={handleEditChange}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input
                                                        className="bg-ui-bg text-ui-text rounded-md py-1 px-2 focus:outline-none focus:ring-2"
                                                        type="text"
                                                        id="category"
                                                        maxLength={50}
                                                        aria-label={`Category: ${transaction.description}`}
                                                        value={editForm.category}
                                                        onChange={handleEditChange}
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        className="bg-ui-btn text-ui-btn-text font-bold py-1 px-3 rounded-md mr-2"
                                                        aria-label={`Save ${transaction.description}`}
                                                        onClick={handleEditSave}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="bg-ui-btn-warn text-ui-btn-text font-bold py-1 px-3 rounded-md"
                                                        aria-label={`Cancel ${transaction.description}`}
                                                        onClick={handleEditCancel}
                                                    >
                                                        Cancel
                                                    </button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-3 py-2 whitespace-nowrap">{transaction.transaction_date}</td>
                                                <td className="px-3 py-2">{accountNamesById[transaction.account_id] || '—'}</td>
                                                <td className={`px-3 py-2 tabular-nums text-right whitespace-nowrap ${transaction.amount > 0 ? 'text-green-600' : transaction.amount < 0 ? 'text-red-500' : ''}`}>
                                                    {amountFormatter.format(transaction.amount)}
                                                </td>
                                                <td className="px-3 py-2">{transaction.description}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{transaction.category}</td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        className="bg-ui-btn text-ui-btn-text font-bold py-1 px-3 rounded-md mr-2"
                                                        aria-label={`Edit ${transaction.description}`}
                                                        onClick={() => handleEdit(transaction)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="bg-ui-btn-warn text-ui-btn-text font-bold py-1 px-3 rounded-md"
                                                        aria-label={`Delete ${transaction.description}`}
                                                        onClick={() => handleDelete(transaction)}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </>
                                        )}
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

import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

// Frontend-only mock category list -- deliberately not backed by an
// endpoint, table, or column. See PLAN.md for the reasoning.
const CATEGORIES = [
    'Groceries',
    'Housing',
    'Transportation',
    'Utilities',
    'Entertainment',
    'Health',
    'Dining',
    'Savings',
];

const EMPTY_FORM = {
    transaction_date: '',
    account_id: '',
    category: '',
    description: '',
    amount: '',
    is_transfer: false,
    transfer_to_account_id: '',
};

export default function NewTransactionPage() {

    const navigate = useNavigate();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [error, setError] = useState('');

    const getAccounts = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/accounts', {
                method: 'GET',
                credentials: 'include',
            });

            if (response.status === 401) {
                navigate('/login');
                return;
            }

            if (!response.ok) {
                setLoadError('Failed to load accounts');
                return;
            }

            const { accounts: userAccounts } = await response.json();
            setAccounts(userAccounts);
            setLoadError('');
        } catch (err) {
            console.error('Error getting accounts:', err);
            setLoadError('Failed to load accounts');
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        const loadOnMount = async () => {
            await getAccounts();
        };

        loadOnMount();
    }, [getAccounts]);

    const handleChange = (e) => {
        const { id, value, type, checked } = e.target;
        const nextValue = type === 'checkbox' ? checked : value;

        setForm((prev) => {
            const next = { ...prev, [id]: nextValue };

            // Both select values are already strings (UUIDs), so a plain
            // === compares them safely. Reactively clear the destination
            // whenever the chosen source becomes the currently chosen
            // destination, so a source-equals-destination state is never
            // submittable.
            if (
                id === 'account_id' &&
                prev.transfer_to_account_id !== '' &&
                nextValue === prev.transfer_to_account_id
            ) {
                next.transfer_to_account_id = '';
            }

            if (id === 'is_transfer' && !nextValue) {
                next.transfer_to_account_id = '';
            }

            return next;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (
            !form.transaction_date ||
            !form.account_id ||
            !form.category ||
            !form.description ||
            !form.amount
        ) {
            setError('All fields are required');
            return;
        }

        const amountNumber = Number(form.amount);
        if (amountNumber === 0) {
            setError('Amount cannot be zero');
            return;
        }

        if (form.is_transfer && !form.transfer_to_account_id) {
            setError('Select a destination account for the transfer');
            return;
        }

        const body = {
            account_id: form.account_id,
            amount: amountNumber,
            transaction_date: form.transaction_date,
            category: form.category,
            description: form.description,
        };

        if (form.is_transfer) {
            body.transfer_to_account_id = form.transfer_to_account_id;
        }

        try {
            const response = await fetch('http://localhost:8080/transactions', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                setError('Failed to create transaction');
                return;
            }

            // Home is rendered inside <Routes>, so navigating back to "/"
            // genuinely unmounts and remounts it, and its existing
            // useEffect re-fetches /me and /balance on its own. There is
            // no need to dispatch a window event here for a balance
            // change -- that event exists solely for the login/logout
            // contract, and firing it for this would be a misuse of it.
            navigate('/');
        } catch (err) {
            console.error('Error creating transaction:', err);
            setError('Failed to create transaction');
        }
    };

    if (loading) {
        return (
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-md text-ui-text">
                Loading...
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="w-full max-w-md flex flex-col gap-4">
                <h1 className="text-4xl font-bold text-ui-text">New booking</h1>
                <p className="text-ui-btn-warn">{loadError}</p>
            </div>
        );
    }

    if (accounts.length === 0) {
        return (
            <div className="w-full max-w-md flex flex-col gap-4">
                <h1 className="text-4xl font-bold text-ui-text">New booking</h1>
                <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                    <p className="text-ui-text/70">
                        You need at least one account before you can record a booking.
                    </p>
                    <NavLink
                        to="/accounts"
                        className="inline-block mt-4 bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md"
                    >
                        Go to accounts
                    </NavLink>
                </div>
            </div>
        );
    }

    const destinationOptions = accounts.filter(
        (account) => account.id !== form.account_id
    );

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <h1 className="text-4xl font-bold text-ui-text">New booking</h1>
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                {error && (
                    <p className="text-ui-btn-warn mb-2">{error}</p>
                )}
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="transaction_date" className="text-ui-text font-bold">
                            Date:
                        </label>
                        <input
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            type="date"
                            id="transaction_date"
                            value={form.transaction_date}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="account_id" className="text-ui-text font-bold">
                            Account:
                        </label>
                        <select
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            id="account_id"
                            value={form.account_id}
                            onChange={handleChange}
                        >
                            <option value="" disabled>Select an account</option>
                            {accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {account.short_name} — {account.full_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="category" className="text-ui-text font-bold">
                            Category:
                        </label>
                        <select
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            id="category"
                            value={form.category}
                            onChange={handleChange}
                        >
                            <option value="" disabled>Select a category</option>
                            {CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="description" className="text-ui-text font-bold">
                            Description:
                        </label>
                        <input
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            type="text"
                            id="description"
                            maxLength={180}
                            value={form.description}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="amount" className="text-ui-text font-bold">
                            Amount:
                        </label>
                        <input
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            type="number"
                            step="0.01"
                            id="amount"
                            value={form.amount}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <input
                            type="checkbox"
                            id="is_transfer"
                            checked={form.is_transfer}
                            onChange={handleChange}
                        />
                        <label htmlFor="is_transfer" className="text-ui-text">
                            This is a transfer to another of my own accounts
                        </label>
                    </div>
                    {form.is_transfer && (
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="transfer_to_account_id" className="text-ui-text font-bold">
                                Transfer to:
                            </label>
                            <select
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                id="transfer_to_account_id"
                                value={form.transfer_to_account_id}
                                onChange={handleChange}
                            >
                                <option value="" disabled>Select a destination account</option>
                                {destinationOptions.map((account) => (
                                    <option key={account.id} value={account.id}>
                                        {account.short_name} — {account.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="mt-4 flex justify-end">
                        <button
                            type="submit"
                            className="bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md"
                        >
                            Save booking
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

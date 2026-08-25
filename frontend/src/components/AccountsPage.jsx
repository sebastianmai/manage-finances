import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

const saldoFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

const EMPTY_FORM = {
    type: '',
    account_number: '',
    full_name: '',
    short_name: '',
    saldo: '',
    active_since: '',
    owner_name: '',
    vollmacht: '',
};

export default function AccountsPage() {

    const navigate = useNavigate();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
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
                setError('Failed to load accounts');
                return;
            }

            const { accounts: userAccounts } = await response.json();
            setAccounts(userAccounts);
            setError('');
        } catch (err) {
            console.error('Error getting accounts:', err);
            setError('Failed to load accounts');
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
        setForm({
            ...form,
            [e.target.id]: e.target.value,
        });
    };

    const handleAdd = () => {
        setError('');
        setAdding(true);
    };

    const handleCancel = () => {
        setForm({ ...EMPTY_FORM });
        setError('');
        setAdding(false);
    };

    const handleDelete = async (account) => {
        const confirmed = window.confirm(
            `Delete account ${account.short_name}? This cannot be undone.`
        );
        if (!confirmed) {
            return;
        }

        setError('');

        try {
            const response = await fetch(`http://localhost:8080/accounts/${account.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (!response.ok) {
                setError('Failed to delete account');
                return;
            }

            await getAccounts();
        } catch (err) {
            console.error('Error deleting account:', err);
            setError('Failed to delete account');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');

        if (
            !form.type ||
            !form.account_number ||
            !form.full_name ||
            !form.short_name ||
            !form.saldo ||
            !form.active_since ||
            !form.owner_name
        ) {
            setError('All fields except Vollmacht are required');
            return;
        }

        try {
            const response = await fetch('http://localhost:8080/accounts', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...form, saldo: Number(form.saldo) }),
            });

            if (!response.ok) {
                setError('Failed to create account');
                return;
            }

            setForm({ ...EMPTY_FORM });
            setAdding(false);
            await getAccounts();
        } catch (err) {
            console.error('Error creating account:', err);
            setError('Failed to create account');
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
            <h1 className="text-4xl font-bold text-ui-text">Accounts</h1>
            {error && (
                <p className="text-ui-btn-warn">{error}</p>
            )}
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                {accounts.length === 0 ? (
                    <p className="text-ui-text/70">No accounts yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm text-left">
                            <thead className="bg-ui-bg">
                                <tr>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">Type</th>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">Account nr / IBAN</th>
                                    <th className="px-3 py-2 font-bold text-left">Full name</th>
                                    <th className="px-3 py-2 font-bold text-left">Short name</th>
                                    <th className="px-3 py-2 font-bold text-right whitespace-nowrap">Saldo</th>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">Active since</th>
                                    <th className="px-3 py-2 font-bold text-left">Owner</th>
                                    <th className="px-3 py-2 font-bold text-left">Vollmacht</th>
                                    <th className="px-3 py-2 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((account) => (
                                    <tr key={account.id} className="border-b border-ui-text/10 hover:bg-ui-bg/40">
                                        <td className="px-3 py-2 whitespace-nowrap">{account.type}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{account.account_number}</td>
                                        <td className="px-3 py-2">{account.full_name}</td>
                                        <td className="px-3 py-2">{account.short_name}</td>
                                        <td className={`px-3 py-2 tabular-nums text-right whitespace-nowrap ${account.saldo > 0 ? 'text-green-600' : account.saldo < 0 ? 'text-red-500' : ''}`}>{saldoFormatter.format(account.saldo)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{account.active_since}</td>
                                        <td className="px-3 py-2">{account.owner_name}</td>
                                        <td className="px-3 py-2">{account.vollmacht || '—'}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            <button
                                                type="button"
                                                className="bg-ui-btn-warn text-ui-btn-text font-bold py-1 px-3 rounded-md"
                                                aria-label={`Delete ${account.short_name}`}
                                                onClick={() => handleDelete(account)}
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
                {adding ? (
                    <form onSubmit={handleSave} className="flex flex-col gap-2 mt-4">
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="type" className="text-ui-text font-bold">
                                Type:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="text"
                                id="type"
                                value={form.type}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="account_number" className="text-ui-text font-bold">
                                Account nr / IBAN:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="text"
                                id="account_number"
                                value={form.account_number}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="full_name" className="text-ui-text font-bold">
                                Full name:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="text"
                                id="full_name"
                                value={form.full_name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="short_name" className="text-ui-text font-bold">
                                Short name:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="text"
                                id="short_name"
                                value={form.short_name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="saldo" className="text-ui-text font-bold">
                                Saldo:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="number"
                                step="0.01"
                                id="saldo"
                                value={form.saldo}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="active_since" className="text-ui-text font-bold">
                                Active since:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="date"
                                id="active_since"
                                value={form.active_since}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="owner_name" className="text-ui-text font-bold">
                                Owner:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="text"
                                id="owner_name"
                                value={form.owner_name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                            <label htmlFor="vollmacht" className="text-ui-text font-bold">
                                Vollmacht:
                            </label>
                            <input
                                className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                                type="text"
                                id="vollmacht"
                                value={form.vollmacht}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="mt-4 flex justify-between text-ui-btn-text">
                            <button
                                type="button"
                                className="bg-ui-btn-warn font-bold py-2 px-4 rounded-md"
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="bg-ui-btn font-bold py-2 px-4 rounded-md"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                ) : (
                    <button
                        type="button"
                        className="bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md mt-4"
                        onClick={handleAdd}
                    >
                        Add account
                    </button>
                )}
            </div>
        </div>
    );
}

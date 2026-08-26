import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

const saldoFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

// Intl's percent style multiplies its input by 100 (2.5 would render as
// 250%), but the stored value is already a percentage -- so this formats a
// plain de-DE number and the '%' sign is appended manually below.
const rateFormatter = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function formatRate(value) {
    if (value === null || value === undefined) {
        return '—';
    }
    return `${rateFormatter.format(value)} %`;
}

export default function AccountsPage() {

    const navigate = useNavigate();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
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

    // Toggling a checkbox in the table optimistically flips local state
    // immediately (so the UI feels responsive), then PATCHes both current
    // flag values together -- this is never a partial patch, matching the
    // handler's plain-bool (not pointer) request shape. A failed PATCH
    // reverts the optimistic flip and shows an error rather than leaving
    // the displayed state silently out of sync with the server.
    const handleFlagToggle = async (account, field, value) => {
        setError('');
        const nextFlags = {
            aktiv: field === 'aktiv' ? value : account.aktiv,
            include_in_saldo: field === 'include_in_saldo' ? value : account.include_in_saldo,
        };

        setAccounts((prev) =>
            prev.map((a) => (a.id === account.id ? { ...a, ...nextFlags } : a))
        );

        try {
            const response = await fetch(`http://localhost:8080/accounts/${account.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nextFlags),
            });

            if (!response.ok) {
                setAccounts((prev) =>
                    prev.map((a) =>
                        a.id === account.id
                            ? { ...a, aktiv: account.aktiv, include_in_saldo: account.include_in_saldo }
                            : a
                    )
                );
                setError('Failed to update account');
            }
        } catch (err) {
            console.error('Error updating account:', err);
            setAccounts((prev) =>
                prev.map((a) =>
                    a.id === account.id
                        ? { ...a, aktiv: account.aktiv, include_in_saldo: account.include_in_saldo }
                        : a
                )
            );
            setError('Failed to update account');
        }
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
                                    <th className="px-3 py-2 font-bold text-right whitespace-nowrap">Zinssatz</th>
                                    <th className="px-3 py-2 font-bold text-right whitespace-nowrap">Basiszins</th>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">Active since</th>
                                    <th className="px-3 py-2 font-bold text-left">Owner</th>
                                    <th className="px-3 py-2 font-bold text-left">Vollmacht</th>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">Aktiv</th>
                                    <th className="px-3 py-2 font-bold text-left whitespace-nowrap">In saldo</th>
                                    <th className="px-3 py-2 font-bold text-left">Comment</th>
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
                                        <td className="px-3 py-2 tabular-nums text-right whitespace-nowrap">{formatRate(account.zinssatz)}</td>
                                        <td className="px-3 py-2 tabular-nums text-right whitespace-nowrap">{formatRate(account.basiszins)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{account.active_since}</td>
                                        <td className="px-3 py-2">{account.owner_name}</td>
                                        <td className="px-3 py-2">{account.vollmacht || '—'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <input
                                                className="h-4 w-4 accent-ui-btn"
                                                type="checkbox"
                                                aria-label={`Aktiv: ${account.short_name}`}
                                                checked={account.aktiv}
                                                onChange={(e) => handleFlagToggle(account, 'aktiv', e.target.checked)}
                                            />
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <input
                                                className="h-4 w-4 accent-ui-btn"
                                                type="checkbox"
                                                aria-label={`Include in saldo: ${account.short_name}`}
                                                checked={account.include_in_saldo}
                                                onChange={(e) =>
                                                    handleFlagToggle(account, 'include_in_saldo', e.target.checked)
                                                }
                                            />
                                        </td>
                                        <td className="px-3 py-2 max-w-[16rem] truncate" title={account.comment}>{account.comment || '—'}</td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                            <NavLink
                                                to={`/accounts/${account.id}/edit`}
                                                className="inline-block bg-ui-btn text-ui-btn-text font-bold py-1 px-3 rounded-md mr-2"
                                                aria-label={`Edit ${account.short_name}`}
                                            >
                                                Edit
                                            </NavLink>
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
                <NavLink
                    to="/accounts/new"
                    className="inline-block bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md mt-4"
                >
                    Add account
                </NavLink>
            </div>
        </div>
    );
}

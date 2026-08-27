import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

const EMPTY_FORM = {
    type: 'Haupt',
    account_number: '',
    full_name: '',
    short_name: '',
    saldo: '',
    active_since: '',
    owner_name: '',
    vollmacht: '',
    aktiv: true,
    include_in_saldo: true,
    zinssatz: '',
    basiszins: '',
    comment: '',
};

export default function NewAccountPage() {

    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [error, setError] = useState('');

    // Uses /me as an auth probe; no other data needed here.
    const checkSession = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/me', {
                method: 'GET',
                credentials: 'include',
            });

            if (response.status === 401) {
                navigate('/login');
                return;
            }

            if (!response.ok) {
                setLoadError('Failed to verify session');
                return;
            }

            setLoadError('');
        } catch (err) {
            console.error('Error verifying session:', err);
            setLoadError('Failed to verify session');
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        const loadOnMount = async () => {
            await checkSession();
        };

        loadOnMount();
    }, [checkSession]);

    const handleChange = (e) => {
        const { id, value, type, checked } = e.target;
        setForm({
            ...form,
            [id]: type === 'checkbox' ? checked : value,
        });
    };

    const handleSubmit = async (e) => {
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
            setError('Type, account number, full name, short name, saldo, active since and owner are required');
            return;
        }

        try {
            const response = await fetch('http://localhost:8080/accounts', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...form,
                    saldo: Number(form.saldo),
                    // Empty rate input serializes as null, not 0.
                    zinssatz: form.zinssatz === '' ? null : Number(form.zinssatz),
                    basiszins: form.basiszins === '' ? null : Number(form.basiszins),
                }),
            });

            if (!response.ok) {
                setError('Failed to create account');
                return;
            }

            navigate('/accounts');
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

    if (loadError) {
        return (
            <div className="w-full max-w-md flex flex-col gap-4">
                <h1 className="text-4xl font-bold text-ui-text">New account</h1>
                <p className="text-ui-btn-warn">{loadError}</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <h1 className="text-4xl font-bold text-ui-text">New account</h1>
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                {error && (
                    <p className="text-ui-btn-warn mb-2">{error}</p>
                )}
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="type" className="text-ui-text font-bold">
                            Type:
                        </label>
                        <select
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            id="type"
                            value={form.type}
                            onChange={handleChange}
                        >
                            <option value="Haupt">Haupt</option>
                            <option value="Anlage">Anlage</option>
                        </select>
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
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="aktiv" className="text-ui-text font-bold">
                            Aktiv:
                        </label>
                        <input
                            className="h-4 w-4 accent-ui-btn justify-self-start"
                            type="checkbox"
                            id="aktiv"
                            checked={form.aktiv}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="include_in_saldo" className="text-ui-text font-bold">
                            Include in saldo:
                        </label>
                        <input
                            className="h-4 w-4 accent-ui-btn justify-self-start"
                            type="checkbox"
                            id="include_in_saldo"
                            checked={form.include_in_saldo}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="zinssatz" className="text-ui-text font-bold">
                            Zinssatz (%):
                        </label>
                        <input
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            type="number"
                            step="0.01"
                            id="zinssatz"
                            value={form.zinssatz}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="basiszins" className="text-ui-text font-bold">
                            Basiszins (%):
                        </label>
                        <input
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            type="number"
                            step="0.01"
                            id="basiszins"
                            value={form.basiszins}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="comment" className="text-ui-text font-bold">
                            Comment:
                        </label>
                        <input
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            type="text"
                            id="comment"
                            maxLength={500}
                            value={form.comment}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="submit"
                            className="bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md"
                        >
                            Save account
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

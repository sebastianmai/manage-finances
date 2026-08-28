import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

const EMPTY_FORM = {
    balance_threshold: '',
    show_decimals: true,
};

export default function SettingsPage() {

    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    // Mirrors NewAccountPage's shape: loading card, load-error branch, card
    // + form. Unlike NewAccountPage's /me auth probe, this loads the actual
    // settings so the form starts seeded with the user's real values.
    const loadSettings = useCallback(async () => {
        try {
            const response = await fetch('http://localhost:8080/settings', {
                method: 'GET',
                credentials: 'include',
            });

            if (response.status === 401) {
                navigate('/login');
                return;
            }

            if (!response.ok) {
                setLoadError('Failed to load settings');
                return;
            }

            const { settings } = await response.json();
            setForm({
                // Stringified so the controlled number input never flips
                // between controlled and uncontrolled.
                balance_threshold: String(settings.balance_threshold),
                show_decimals: settings.show_decimals,
            });
        } catch (err) {
            console.error('Error loading settings:', err);
            setLoadError('Failed to load settings');
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        const loadOnMount = async () => {
            await loadSettings();
        };

        loadOnMount();
    }, [loadSettings]);

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
        setSaved(false);

        const threshold = Number(form.balance_threshold);
        if (form.balance_threshold === '' || Number.isNaN(threshold) || threshold <= 0) {
            setError('Balance threshold must be a positive number');
            return;
        }

        try {
            const response = await fetch('http://localhost:8080/settings', {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    balance_threshold: threshold,
                    show_decimals: form.show_decimals,
                }),
            });

            if (!response.ok) {
                setError('Failed to save settings');
                return;
            }

            setSaved(true);
        } catch (err) {
            console.error('Error saving settings:', err);
            setError('Failed to save settings');
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
                <h1 className="text-4xl font-bold text-ui-text">Settings</h1>
                <p className="text-ui-btn-warn">{loadError}</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <h1 className="text-4xl font-bold text-ui-text">Settings</h1>
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                {error && (
                    <p className="text-ui-btn-warn mb-2">{error}</p>
                )}
                {saved && (
                    <p className="text-ui-text mb-2">Settings saved.</p>
                )}
                {/*
                    balance_threshold controls the dashed reference line on
                    the accounts Balance chart; show_decimals controls
                    whether Home's headline Total balance figure shows
                    cents. Nothing else in the app reads either value.
                */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="balance_threshold" className="text-ui-text font-bold">
                            Balance threshold:
                        </label>
                        <input
                            className="bg-ui-bg text-ui-text rounded-md py-2 px-3 focus:outline-none focus:ring-2"
                            type="number"
                            step="1"
                            id="balance_threshold"
                            value={form.balance_threshold}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
                        <label htmlFor="show_decimals" className="text-ui-text font-bold">
                            Show decimals:
                        </label>
                        <input
                            className="h-4 w-4 accent-ui-btn justify-self-start"
                            type="checkbox"
                            id="show_decimals"
                            checked={form.show_decimals}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button
                            type="submit"
                            className="bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md"
                        >
                            Save settings
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

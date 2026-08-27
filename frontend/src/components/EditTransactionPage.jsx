import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import CategoryComboBox from './CategoryComboBox';

export default function EditTransactionPage() {

    const navigate = useNavigate();
    const { id } = useParams();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [form, setForm] = useState(null);
    const [error, setError] = useState('');
    const [categories, setCategories] = useState([]);

    // No GET /transactions/{id}; finds it in the list instead.
    const loadTransaction = useCallback(async () => {
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
                setLoadError('Failed to load transaction');
                return;
            }

            const { transactions } = await response.json();
            // Route param is a string, id is numeric -- normalise both.
            const transaction = transactions.find(
                (candidate) => String(candidate.id) === id
            );

            if (!transaction) {
                setLoadError('Transaction not found');
                return;
            }

            setForm({
                transaction_date: transaction.transaction_date,
                category: transaction.category,
                description: transaction.description,
                amount: String(transaction.amount),
            });
            setLoadError('');
        } catch (err) {
            console.error('Error getting transaction:', err);
            setLoadError('Failed to load transaction');
        } finally {
            setLoading(false);
        }
    }, [navigate, id]);

    // Non-blocking: failure just leaves suggestions empty.
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
            await loadTransaction();
            await getCategories();
        };

        loadOnMount();
    }, [loadTransaction, getCategories]);

    const handleChange = (e) => {
        const { id: fieldId, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [fieldId]: value,
        }));
    };

    const handleCategoryChange = (nextCategory) => {
        setForm((prev) => ({ ...prev, category: nextCategory }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (
            !form.transaction_date ||
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

        try {
            const response = await fetch(`http://localhost:8080/transactions/${id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                // No account_id: accounts can't be changed here.
                body: JSON.stringify({
                    transaction_date: form.transaction_date,
                    category: form.category,
                    description: form.description,
                    amount: amountNumber,
                }),
            });

            if (!response.ok) {
                setError('Failed to save transaction');
                return;
            }

            navigate('/transactions');
        } catch (err) {
            console.error('Error saving transaction:', err);
            setError('Failed to save transaction');
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
                <h1 className="text-4xl font-bold text-ui-text">Edit booking</h1>
                <p className="text-ui-btn-warn">{loadError}</p>
            </div>
        );
    }

    // Guards the brief window during a 401 redirect.
    if (!form) {
        return null;
    }

    return (
        <div className="w-full max-w-md flex flex-col gap-4">
            <h1 className="text-4xl font-bold text-ui-text">Edit booking</h1>
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
                        <label htmlFor="category" className="text-ui-text font-bold">
                            Category:
                        </label>
                        {/* Free text: new categories are created on save. */}
                        <CategoryComboBox
                            id="category"
                            value={form.category}
                            categories={categories}
                            onChange={handleCategoryChange}
                        />
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
                    <div className="mt-4 flex justify-end">
                        <button
                            type="submit"
                            className="bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md"
                        >
                            Save changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

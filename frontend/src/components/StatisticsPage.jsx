import { useState, useEffect } from 'react';
import BalanceHistoryChart from './BalanceHistoryChart';
import AccountMultiSelect from './AccountMultiSelect';

const EMPTY_HISTORY = { months: [], total: [], accounts: [] };

// Sums checked accounts by month; not gated on include_in_saldo.
function sumAccountPoints(accounts, months) {
    return months.map((month) => {
        const sum = accounts.reduce((runningSum, account) => {
            const point = account.points.find((candidate) => candidate.month === month);
            return runningSum + (point ? point.balance : 0);
        }, 0);
        return { month, balance: Math.round(sum * 100) / 100 };
    });
}

// Filters points to the selected year range.
function narrowToYearWindow(points, fromYear, toYear) {
    return points.filter((point) => {
        const year = Number(point.month.slice(0, 4));
        return year >= Number(fromYear) && year <= Number(toYear);
    });
}

export default function StatisticsPage() {

    const [history, setHistory] = useState(EMPTY_HISTORY);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [sumSelected, setSumSelected] = useState(false);
    const [fromYear, setFromYear] = useState('');
    const [toYear, setToYear] = useState('');

    useEffect(() => {
        const getBalanceHistory = async () => {
            try {
                const response = await fetch('http://localhost:8080/balance/history', {
                    method: 'GET',
                    credentials: 'include',
                });

                if (!response.ok) {
                    setError('Failed to load statistics');
                    return;
                }

                const { history: userHistory } = await response.json();
                setHistory(userHistory);

                if (userHistory.months.length > 0) {
                    setFromYear(String(Number(userHistory.months[0].slice(0, 4))));
                    setToYear(String(Number(userHistory.months[userHistory.months.length - 1].slice(0, 4))));
                }
                setError('');
            } catch (err) {
                console.error('Error getting balance history:', err);
                setError('Failed to load statistics');
            } finally {
                setLoading(false);
            }
        };

        getBalanceHistory();
    }, []);

    // Year options come from the canonical months axis, not the selection.
    const years = [...new Set(history.months.map((month) => Number(month.slice(0, 4))))].sort(
        (a, b) => a - b
    );

    // Ordered by backend order, not click order, for stable colours.
    const selectedAccounts = history.accounts.filter(
        (account) => selectedAccountIds.includes(account.account_id)
    );

    let rawSeries;
    if (selectedAccounts.length === 0) {
        rawSeries = [{ id: 'total', label: 'Total balance', points: history.total }];
    } else if (selectedAccounts.length === 1) {
        const [account] = selectedAccounts;
        rawSeries = [{ id: account.account_id, label: account.short_name, points: account.points }];
    } else if (sumSelected) {
        rawSeries = [{
            id: 'sum',
            label: 'Sum of selected accounts',
            points: sumAccountPoints(selectedAccounts, history.months),
        }];
    } else {
        rawSeries = selectedAccounts.map((account) => ({
            id: account.account_id,
            label: account.short_name,
            points: account.points,
        }));
    }

    // Same narrowing helper applied to every series, every mode.
    const series = rawSeries.map((oneSeries) => ({
        ...oneSeries,
        points: narrowToYearWindow(oneSeries.points, fromYear, toYear),
    }));

    const handleAccountToggle = (accountId) => {
        setSelectedAccountIds((previousIds) => (
            previousIds.includes(accountId)
                ? previousIds.filter((id) => id !== accountId)
                : [...previousIds, accountId]
        ));
    };

    const handleRemoveAccount = (accountId) => {
        setSelectedAccountIds((previousIds) => previousIds.filter((id) => id !== accountId));
    };

    // Clamped so the range can never invert.
    const handleFromYearChange = (event) => {
        const nextFromYear = event.target.value;
        setFromYear(nextFromYear);
        if (Number(nextFromYear) > Number(toYear)) {
            setToYear(nextFromYear);
        }
    };

    const handleToYearChange = (event) => {
        const nextToYear = event.target.value;
        setToYear(nextToYear);
        if (Number(nextToYear) < Number(fromYear)) {
            setFromYear(nextToYear);
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
            <h1 className="text-4xl font-bold text-ui-text">Statistics</h1>
            {error && (
                <p className="text-ui-btn-warn">{error}</p>
            )}
            {!error && (
                <>
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-ui-text font-bold text-sm">Accounts:</span>
                            {/* 0 checked = Total; 2+ = overlay. */}
                            <AccountMultiSelect
                                accounts={history.accounts}
                                selectedAccountIds={selectedAccountIds}
                                onToggleAccount={handleAccountToggle}
                                onSelectedAccountIdsChange={setSelectedAccountIds}
                                sumSelected={sumSelected}
                                onSumSelectedChange={setSumSelected}
                            />
                        </div>
                        {years.length > 0 && (
                            <>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="statistics-from-year" className="text-ui-text font-bold text-sm">
                                        From year:
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="h-[2.625rem] appearance-none rounded-full border border-ui-text/20 bg-ui-bg text-ui-text py-2 pl-4 pr-9 focus:outline-none focus:ring-2 focus:border-ui-btn"
                                            id="statistics-from-year"
                                            value={fromYear}
                                            onChange={handleFromYearChange}
                                        >
                                            {years.map((year) => (
                                                <option key={year} value={year}>
                                                    {year}
                                                </option>
                                            ))}
                                        </select>
                                        <svg
                                            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-text/50"
                                            viewBox="0 0 20 20"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            aria-hidden="true"
                                        >
                                            <polyline points="6 8 10 12 14 8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="statistics-to-year" className="text-ui-text font-bold text-sm">
                                        To year:
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="h-[2.625rem] appearance-none rounded-full border border-ui-text/20 bg-ui-bg text-ui-text py-2 pl-4 pr-9 focus:outline-none focus:ring-2 focus:border-ui-btn"
                                            id="statistics-to-year"
                                            value={toYear}
                                            onChange={handleToYearChange}
                                        >
                                            {years.map((year) => (
                                                <option key={year} value={year}>
                                                    {year}
                                                </option>
                                            ))}
                                        </select>
                                        <svg
                                            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-text/50"
                                            viewBox="0 0 20 20"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            aria-hidden="true"
                                        >
                                            <polyline points="6 8 10 12 14 8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    {selectedAccounts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedAccounts.map((account) => (
                                <span
                                    key={account.account_id}
                                    className="flex items-center gap-1 rounded-full border border-ui-text/20 bg-ui-light-bg text-ui-text text-sm py-1 px-3"
                                >
                                    {account.short_name}
                                    <button
                                        type="button"
                                        className="text-ui-text/70 font-bold hover:text-ui-btn-warn"
                                        aria-label={`Remove account: ${account.short_name}`}
                                        onClick={() => handleRemoveAccount(account.account_id)}
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                        <BalanceHistoryChart series={series} />
                    </div>
                </>
            )}
        </div>
    );
}

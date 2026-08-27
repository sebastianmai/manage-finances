import { useState, useEffect } from 'react';
import BalanceHistoryChart from './BalanceHistoryChart';
import AccountMultiSelect from './AccountMultiSelect';

const EMPTY_HISTORY = { months: [], total: [], accounts: [] };

// Sums exactly the given accounts' points over the canonical `months` axis,
// looked up by month key (not array index) so accounts with sparser
// histories still align correctly, then rounds the same way the backend's
// totalSeries does. This deliberately does NOT gate on `include_in_saldo`
// -- the sum is over whatever the user checked, full stop. The
// all-accounts-sum-equals-Total expectation from CONTEXT only holds when
// the checked set happens to equal the include_in_saldo set; a future
// reader must not "fix" this into a gate, that would silently change what
// the checkbox sums.
function sumAccountPoints(accounts, months) {
    return months.map((month) => {
        const sum = accounts.reduce((runningSum, account) => {
            const point = account.points.find((candidate) => candidate.month === month);
            return runningSum + (point ? point.balance : 0);
        }, 0);
        return { month, balance: Math.round(sum * 100) / 100 };
    });
}

// The window at exactly one call site (in the series construction below) is
// what keeps D-04's identical-values guarantee structural rather than a
// promise -- every series, in every mode, is narrowed the same way.
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

    // The year options come from the canonical months axis rather than from
    // whichever series is currently selected, so the range control does not
    // shift under the user when they drill into an account with a shorter
    // history -- every series shares the same dense axis by construction,
    // which is exactly what the backend guarantees.
    const years = [...new Set(history.months.map((month) => Number(month.slice(0, 4))))].sort(
        (a, b) => a - b
    );

    // Filtering over history.accounts (backend order), not over
    // selectedAccountIds (click order), is the entire mechanism behind
    // stable colours: a line's position in the series array -- and
    // therefore its colour -- can never depend on which checkbox the user
    // clicked first.
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

    // Narrowing every series through this one shared helper, as the last
    // construction step, is what keeps D-04's byte-identical guarantee true
    // under all four modes -- there is no second, mode-specific narrowing
    // path that could drift from this one.
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

    // The clamping exists so the window can never invert into a range that
    // plots nothing.
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
                            {/* Zero checked plots Total; 2+ checked overlays
                                one line per account, ordered by
                                history.accounts (backend order) so a line's
                                colour never depends on click order. */}
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
                                    <select
                                        className="rounded-full bg-ui-bg text-ui-text py-2 px-4 focus:outline-none focus:ring-2"
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
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="statistics-to-year" className="text-ui-text font-bold text-sm">
                                        To year:
                                    </label>
                                    <select
                                        className="rounded-full bg-ui-bg text-ui-text py-2 px-4 focus:outline-none focus:ring-2"
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
                                </div>
                            </>
                        )}
                    </div>
                    <div className="bg-ui-light-bg p-6 rounded-lg shadow-md text-ui-text">
                        <BalanceHistoryChart series={series} />
                    </div>
                </>
            )}
        </div>
    );
}

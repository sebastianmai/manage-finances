import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AccountRatesChart, { DEFAULT_BALANCE_THRESHOLD } from './AccountRatesChart';

// This is the ONLY formatter in the app that consults show_decimals; every
// other currency display -- the accounts table, the chart's axis and
// labels, BalanceHistoryChart, TransactionsPage -- keeps its own formatter
// untouched. showDecimals: true reproduces the previous balanceFormatter's
// output exactly, because style:'currency' with EUR already defaults to 2
// fraction digits -- that equivalence is why this is safe to ship without
// touching any other display.
const totalBalanceFormatter = (showDecimals) => new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
});

export default function Home() {

    const [user, setUser] = useState(null);
    const [balance, setBalance] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [balanceError, setBalanceError] = useState("");
    const [accountsError, setAccountsError] = useState("");
    // Seeded with the defaults, not null: loading, failure and logged-out
    // all render the same values the page renders today, with no
    // null-guard needed at either use site below.
    const [settings, setSettings] = useState({
        balance_threshold: DEFAULT_BALANCE_THRESHOLD,
        show_decimals: true,
    });

    useEffect(() => {
        const getUser = async () => {
            try {
                const response = await fetch("http://localhost:8080/me", {
                    method: "GET",
                    credentials: "include",
                });

                if (!response.ok) {
                    setUser(null);
                    setBalance(null);
                    return;
                }

                const { user: loggedInUser } = await response.json();
                setUser(loggedInUser);

                // Fetched independently so one failure doesn't skip the other.
                try {
                    const balanceResponse = await fetch("http://localhost:8080/balance", {
                        method: "GET",
                        credentials: "include",
                    });

                    if (!balanceResponse.ok) {
                        setBalanceError("Failed to load balance");
                    } else {
                        const { balance: userBalance } = await balanceResponse.json();
                        setBalance(userBalance);
                        setBalanceError("");
                    }
                } catch (error) {
                    console.error("Error getting balance:", error);
                    setBalanceError("Failed to load balance");
                }

                try {
                    const accountsResponse = await fetch("http://localhost:8080/accounts", {
                        method: "GET",
                        credentials: "include",
                    });

                    if (!accountsResponse.ok) {
                        setAccountsError("Failed to load accounts");
                    } else {
                        const { accounts: userAccounts } = await accountsResponse.json();
                        setAccounts(userAccounts);
                        setAccountsError("");
                    }
                } catch (error) {
                    console.error("Error getting accounts:", error);
                    setAccountsError("Failed to load accounts");
                }

                // Placed last, after /accounts: this keeps the existing
                // toHaveBeenNthCalledWith(3, '/accounts', ...) test true.
                // Deliberately the one fetch on this page with no
                // user-visible error branch, unlike balance and accounts --
                // a display preference failing to load is not something a
                // user can act on, and surfacing it would put a red error
                // on a page that is otherwise rendering correctly.
                try {
                    const settingsResponse = await fetch("http://localhost:8080/settings", {
                        method: "GET",
                        credentials: "include",
                    });

                    if (settingsResponse.ok) {
                        const { settings: userSettings } = await settingsResponse.json();
                        setSettings(userSettings);
                    }
                } catch (error) {
                    console.error("Error getting settings:", error);
                }
            } catch (error) {
                console.error("Error getting user:", error);
                setUser(null);
                setBalance(null);
            } finally {
                setCheckingAuth(false);
            }
        };

        getUser();
        window.addEventListener("authchange", getUser);
        return () => window.removeEventListener("authchange", getUser);
    }, []);

    if (checkingAuth) {
        return null;
    }

    if (!user) {
        return (
            <div className="w-full max-w-2xl flex flex-col items-center text-center gap-4">
                <h1 className="text-4xl font-bold text-ui-text">Welcome to My-Finances</h1>
                <p className="text-ui-text/70">
                    A simple, personal finance tracker to help you see where your money stands at a glance.
                </p>
                <div className="flex items-center gap-4 mt-2">
                    <button className="bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md">
                        <NavLink to="/login">Log In</NavLink>
                    </button>
                    <button className="bg-ui-signup-btn text-ui-btn-text font-bold py-2 px-4 rounded-md">
                        <NavLink to="/sign-up">Sign Up</NavLink>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl flex flex-col gap-4">
            <h1 className="text-4xl font-bold text-ui-text">Welcome back, {user.first_name}</h1>
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md">
                <p className="text-ui-text/70">Total balance</p>
                {balanceError ? (
                    <p className="text-ui-btn-warn">{balanceError}</p>
                ) : (
                    <>
                        <p className="text-3xl font-bold tabular-nums text-ui-text">
                            {balance === null ? "..." : totalBalanceFormatter(settings.show_decimals).format(balance)}
                        </p>
                        {balance === 0 && (
                            <p className="text-ui-text/70 text-sm mt-1">
                                No transactions have been recorded yet.
                            </p>
                        )}
                    </>
                )}
            </div>
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md">
                <p className="text-ui-text/70 mb-2">Accounts overview</p>
                {accountsError ? (
                    <p className="text-ui-btn-warn">{accountsError}</p>
                ) : (
                    <AccountRatesChart accounts={accounts} balanceThreshold={settings.balance_threshold} />
                )}
            </div>
            <div>
                <button className="bg-ui-btn text-ui-btn-text font-bold py-2 px-4 rounded-md">
                    <NavLink to="/transactions/new">New booking</NavLink>
                </button>
            </div>
        </div>
    );
}

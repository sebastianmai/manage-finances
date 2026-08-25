import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';

const balanceFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

export default function Home() {

    const [user, setUser] = useState(null);
    const [balance, setBalance] = useState(null);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [balanceError, setBalanceError] = useState("");

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

                try {
                    const balanceResponse = await fetch("http://localhost:8080/balance", {
                        method: "GET",
                        credentials: "include",
                    });

                    if (!balanceResponse.ok) {
                        setBalanceError("Failed to load balance");
                        return;
                    }

                    const { balance: userBalance } = await balanceResponse.json();
                    setBalance(userBalance);
                    setBalanceError("");
                } catch (error) {
                    console.error("Error getting balance:", error);
                    setBalanceError("Failed to load balance");
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
                            {balance === null ? "..." : balanceFormatter.format(balance)}
                        </p>
                        {balance === 0 && (
                            <p className="text-ui-text/70 text-sm mt-1">
                                No transactions have been recorded yet.
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

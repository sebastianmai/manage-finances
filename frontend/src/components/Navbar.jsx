import sun from '../assets/sun_rm.svg';
import moon from '../assets/moon_rm.svg';
import { NavLink } from 'react-router-dom';
import Profile from './Profile';
import { useState, useEffect } from 'react';

const navigation = [
    { name: 'My-Finances', href: '/', current: true },
]

export default function Navbar({ theme, setTheme }) {

    const [user, setUser] = useState(null);
    const [checkingAuth, setCheckingAuth] = useState(true);

    useEffect(() => {
        const getUser = async () => {
            try {
                const response = await fetch("http://localhost:8080/me", {
                    method: "GET",
                    credentials: "include",
                });

                if (!response.ok) {
                    setUser(null);
                    return;
                }

                const { user: loggedInUser } = await response.json();
                setUser(loggedInUser);
            } catch (error) {
                console.error("Error getting user:", error);
                setUser(null);
            } finally {
                setCheckingAuth(false);
            }
        };

        getUser();
        window.addEventListener("authchange", getUser);
        return () => window.removeEventListener("authchange", getUser);
    }, []);

    const handleClick = () => {

        if (theme === 'dark') {
            setTheme('light');
        } else {
            setTheme('dark');
        }

        console.log('Theme is:', theme);
    }

    return (
        <div className="min-h-full bg-ui-light-bg">
            <div className="hidden sm:flex sm:items-center sm:justify-between sm:ml-6 sm:mr-6 sm:py-3">
                <div className="flex items-center space-x-4">
                    {navigation.map((item) => (
                        <button
                            key={item.name}
                            type="button"
                            className="px-4 py-2 bg-ui-btn text-ui-btn-text rounded font-bold"
                            onClick={() => { console.log(`Navigating to ${item.name}`) }}
                        >
                            <NavLink to={item.href}>{item.name}</NavLink>
                        </button>
                    ))}
                    {user && (
                        <button type="button" className="px-4 py-2 bg-ui-btn text-ui-btn-text rounded font-bold">
                            <NavLink to="/accounts">Accounts</NavLink>
                        </button>
                    )}
                    {user && (
                        <button type="button" className="px-4 py-2 bg-ui-btn text-ui-btn-text rounded font-bold">
                            <NavLink to="/transactions">Transactions</NavLink>
                        </button>
                    )}
                </div>
                <div className="flex items-center">
                    {checkingAuth ? null : user ? (<Profile theme={theme} setTheme={setTheme}/>):
                    (
                    <button className=" px-4 py-2 bg-ui-btn text-ui-btn-text rounded font-bold">
                        <NavLink to="/login">Log In</NavLink>
                    </button>
                    )}
                    <button className="px-4 py-2" onClick={handleClick}>
                        <img
                            src={theme === 'dark' ? sun : moon}
                            alt="Theme toggle"
                            className="h-6 w-6"
                            style={theme === 'dark' ? { filter: 'brightness(0) invert(1)' } : undefined}
                        />
                    </button>
                </div>
            </div>
        </div>
    )
}
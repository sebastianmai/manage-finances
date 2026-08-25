import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Login() {


  const navigate = useNavigate();

    const [user, setUser] = useState({
        email: "",
        password: "",
    });

    const handleChange = (e) => {
        setUser({
            ...user,
            [e.target.id]: e.target.value,
        });
    };


    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!user.email || !user.password) {
            console.log("Please fill in all fields");
            return;
        }

        try {
            let body = JSON.stringify(user);
            const response = await fetch("http://localhost:8080/login", {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: body,
            });

            console.log("Response status:", response.status);

            if (!response.ok) {
                setUser({
                    email: "",
                    password: "",
                });
                return;
            } else {
                const loggedInUser = await response.json();

                console.log("Login successful:", loggedInUser);

                // Notify Navbar (mounted once at the Router level, so it
                // won't pick this up from a re-render) to re-fetch /me.
                window.dispatchEvent(new Event("authchange"));

                navigate("/");
            }
        } catch (error) {
            console.error("Error logging in:", error);
        }
    };

    return (
        <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-md flex flex-col items-center">
            <div>
                <h1 className="text-2xl text-ui-text font-bold mb-4">Sign Up</h1>
            </div>
            <div className="w-full text-ui-text">
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <label htmlFor="email" className="text-ui-text">
                        email:
                    </label>
                    <input 
                        className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500" 
                        type="text" 
                        id="email" 
                        placeholder="Enter your email" 
                        autoComplete="email" 
                        value={user.email}
                        onChange={handleChange} 
                    />
                    <label htmlFor="password">
                        Password:
                    </label>
                    <input 
                        className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500" 
                        type="password" 
                        id="password" 
                        placeholder="Enter your password" 
                        autoComplete="current-password" 
                        value={user.password}
                        onChange={handleChange} 
                    />
                </form>
                <div className="mt-4 flex justify-between text-ui-btn-text">
                    <button className="bg-ui-btn-warn font-bold py-2 px-4 rounded-md">
                        <NavLink to="/">Cancel</NavLink>
                    </button>
                    <button className="bg-ui-btn  font-bold py-2 px-4 rounded-md" onClick={handleSubmit}>Log In</button>
                </div>
                <hr className="my-5 mx-3 border-t border-ui-text opacity-40"></hr>
                <div className="flex justify-center text-ui-text">
                    <p className="text-ui-text">
                        No account yet? <NavLink to="/sign-up" className="text-ui-signup-btn underline">Sign up here</NavLink>
                    </p>
                </div>

            </div>
        </div>
    );
}
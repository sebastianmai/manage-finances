import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function ProfilePage() {

    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ first_name: "", last_name: "", email: "" });
    const [error, setError] = useState("");

    useEffect(() => {
        const getUser = async () => {
            try {
                const response = await fetch("http://localhost:8080/me", {
                    method: "GET",
                    credentials: "include",
                });

                if (!response.ok) {
                    navigate("/login");
                    return;
                }

                const { user: loggedInUser } = await response.json();
                setUser(loggedInUser);
                setForm({
                    first_name: loggedInUser.first_name,
                    last_name: loggedInUser.last_name,
                    email: loggedInUser.email,
                });
            } catch (err) {
                console.error("Error getting user:", err);
                navigate("/login");
            } finally {
                setLoading(false);
            }
        };

        getUser();
    }, [navigate]);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.id]: e.target.value,
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setError("");

        if (!form.first_name || !form.last_name || !form.email) {
            setError("All fields are required");
            return;
        }

        try {
            const response = await fetch("http://localhost:8080/me", {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
            });

            if (!response.ok) {
                setError("Failed to update profile");
                return;
            }

            const { user: updatedUser } = await response.json();
            setUser(updatedUser);
            setEditing(false);
        } catch (err) {
            console.error("Error updating user:", err);
            setError("Failed to update profile");
        }
    };

    const handleCancel = () => {
        setForm({
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
        });
        setError("");
        setEditing(false);
    };

    const handleLogout = async () => {
        try {
            await fetch("http://localhost:8080/logout", {
                method: "POST",
                credentials: "include",
            });
        } catch (err) {
            console.error("Error logging out:", err);
        } finally {
            window.dispatchEvent(new Event("authchange"));
            navigate("/login");
        }
    };

    if (loading) {
        return (
            <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-md text-ui-text">
                Loading...
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-md flex flex-col items-center">
            <div>
                <h1 className="text-2xl text-ui-text font-bold mb-4">Profile</h1>
            </div>
            <div className="w-full text-ui-text">
                {error && (
                    <p className="text-ui-btn-warn mb-2">{error}</p>
                )}
                {editing ? (
                    <form onSubmit={handleSave} className="flex flex-col gap-2">
                        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                            <label htmlFor="first_name" className="text-ui-text font-bold">
                                First name:
                            </label>
                            <input
                                className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
                                type="text"
                                id="first_name"
                                value={form.first_name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                            <label htmlFor="last_name" className="text-ui-text font-bold">
                                Last name:
                            </label>
                            <input
                                className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
                                type="text"
                                id="last_name"
                                value={form.last_name}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                            <label htmlFor="email" className="text-ui-text font-bold">
                                Email:
                            </label>
                            <input
                                className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
                                type="email"
                                id="email"
                                value={form.email}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="mt-4 flex justify-between text-ui-btn-text">
                            <button
                                type="button"
                                className="bg-ui-btn-warn font-bold py-2 px-4 rounded-md"
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="bg-ui-btn font-bold py-2 px-4 rounded-md"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-[110px_1fr] gap-2">
                            <span className="font-bold">First name:</span>
                            <span>{user.first_name}</span>
                        </div>
                        <div className="grid grid-cols-[110px_1fr] gap-2">
                            <span className="font-bold">Last name:</span>
                            <span>{user.last_name}</span>
                        </div>
                        <div className="grid grid-cols-[110px_1fr] gap-2">
                            <span className="font-bold">Email:</span>
                            <span>{user.email}</span>
                        </div>
                        <div className="mt-4 flex justify-between text-ui-btn-text">
                            <button
                                className="bg-ui-btn font-bold py-2 px-4 rounded-md"
                                onClick={() => setEditing(true)}
                            >
                                Edit
                            </button>
                            <button
                                className="bg-ui-btn-warn font-bold py-2 px-4 rounded-md"
                                onClick={handleLogout}
                            >
                                Log Out
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

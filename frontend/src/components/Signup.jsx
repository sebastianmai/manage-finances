import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Signup() {
  const navigate = useNavigate();
  const [user, setUser] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    password_confirmation: "",
  });

  const handleChange = (e) => {
    setUser({
      ...user,
      [e.target.id]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (user.password !== user.password_confirmation) {
      console.log("Passwords do not match");
      return;
    }

    try {
      let body = JSON.stringify(user);
      console.log("Sending request with body:", body);

      const response = await fetch("http://localhost:8080/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body,
      });

      if (!response.ok) {
        throw new Error("Failed to sign up");
      }
      const data = await response.json();
      console.log("User signed up successfully:", data);
      navigate("/");
    } catch (error) {
      console.error("Error signing up:", error);
    }
  };

  return (
    <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-md flex flex-col items-center">
      <div>
        <h1 className="text-2xl text-ui-text font-bold mb-4">Sign Up</h1>
      </div>
      <div className="w-full text-ui-text font-medium">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="first_name" className="text-ui-text font-medium">
                First name
              </label>
              <input
                className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
                type="text"
                id="first_name"
                placeholder="First name"
                value={user.first_name}
                onChange={handleChange}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="last_name" className="text-ui-text font-medium">
                Last name
              </label>
              <input
                className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
                type="text"
                id="last_name"
                placeholder="Last name"
                value={user.last_name}
                onChange={handleChange}
              />
            </div>
          </div>
          <label htmlFor="email" className="text-ui-text">
            Email:
          </label>
          <input
            className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
            type="email"
            id="email"
            placeholder="Enter your email"
            value={user.email}
            onChange={handleChange}
          />
          <label htmlFor="password" className="text-ui-text">
            Password:
          </label>
          <input
            className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
            type="password"
            id="password"
            placeholder="Enter your password"
            value={user.password}
            onChange={handleChange}
          />
          <label htmlFor="password_confirmation" className="text-ui-text">
            Repeat Confirmation:
          </label>
          <input
            className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500"
            type="password"
            id="password_confirmation"
            placeholder="Repeat your password"
            value={user.password_confirmation}
            onChange={handleChange}
          />
          <div className="mt-4 flex justify-between text-ui-btn-text">
            <button className="bg-ui-btn-warn font-bold py-2 px-4 rounded-md">
              <NavLink to="/login">Cancel</NavLink>
            </button>
            <button className="bg-ui-btn  font-bold py-2 px-4 rounded-md">
              Sign Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

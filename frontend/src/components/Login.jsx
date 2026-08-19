import {NavLink} from 'react-router-dom';

export default function Login() {


    const handleSubmit = async () => {};

    return (
        <div className="bg-ui-light-bg p-6 rounded-lg shadow-md w-full max-w-md flex flex-col items-center">
            <div>
                <h1 className="text-2xl text-ui-text font-bold mb-4">Sign Up</h1>
            </div>
            <div className="w-full text-ui-text">
                <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <label htmlFor="username" className="text-ui-text">
                        Username:
                    </label>
                    <input className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500" type="text" id="username" placeholder="Enter your username" />
                    <label htmlFor="password">
                        Password:
                    </label>
                    <input className="border border-ui-border rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:bg-ui-btn-500" type="password" id="password" placeholder="Enter your password" />
                </form>
                <div className="mt-4 flex justify-between text-ui-btn-text">
                    <button className="bg-ui-btn-warn font-bold py-2 px-4 rounded-md">
                        <NavLink to="/">Cancel</NavLink>
                    </button>
                    <button className="bg-ui-btn  font-bold py-2 px-4 rounded-md">Log In</button>
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
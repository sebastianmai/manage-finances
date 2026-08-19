import sun from '../assets/sun_rm.svg';
import moon from '../assets/moon_rm.svg';
import { NavLink } from 'react-router-dom';

const navigation = [
    { name: 'Home', href: '/', current: true },
]

export default function Navbar({ theme, setTheme }) {

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
                </div>
                <button className="ml-auto px-4 py-2 bg-ui-btn text-ui-btn-text rounded font-bold">
                    <NavLink to="/sign-up">Sign Up</NavLink>
                </button>
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
    )
}
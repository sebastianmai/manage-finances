import profile from '../assets/profile.svg';
import { NavLink } from 'react-router-dom';

export default function Profile({ theme, setTheme }) {
    return (
        <NavLink to="/profile" className="px-4 py-2 inline-flex items-center">
            <img src={profile} alt="Profile"
                    className="h-6 w-6"
                    style={theme === 'dark' ? { filter: 'brightness(0) invert(1)' } : undefined}
            />
        </NavLink>
    );
}
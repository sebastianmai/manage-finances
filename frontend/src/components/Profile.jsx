import profile from '../assets/profile.svg';

export default function Profile({ theme, setTheme }) {
    return (
        <div>
            <button className="px-4 py-2" onClick={() => { console.log('Profile button clicked') }}>
                <img src={profile} alt="Profile"
                        className="h-6 w-6"
                        style={theme === 'dark' ? { filter: 'brightness(0) invert(1)' } : undefined}
                />
            </button>
        </div>
    );
}
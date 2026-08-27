import { useState, useEffect } from 'react';

// How far down the page has to scroll before the button appears -- small
// enough to be useful on a medium-length page, large enough that it does
// not flicker in right after the page loads.
const SCROLL_SHOW_THRESHOLD = 10;

export default function ScrollToTopButton() {

    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setVisible(window.scrollY > SCROLL_SHOW_THRESHOLD);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleClick = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!visible) {
        return null;
    }

    return (
        <button
            type="button"
            className="fixed bottom-6 right-6 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-ui-btn/60 text-ui-btn-text shadow-lg hover:bg-ui-btn/90 transition-colors focus:outline-none focus:ring-2"
            aria-label="Scroll to top"
            onClick={handleClick}
        >
            {/* Path from src/assets/arrow.svg, inlined so it can pick up
                text-ui-btn-text via currentColor and work in both themes,
                the same way every other icon in this app is done -- the
                asset's own hardcoded stroke="#000000" would not adapt. */}
            <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
            >
                <path d="M12 5V19M12 5L6 11M12 5L18 11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    );
}

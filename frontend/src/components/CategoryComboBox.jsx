import { useState, useRef, useEffect } from 'react';

/**
 * App-styled, ARIA-compliant replacement for the native
 * `<input list>` + `<datalist>` category field. Fully controlled: the
 * parent owns `value` and receives plain next-string updates through
 * `onChange`, both when the user types and when a suggestion (including
 * the "create new" hint row) is selected.
 */
export default function CategoryComboBox({ id, value, onChange, categories, maxLength = 50 }) {
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef(null);

    // Derived at render rather than mirrored into state, so the panel
    // contents can never drift out of sync with the controlled value.
    const query = value.trim();
    const lowerQuery = query.toLowerCase();
    const matches = query === ''
        ? categories
        : categories.filter((category) => category.toLowerCase().includes(lowerQuery));
    const showCreateRow = query !== '' && matches.length === 0;
    const panelIsVisible = open && (matches.length > 0 || showCreateRow);
    const rowCount = matches.length + (showCreateRow ? 1 : 0);
    const listboxId = `${id}-listbox`;

    const rowId = (index) => (
        index < matches.length ? `${id}-option-${index}` : `${id}-option-create`
    );

    const activeDescendantId = highlightedIndex >= 0 ? rowId(highlightedIndex) : undefined;

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        // Clicking anywhere outside the combobox closes the panel without
        // touching the typed text. mousedown, not click, so the panel is
        // gone before the click itself lands on whatever was clicked.
        const handleOutsideMouseDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
                setHighlightedIndex(-1);
            }
        };

        document.addEventListener('mousedown', handleOutsideMouseDown);
        return () => {
            document.removeEventListener('mousedown', handleOutsideMouseDown);
        };
    }, [open]);

    const selectRow = (index) => {
        if (index < matches.length) {
            onChange(matches[index]);
        } else {
            // The create-hint row is a pure visual affordance: the typed
            // text was already the value, so this just closes the panel.
            onChange(value);
        }
        setOpen(false);
        setHighlightedIndex(-1);
    };

    const handleInputChange = (e) => {
        setOpen(true);
        setHighlightedIndex(-1);
        onChange(e.target.value);
    };

    const handleFocus = () => {
        setOpen(true);
    };

    const handleClick = () => {
        // Needed in addition to onFocus: re-clicking an already-focused
        // input (e.g. right after Escape) fires no focus event at all.
        setOpen(true);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!panelIsVisible) {
                setOpen(true);
                if (rowCount > 0) {
                    setHighlightedIndex(0);
                }
                return;
            }
            if (rowCount > 0) {
                setHighlightedIndex((prev) => (prev + 1) % rowCount);
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!panelIsVisible) {
                setOpen(true);
                if (rowCount > 0) {
                    setHighlightedIndex(rowCount - 1);
                }
                return;
            }
            if (rowCount > 0) {
                setHighlightedIndex((prev) => (prev - 1 + rowCount) % rowCount);
            }
            return;
        }

        if (e.key === 'Enter') {
            if (panelIsVisible && highlightedIndex >= 0) {
                e.preventDefault();
                selectRow(highlightedIndex);
            }
            // Nothing highlighted: fall through untouched, so the typed
            // text reaches the surrounding form exactly as typed.
            return;
        }

        if (e.key === 'Escape') {
            setOpen(false);
            setHighlightedIndex(-1);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <svg
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-text/50"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
            >
                <polyline points="6 8 10 12 14 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
                className="bg-ui-bg text-ui-text rounded-md py-2 pl-3 pr-9 w-full focus:outline-none focus:ring-2"
                type="text"
                id={id}
                maxLength={maxLength}
                value={value}
                onChange={handleInputChange}
                onFocus={handleFocus}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                role="combobox"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={panelIsVisible}
                aria-controls={listboxId}
                aria-activedescendant={activeDescendantId}
            />
            {panelIsVisible && (
                <ul
                    role="listbox"
                    id={listboxId}
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-md bg-ui-bg text-ui-text shadow-md"
                    onMouseDown={(e) => e.preventDefault()}
                >
                    {matches.map((category, index) => {
                        const isHighlighted = highlightedIndex === index;
                        return (
                            <li
                                key={category}
                                id={rowId(index)}
                                role="option"
                                aria-selected={isHighlighted}
                                className={isHighlighted
                                    ? 'cursor-pointer py-2 px-3 bg-ui-btn text-ui-btn-text'
                                    : 'cursor-pointer py-2 px-3'}
                                onClick={() => selectRow(index)}
                            >
                                {category}
                            </li>
                        );
                    })}
                    {showCreateRow && (
                        <li
                            id={rowId(matches.length)}
                            role="option"
                            aria-selected={highlightedIndex === matches.length}
                            className={highlightedIndex === matches.length
                                ? 'cursor-pointer py-2 px-3 bg-ui-btn text-ui-btn-text'
                                : 'cursor-pointer py-2 px-3'}
                            onClick={() => selectRow(matches.length)}
                        >
                            {`Create "${query}"`}
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

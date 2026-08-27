import { useState, useRef, useEffect } from 'react';

// Button text: Total, one name, or a count.
function summaryLabel(accounts, selectedAccountIds) {
    if (selectedAccountIds.length === 0) {
        return 'Total (all accounts)';
    }
    if (selectedAccountIds.length === 1) {
        const account = accounts.find((candidate) => candidate.account_id === selectedAccountIds[0]);
        return account ? account.short_name : 'Total (all accounts)';
    }
    return `${selectedAccountIds.length} accounts selected`;
}

// Dropdown wrapping the account checkboxes + "Sum selected" toggle.
export default function AccountMultiSelect({
    accounts,
    selectedAccountIds,
    onToggleAccount,
    onSelectedAccountIdsChange,
    sumSelected,
    onSumSelectedChange,
}) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (!open) {
            return undefined;
        }

        // mousedown so the panel closes before the click lands elsewhere.
        const handleOutsideMouseDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideMouseDown);
        return () => {
            document.removeEventListener('mousedown', handleOutsideMouseDown);
        };
    }, [open]);

    const handleToggleOpen = () => {
        setOpen((prev) => !prev);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setOpen(false);
        }
    };

    // All-selected against the offered accounts, not include_in_saldo.
    const allSelected = accounts.length > 0
        && accounts.every((account) => selectedAccountIds.includes(account.account_id));
    const sumDisabled = selectedAccountIds.length < 2;

    const handleSelectAllToggle = () => {
        onSelectedAccountIdsChange(
            allSelected ? [] : accounts.map((account) => account.account_id)
        );
    };

    return (
        <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
            <button
                type="button"
                className={`flex min-w-[12rem] items-center justify-between gap-2 rounded-full border py-2 px-4 text-ui-text transition-colors focus:outline-none focus:ring-2 ${
                    open
                        ? 'bg-ui-bg border-ui-btn'
                        : 'bg-ui-bg border-transparent hover:border-ui-text/20'
                }`}
                aria-haspopup="true"
                aria-expanded={open}
                // Stable "Accounts:" prefix keeps the accessible name findable.
                aria-label={`Accounts: ${summaryLabel(accounts, selectedAccountIds)}`}
                onClick={handleToggleOpen}
            >
                <span className="truncate">{summaryLabel(accounts, selectedAccountIds)}</span>
                <svg
                    className={`pointer-events-none h-4 w-4 shrink-0 text-ui-text/50 transition-transform duration-150 ${
                        open ? 'rotate-180' : ''
                    }`}
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                >
                    <polyline points="6 8 10 12 14 8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open && (
                <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-lg border border-ui-text/10 bg-ui-bg text-ui-text shadow-lg p-2">
                    {accounts.length > 0 && (
                        <button
                            type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-ui-btn hover:bg-ui-light-bg transition-colors"
                            onClick={handleSelectAllToggle}
                        >
                            {allSelected ? 'Unselect all' : 'Select all'}
                        </button>
                    )}
                    {/* Includes accounts excluded from the Total. */}
                    <div className="mt-1 flex flex-col gap-0.5 max-h-48 overflow-auto">
                        {accounts.map((account) => (
                            <label
                                key={account.account_id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-ui-light-bg transition-colors"
                            >
                                <input
                                    className="h-4 w-4 accent-ui-btn"
                                    type="checkbox"
                                    checked={selectedAccountIds.includes(account.account_id)}
                                    onChange={() => onToggleAccount(account.account_id)}
                                />
                                {account.short_name}
                            </label>
                        ))}
                    </div>
                    <div className="mt-1 border-t border-ui-text/10 pt-1">
                        <label
                            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                                sumDisabled ? 'opacity-40' : 'cursor-pointer hover:bg-ui-light-bg'
                            }`}
                        >
                            <input
                                className="h-4 w-4 accent-ui-btn"
                                type="checkbox"
                                checked={sumSelected}
                                disabled={sumDisabled}
                                onChange={(e) => onSumSelectedChange(e.target.checked)}
                            />
                            Sum selected
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

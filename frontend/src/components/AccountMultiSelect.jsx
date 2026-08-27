import { useState, useRef, useEffect } from 'react';

// Summary text shown on the closed button, derived from the same rules
// StatisticsPage already uses to pick a chart mode: zero selected reads as
// Total, one selected is named directly, two or more collapse to a count so
// the button never grows wider than its selection.
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

/**
 * App-styled dropdown wrapping the account checkbox list and the "Sum
 * selected" toggle behind a single closed control, so the filter row does
 * not grow with the account count. Fully controlled: the parent owns
 * `selectedAccountIds`/`sumSelected` and receives plain updates through
 * `onToggleAccount`/`onSumSelectedChange` -- this component holds no
 * selection state of its own, only whether the panel is open. The one
 * exception is the "Select all" row, which computes its own next value
 * (every account id, or none) from props already in hand and hands the
 * whole array to `onSelectedAccountIdsChange` in one call, rather than
 * looping `onToggleAccount` -- the parent's setter has to be told the
 * outcome, not the individual clicks that would produce it.
 */
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

        // mousedown, not click, so the panel is already gone by the time a
        // click outside it would otherwise land on something else.
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

    // All-selected is defined against the accounts actually offered here,
    // so this stays correct even though it never has to think about
    // include_in_saldo itself.
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
                // The visible text alone changes with the selection (Total,
                // one name, or a count), which would make it an unstable
                // target to find by accessible name -- the "Accounts:"
                // prefix here stays constant so the button can always be
                // located the same way regardless of what is selected.
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
                    {/* Every account is offered here, including ones flagged
                        out of include_in_saldo, mirroring how GET /accounts
                        returns them all even though the Total deliberately
                        does not count them. */}
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

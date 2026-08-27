import { useState, useRef, useEffect } from 'react';

// Button text: allLabel, one option's label, or a count.
function summaryLabel(allLabel, options, selectedValues) {
  if (selectedValues.length === 0) {
    return allLabel;
  }
  if (selectedValues.length === 1) {
    const option = options.find((candidate) => candidate.value === selectedValues[0]);
    return option ? option.label : allLabel;
  }
  return `${selectedValues.length} selected`;
}

// Generic checkbox-dropdown filter: one Select all / Unselect all control
// plus one checkbox per option. Modeled on AccountMultiSelect's dropdown
// mechanics, minus the statistics-specific Sum-selected footer.
export default function FilterMultiSelect({
  label,
  allLabel,
  options,
  selectedValues,
  onChange,
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

  const allSelected = options.length > 0
    && options.every((option) => selectedValues.includes(option.value));

  const handleSelectAllToggle = () => {
    onChange(allSelected ? [] : options.map((option) => option.value));
  };

  const handleToggleOption = (value) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((selected) => selected !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const summary = summaryLabel(allLabel, options, selectedValues);
  const hasSelection = selectedValues.length > 0;

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className={`flex h-[2.625rem] min-w-[12rem] items-center justify-between gap-2 rounded-full border py-2 px-4 text-ui-text transition-colors focus:outline-none focus:ring-2 ${
          open || hasSelection
            ? 'bg-ui-bg border-ui-btn'
            : 'bg-ui-bg border-ui-text/20 hover:border-ui-text/40'
        }`}
        aria-haspopup="true"
        aria-expanded={open}
        // Stable "{label}" prefix keeps the accessible name findable while
        // the summary changes with the selection.
        aria-label={`${label} ${summary}`}
        onClick={handleToggleOpen}
      >
        <span className="truncate">{summary}</span>
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
          {options.length > 0 && (
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-ui-btn hover:bg-ui-light-bg transition-colors"
              onClick={handleSelectAllToggle}
            >
              {allSelected ? 'Unselect all' : 'Select all'}
            </button>
          )}
          <div className="mt-1 flex flex-col gap-0.5 max-h-48 overflow-auto">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-ui-light-bg transition-colors"
              >
                <input
                  className="h-4 w-4 accent-ui-btn"
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={() => handleToggleOption(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

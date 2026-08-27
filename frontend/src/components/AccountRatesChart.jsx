import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { max, min } from 'd3-array';

const WIDTH = 640;
const ROW_HEIGHT = 56;
const MARGIN = { top: 16, right: 24, bottom: 32, left: 80 };

// The statutory deposit-protection limit (EUR 100,000 per bank) -- the
// fixed reference line in the balance view exists to make it visually
// obvious which accounts sit above it.
const BALANCE_THRESHOLD = 100000;

const RATE_SERIES = [
    { key: 'zinssatz', label: 'Zinssatz', color: 'var(--chart-zinssatz)' },
    { key: 'basiszins', label: 'Basiszins', color: 'var(--chart-basiszins)' },
];

const VIEWS = [
    { key: 'rates', label: 'Rates' },
    { key: 'balance', label: 'Balance' },
];

const currencyFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
});


export default function AccountRatesChart({ accounts }) {

    const svgRef = useRef(null);
    const [view, setView] = useState('rates');

    // Every account gets a row, even one with neither rate/balance on file
    // -- the chart's job is to show all account names, same as the
    // accounts table does. A missing rate still renders as an invisible
    // (opacity 0) bar rather than a real 0%, so "no rate recorded" stays
    // visually distinct from "an explicit 0% rate" -- it just no longer
    // hides the account.
    const chartAccounts = accounts;

    useEffect(() => {
        const svg = select(svgRef.current);
        svg.selectAll('*').remove();

        if (chartAccounts.length === 0) {
            return;
        }

        // Horizontal bars: each account gets a fixed-height row regardless
        // of how many accounts there are, so the chart grows downward with
        // the account list instead of squeezing every row into one fixed
        // height. Shared by both views.
        const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
        const innerHeight = chartAccounts.length * ROW_HEIGHT;
        const height = innerHeight + MARGIN.top + MARGIN.bottom;

        const y0 = scaleBand()
            .domain(chartAccounts.map((account) => account.short_name))
            .range([0, innerHeight])
            .paddingInner(0.3);

        const root = svg
            .attr('viewBox', `0 0 ${WIDTH} ${height}`)
            .append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

        root.append('g')
            .call(axisLeft(y0))
            .call((g) => g.select('.domain').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('line').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('text').attr('fill', 'var(--color-ui-text)'));

        if (view === 'rates') {
            const y1 = scaleBand()
                .domain(RATE_SERIES.map((series) => series.key))
                .range([0, y0.bandwidth()])
                .padding(0.1);

            const maxRate = max(chartAccounts, (account) =>
                Math.max(account.zinssatz ?? 0, account.basiszins ?? 0)
            );

            const x = scaleLinear()
                // A flat maxRate of 0 (every plotted account has an explicit
                // 0% rate) must still produce a visible, non-degenerate axis.
                .domain([0, maxRate > 0 ? maxRate : 1])
                .nice()
                .range([0, innerWidth]);

            root.append('g')
                .attr('transform', `translate(0,${innerHeight})`)
                .call(axisBottom(x).ticks(5).tickFormat((value) => `${value}%`))
                .call((g) => g.select('.domain').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
                .call((g) => g.selectAll('line').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
                .call((g) => g.selectAll('text').attr('fill', 'var(--color-ui-text)'));

            const groups = root.selectAll('.account-group')
                .data(chartAccounts)
                .join('g')
                .attr('class', 'account-group')
                .attr('transform', (account) => `translate(0,${y0(account.short_name)})`);

            for (const series of RATE_SERIES) {
                groups.append('rect')
                    .attr('x', 0)
                    .attr('y', y1(series.key))
                    .attr('height', y1.bandwidth())
                    .attr('width', (account) => x(account[series.key] ?? 0))
                    .attr('fill', series.color)
                    .attr('opacity', (account) => (account[series.key] === null ? 0 : 1));
            }
            return;
        }

        // view === 'balance'. Domain always spans at least [0, threshold],
        // so the reference line renders even when no account is anywhere
        // close to it -- and extends further only if an account's saldo
        // actually goes below 0 or above the threshold.
        const maxSaldo = max(chartAccounts, (account) => account.saldo ?? 0) ?? 0;
        const minSaldo = min(chartAccounts, (account) => account.saldo ?? 0) ?? 0;

        const x = scaleLinear()
            .domain([Math.min(0, minSaldo), Math.max(BALANCE_THRESHOLD, maxSaldo)])
            .nice()
            .range([0, innerWidth]);

        root.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(axisBottom(x).ticks(5).tickFormat((value) => currencyFormatter.format(value)))
            .call((g) => g.select('.domain').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('line').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('text').attr('fill', 'var(--color-ui-text)'));

        const groups = root.selectAll('.account-group')
            .data(chartAccounts)
            .join('g')
            .attr('class', 'account-group')
            .attr('transform', (account) => `translate(0,${y0(account.short_name)})`);

        // A saldo bar starts at x(0), not x-position 0 -- the domain can
        // start below zero, so "zero" and "the left edge" are not the same
        // pixel. Width/x are computed from the gap to zero either way,
        // which is what makes a rare negative saldo draw leftward from
        // zero instead of producing a negative width.
        const zero = x(0);
        const thresholdX = x(BALANCE_THRESHOLD);

        // Every bar's within-limit portion: the whole bar for a saldo at
        // or below the threshold, or just the part up to the threshold
        // line for one that exceeds it -- the excess becomes its own red
        // segment below, rather than this rect changing color partway
        // through, which SVG fills can't do.
        groups.append('rect')
            .attr('class', 'balance-bar-within')
            .attr('x', (account) => Math.min(zero, x(Math.min(account.saldo ?? 0, BALANCE_THRESHOLD))))
            .attr('y', 0)
            .attr('height', y0.bandwidth())
            .attr('width', (account) => Math.abs(x(Math.min(account.saldo ?? 0, BALANCE_THRESHOLD)) - zero))
            .attr('fill', 'var(--chart-saldo)');

        // Only drawn for a saldo that actually exceeds the threshold --
        // most accounts contribute nothing here.
        groups
            .filter((account) => (account.saldo ?? 0) > BALANCE_THRESHOLD)
            .append('rect')
            .attr('class', 'balance-bar-over')
            .attr('x', thresholdX)
            .attr('y', 0)
            .attr('height', y0.bandwidth())
            .attr('width', (account) => x(account.saldo) - thresholdX)
            .attr('fill', 'var(--chart-saldo-over)');

        // Drawn after the bars, so the line stays visible on top of any
        // bar that crosses it.
        root.append('line')
            .attr('class', 'balance-threshold')
            .attr('x1', thresholdX)
            .attr('x2', thresholdX)
            .attr('y1', 0)
            .attr('y2', innerHeight)
            .attr('stroke', 'var(--color-ui-text)')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4 3');

        root.append('text')
            .attr('x', thresholdX)
            .attr('y', -4)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-ui-text)')
            .attr('fill-opacity', 0.7)
            .attr('font-size', 11)
            .text(currencyFormatter.format(BALANCE_THRESHOLD));
    }, [chartAccounts, view]);

    if (chartAccounts.length === 0) {
        return (
            <p className="text-ui-text/70">No accounts yet.</p>
        );
    }

    const svgLabel = view === 'rates'
        ? 'Zinssatz and Basiszins per account'
        : `Balance per account, with a ${currencyFormatter.format(BALANCE_THRESHOLD)} reference line`;

    const hasOverLimitAccount = chartAccounts.some((account) => (account.saldo ?? 0) > BALANCE_THRESHOLD);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2" role="tablist" aria-label="Chart view">
                {VIEWS.map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        role="tab"
                        aria-selected={view === option.key}
                        className={view === option.key
                            ? 'bg-ui-btn text-ui-btn-text font-bold py-1 px-3 rounded-md text-sm'
                            : 'bg-ui-bg text-ui-text py-1 px-3 rounded-md text-sm hover:opacity-80'}
                        onClick={() => setView(option.key)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <svg ref={svgRef} role="img" aria-label={svgLabel} className="w-full h-auto" />
            <div className="flex items-center gap-4 text-sm text-ui-text/70">
                {view === 'rates' ? (
                    RATE_SERIES.map((series) => (
                        <span key={series.key} className="flex items-center gap-1.5">
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: series.color }}
                            />
                            {series.label}
                        </span>
                    ))
                ) : (
                    <>
                        <span className="flex items-center gap-1.5">
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: 'var(--chart-saldo)' }}
                            />
                            Account balance
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-ui-text/60" />
                            {`${currencyFormatter.format(BALANCE_THRESHOLD)} limit`}
                        </span>
                        {hasOverLimitAccount && (
                            <span className="flex items-center gap-1.5">
                                <span
                                    className="inline-block h-2.5 w-2.5 rounded-sm"
                                    style={{ backgroundColor: 'var(--chart-saldo-over)' }}
                                />
                                Over limit
                            </span>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

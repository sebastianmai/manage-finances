import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { scaleUtc, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { max, min } from 'd3-array';

const WIDTH = 800;
const HEIGHT = 360;
// left is wider than AccountRatesChart's 80 because a EUR y-axis tick is
// longer than an account short name.
const MARGIN = { top: 16, right: 24, bottom: 32, left: 88 };

// Two formatters: zero-decimal for compact axis ticks, and full two-decimal
// precision for the per-point tooltip text where the exact euro amount
// matters.
const axisCurrencyFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
});

const pointCurrencyFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

// Index into this array by a series' position in the `series` prop as
// received -- that pairing with StatisticsPage's `history.accounts` order
// is the entire implementation of stable, click-order-independent colours.
// Beyond six series colours repeat (accepted, not guarded against).
const SERIES_COLORS = [
    'var(--chart-series-1)',
    'var(--chart-series-2)',
    'var(--chart-series-3)',
    'var(--chart-series-4)',
    'var(--chart-series-5)',
    'var(--chart-series-6)',
];

function colorFor(index) {
    return SERIES_COLORS[index % SERIES_COLORS.length];
}

// Both this helper and the x scale below are UTC on purpose: parsing a
// month start in local time while ticking the axis in local time is the
// standard way a December point lands on the November tick for anyone west
// of Greenwich. scaleUtc paired with Date.UTC keeps the two in the same
// frame throughout.
function monthToDate(month) {
    const [year, monthNum] = month.split('-').map(Number);
    return new Date(Date.UTC(year, monthNum - 1, 1));
}

export default function BalanceHistoryChart({ series }) {

    // This component is purely presentational -- it does no fetching, no
    // filtering and no aggregation. Which mode is plotted (Total, a single
    // account, an overlay or a sum) and the year window (D-04) are both
    // view state owned by the page, and keeping this component ignorant of
    // them is what makes the identical-values guarantee in D-04 structural
    // rather than a promise.
    const svgRef = useRef(null);

    // A series with zero points is skipped in the draw loop rather than
    // treated as absent from the array -- its position (and therefore its
    // colour) stays `index` into `series` as received, so an empty series
    // never shifts the colours assigned to the others.
    const nonEmptySeries = series.filter((oneSeries) => oneSeries.points.length > 0);
    const isEmpty = nonEmptySeries.length === 0;

    useEffect(() => {
        const svg = select(svgRef.current);
        svg.selectAll('*').remove();

        if (isEmpty) {
            return;
        }

        const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
        const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

        svg.attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);

        const root = svg
            .append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

        // x domain spans the union of every series' first-to-last date, not
        // just one series -- a shorter-history account must still land
        // inside the shared axis rather than being clipped or rescaling it.
        const firstDates = nonEmptySeries.map((oneSeries) => monthToDate(oneSeries.points[0].month));
        const lastDates = nonEmptySeries.map(
            (oneSeries) => monthToDate(oneSeries.points[oneSeries.points.length - 1].month)
        );
        const firstDate = new Date(Math.min(...firstDates));
        let lastDate = new Date(Math.max(...lastDates));

        // A degenerate union domain start === end -- nudge the end forward
        // one month so the axis and every single-point series still
        // render. A one-month history is a real state for a brand-new
        // account.
        if (firstDate.getTime() === lastDate.getTime()) {
            lastDate = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1));
        }

        const x = scaleUtc()
            .domain([firstDate, lastDate])
            .range([0, innerWidth]);

        // y domain spans every series' points flattened, so a second line
        // never clips against a domain sized for just the first one.
        const allPoints = nonEmptySeries.flatMap((oneSeries) => oneSeries.points);
        const maxBalance = max(allPoints, (point) => point.balance) ?? 0;
        const minBalance = min(allPoints, (point) => point.balance) ?? 0;

        // Anchored at zero, mirroring AccountRatesChart's balance view. The
        // same degenerate-domain guard that view uses: when both ends land
        // on 0, substitute an upper bound of 1 so the axis still spreads
        // into ticks.
        const domainMin = Math.min(0, minBalance);
        const domainMax = Math.max(0, maxBalance);
        const y = scaleLinear()
            .domain(domainMin === 0 && domainMax === 0 ? [0, 1] : [domainMin, domainMax])
            .nice()
            .range([innerHeight, 0]);

        root.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(axisBottom(x).ticks(6))
            .call((g) => g.select('.domain').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('line').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('text').attr('fill', 'var(--color-ui-text)'));

        root.append('g')
            .call(axisLeft(y).ticks(5).tickFormat((value) => axisCurrencyFormatter.format(value)))
            .call((g) => g.select('.domain').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('line').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('text').attr('fill', 'var(--color-ui-text)'));

        // One code path for 1 series or N series: the loop below is the
        // general case, and the single-series usage is literally the N=1
        // case of it rather than a separate branch that could drift.
        series.forEach((oneSeries, index) => {
            if (oneSeries.points.length === 0) {
                return;
            }

            const color = colorFor(index);

            // d3-shape is not installed -- this is three lines of string
            // building against a straight-segment path, which is not worth
            // a new runtime dependency.
            const linePath = oneSeries.points
                .map((point, pointIndex) => {
                    const command = pointIndex === 0 ? 'M' : 'L';
                    return `${command}${x(monthToDate(point.month))},${y(point.balance)}`;
                })
                .join(' ');

            root.append('path')
                .attr('class', 'balance-line')
                .attr('data-series', oneSeries.label)
                .attr('d', linePath)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .attr('stroke-linejoin', 'round')
                .attr('stroke-linecap', 'round');

            const circles = root.selectAll(null)
                .data(oneSeries.points)
                .enter()
                .append('circle')
                .attr('class', 'balance-point')
                .attr('data-series', oneSeries.label)
                .attr('cx', (point) => x(monthToDate(point.month)))
                .attr('cy', (point) => y(point.balance))
                .attr('r', 3)
                .attr('fill', color);

            // A native SVG tooltip on purpose -- it needs no library, no
            // state and no event handlers, and it is what makes each
            // plotted value readable and assertable. A single-series chart
            // keeps today's unprefixed text; a multi-series chart prefixes
            // with the series label so an overlaid point is identifiable
            // without hovering the line itself.
            circles.append('title')
                .text((point) => {
                    const eur = pointCurrencyFormatter.format(point.balance);
                    return series.length > 1
                        ? `${oneSeries.label} — ${point.month}: ${eur}`
                        : `${point.month}: ${eur}`;
                });
        });
    }, [series, isEmpty, nonEmptySeries]);

    if (isEmpty) {
        return (
            <p className="text-ui-text/70">No balance history yet.</p>
        );
    }

    const svgLabel = `${series.map((oneSeries) => oneSeries.label).join(', ')} per month`;

    return (
        <div className="flex flex-col gap-2">
            <svg ref={svgRef} role="img" aria-label={svgLabel} className="w-full h-auto" />
            <div className="flex items-center gap-4 text-sm text-ui-text/70 flex-wrap">
                {series.map((oneSeries, index) => (
                    <span key={oneSeries.id} className="flex items-center gap-1.5">
                        <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: colorFor(index) }}
                        />
                        {oneSeries.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

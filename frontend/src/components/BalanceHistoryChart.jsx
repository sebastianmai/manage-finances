import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { scaleUtc, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { max, min } from 'd3-array';

const WIDTH = 800;
const HEIGHT = 360;
// Wider left margin: EUR ticks are longer than account names.
const MARGIN = { top: 16, right: 24, bottom: 32, left: 88 };

// Zero-decimal for axis ticks, full precision for tooltips.
const axisCurrencyFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
});

const pointCurrencyFormatter = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
});

// Indexed by series position for stable colours. Repeats past 6.
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

// UTC throughout, to avoid month/timezone drift.
function monthToDate(month) {
    const [year, monthNum] = month.split('-').map(Number);
    return new Date(Date.UTC(year, monthNum - 1, 1));
}

export default function BalanceHistoryChart({ series }) {

    // Purely presentational -- no fetching, filtering, or aggregation.
    const svgRef = useRef(null);

    // Empty series are skipped but keep their index (and colour).
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

        // x domain spans the union of every series' dates.
        const firstDates = nonEmptySeries.map((oneSeries) => monthToDate(oneSeries.points[0].month));
        const lastDates = nonEmptySeries.map(
            (oneSeries) => monthToDate(oneSeries.points[oneSeries.points.length - 1].month)
        );
        const firstDate = new Date(Math.min(...firstDates));
        let lastDate = new Date(Math.max(...lastDates));

        // Nudge end forward a month if start === end (single-point history).
        if (firstDate.getTime() === lastDate.getTime()) {
            lastDate = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1));
        }

        const x = scaleUtc()
            .domain([firstDate, lastDate])
            .range([0, innerWidth]);

        // y domain spans every series' points flattened.
        const allPoints = nonEmptySeries.flatMap((oneSeries) => oneSeries.points);
        const maxBalance = max(allPoints, (point) => point.balance) ?? 0;
        const minBalance = min(allPoints, (point) => point.balance) ?? 0;

        // Anchored at zero; guard against a degenerate [0,0] domain.
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

        // One code path for 1 series or N series.
        series.forEach((oneSeries, index) => {
            if (oneSeries.points.length === 0) {
                return;
            }

            const color = colorFor(index);

            // Manual path string; d3-shape isn't installed.
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

            // Native SVG tooltip; prefixed with label when multi-series.
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

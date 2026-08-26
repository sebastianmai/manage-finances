import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import { scaleBand, scaleLinear } from 'd3-scale';
import { axisBottom, axisLeft } from 'd3-axis';
import { max } from 'd3-array';

const WIDTH = 640;
const ROW_HEIGHT = 56;
const MARGIN = { top: 16, right: 24, bottom: 32, left: 80 };

const SERIES = [
    { key: 'zinssatz', label: 'Zinssatz', color: 'var(--chart-zinssatz)' },
    { key: 'basiszins', label: 'Basiszins', color: 'var(--chart-basiszins)' },
];

export default function AccountRatesChart({ accounts }) {

    const svgRef = useRef(null);

    // Every account gets a row, even one with neither rate on file -- the
    // chart's job is to show all account names, same as the accounts table
    // does. A missing rate still renders as an invisible (opacity 0) bar
    // rather than a real 0%, so "no rate recorded" stays visually distinct
    // from "an explicit 0% rate" -- it just no longer hides the account.
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
        // height.
        const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
        const innerHeight = chartAccounts.length * ROW_HEIGHT;
        const height = innerHeight + MARGIN.top + MARGIN.bottom;

        const y0 = scaleBand()
            .domain(chartAccounts.map((account) => account.short_name))
            .range([0, innerHeight])
            .paddingInner(0.3);

        const y1 = scaleBand()
            .domain(SERIES.map((series) => series.key))
            .range([0, y0.bandwidth()])
            .padding(0.1);

        const maxRate = max(chartAccounts, (account) =>
            Math.max(account.zinssatz ?? 0, account.basiszins ?? 0)
        );

        const x = scaleLinear()
            // A flat maxRate of 0 (every plotted account has an explicit 0%
            // rate) must still produce a visible, non-degenerate axis.
            .domain([0, maxRate > 0 ? maxRate : 1])
            .nice()
            .range([0, innerWidth]);

        const root = svg
            .attr('viewBox', `0 0 ${WIDTH} ${height}`)
            .append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

        root.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(axisBottom(x).ticks(5).tickFormat((value) => `${value}%`))
            .call((g) => g.select('.domain').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('line').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('text').attr('fill', 'var(--color-ui-text)'));

        root.append('g')
            .call(axisLeft(y0))
            .call((g) => g.select('.domain').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('line').attr('stroke', 'var(--color-ui-text)').attr('stroke-opacity', 0.3))
            .call((g) => g.selectAll('text').attr('fill', 'var(--color-ui-text)'));

        const groups = root.selectAll('.account-group')
            .data(chartAccounts)
            .join('g')
            .attr('class', 'account-group')
            .attr('transform', (account) => `translate(0,${y0(account.short_name)})`);

        for (const series of SERIES) {
            groups.append('rect')
                .attr('x', 0)
                .attr('y', y1(series.key))
                .attr('height', y1.bandwidth())
                .attr('width', (account) => x(account[series.key] ?? 0))
                .attr('fill', series.color)
                .attr('opacity', (account) => (account[series.key] === null ? 0 : 1));
        }
    }, [chartAccounts]);

    if (chartAccounts.length === 0) {
        return (
            <p className="text-ui-text/70">No accounts yet.</p>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <svg ref={svgRef} role="img" aria-label="Zinssatz and Basiszins per account" className="w-full h-auto" />
            <div className="flex items-center gap-4 text-sm text-ui-text/70">
                {SERIES.map((series) => (
                    <span key={series.key} className="flex items-center gap-1.5">
                        <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: series.color }}
                        />
                        {series.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

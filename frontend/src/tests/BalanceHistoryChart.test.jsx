import { render, screen } from '@testing-library/react';
import BalanceHistoryChart from '../components/BalanceHistoryChart';

const rising = [
  { month: '2024-01', balance: 100 },
  { month: '2024-02', balance: 150 },
  { month: '2024-03', balance: 200 },
];

const negativeThenPositive = [
  { month: '2024-01', balance: -50 },
  { month: '2024-02', balance: 200 },
];

const allZero = [
  { month: '2024-01', balance: 0 },
  { month: '2024-02', balance: 0 },
  { month: '2024-03', balance: 0 },
];

const allPositive = [
  { month: '2024-01', balance: 100 },
  { month: '2024-02', balance: 300 },
];

const singlePoint = [
  { month: '2024-01', balance: 100 },
];

// Builds the one-element series array every single-series case in this
// file needs -- mechanical replacement for the old points={X} label="Y"
// call shape.
function oneSeries(points, label) {
  return [{ id: 'test', label, points }];
}

describe('BalanceHistoryChart', () => {
  test('empty points renders the empty message, no img role', () => {
    render(<BalanceHistoryChart series={oneSeries([], 'Total balance')} />);

    expect(screen.getByText('No balance history yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('a populated series renders exactly one path.balance-line with points.length - 1 L commands', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries(rising, 'Total balance')} />);

    const paths = container.querySelectorAll('path.balance-line');
    expect(paths).toHaveLength(1);

    const d = paths[0].getAttribute('d');
    expect(d.startsWith('M')).toBe(true);
    const lCount = (d.match(/L/g) || []).length;
    expect(lCount).toBe(rising.length - 1);
  });

  test('one circle.balance-point per point', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries(rising, 'Total balance')} />);

    expect(container.querySelectorAll('circle.balance-point')).toHaveLength(rising.length);
  });

  test('each point carries a title child with its month and EUR-formatted balance', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries(rising, 'Total balance')} />);

    const circles = container.querySelectorAll('circle.balance-point');
    circles.forEach((circle, index) => {
      const title = circle.querySelector('title');
      expect(title).toBeInTheDocument();
      expect(title.textContent).toContain(rising[index].month);
      // Matched by regex rather than exact string -- Intl-formatted
      // currency text carries locale-specific whitespace (narrow no-break
      // space) that isn't worth pinning exactly.
      expect(title.textContent).toMatch(/€/);
    });
  });

  test('y-scale orientation: a larger balance gets a strictly smaller cy (inverted SVG axis)', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries([
      { month: '2024-01', balance: 100 },
      { month: '2024-02', balance: 500 },
    ], 'Total balance')} />);

    const circles = container.querySelectorAll('circle.balance-point');
    const cy1 = Number(circles[0].getAttribute('cy'));
    const cy2 = Number(circles[1].getAttribute('cy'));
    expect(cy2).toBeLessThan(cy1);
  });

  test('negative balances: the negative point has a strictly larger cy than the positive one, y-axis has more than one tick', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries(negativeThenPositive, 'Total balance')} />);

    const circles = container.querySelectorAll('circle.balance-point');
    const negativeCy = Number(circles[0].getAttribute('cy'));
    const positiveCy = Number(circles[1].getAttribute('cy'));
    expect(negativeCy).toBeGreaterThan(positiveCy);

    const ticks = container.querySelectorAll('.tick');
    expect(ticks.length).toBeGreaterThan(1);
  });

  test('an all-positive series is anchored at zero: a y-axis tick normalizes to a zero amount', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries(allPositive, 'Total balance')} />);

    const tickTexts = Array.from(container.querySelectorAll('.tick text')).map((node) =>
      node.textContent.replace(/\s+/g, ' ').trim()
    );
    const hasZeroTick = tickTexts.some((text) => /0,00\s?€|0\s?€/.test(text) || /^0/.test(text.replace('€', '').trim()));
    expect(hasZeroTick).toBe(true);
  });

  test('an all-zero series still renders a non-degenerate y-axis', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries(allZero, 'Total balance')} />);

    const ticks = container.querySelectorAll('.tick');
    expect(ticks.length).toBeGreaterThan(2);
  });

  test('a single-point series renders one circle and a d of exactly one M command with no L, without throwing', () => {
    const { container } = render(<BalanceHistoryChart series={oneSeries(singlePoint, 'Total balance')} />);

    const circles = container.querySelectorAll('circle.balance-point');
    expect(circles).toHaveLength(1);

    const d = container.querySelector('path.balance-line').getAttribute('d');
    expect(d.startsWith('M')).toBe(true);
    expect(d.includes('L')).toBe(false);
  });

  test('re-rendering with a different points array replaces the previous chart rather than appending to it', () => {
    const { container, rerender } = render(<BalanceHistoryChart series={oneSeries(rising, 'Total balance')} />);
    expect(container.querySelectorAll('circle.balance-point')).toHaveLength(rising.length);

    rerender(<BalanceHistoryChart series={oneSeries(singlePoint, 'Total balance')} />);
    expect(container.querySelectorAll('circle.balance-point')).toHaveLength(1);
  });

  test('the accessible img label and legend text both reflect the label prop', () => {
    render(<BalanceHistoryChart series={oneSeries(rising, 'GiroA')} />);

    expect(screen.getByRole('img', { name: 'GiroA per month' })).toBeInTheDocument();
    expect(screen.getByText('GiroA')).toBeInTheDocument();
  });

  test('a Total chart and an account chart are distinguishable by label alone', () => {
    const { rerender } = render(<BalanceHistoryChart series={oneSeries(rising, 'Total balance')} />);
    expect(screen.getByRole('img', { name: 'Total balance per month' })).toBeInTheDocument();

    rerender(<BalanceHistoryChart series={oneSeries(rising, 'GiroA')} />);
    expect(screen.getByRole('img', { name: 'GiroA per month' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Total balance per month' })).not.toBeInTheDocument();
  });
});

// innerHeight mirrors the component's own WIDTH/HEIGHT/MARGIN constants --
// duplicated here (not imported) because the component does not export
// them, and the y-domain test needs an upper bound to prove a small-series
// point stays on-canvas rather than off the bottom edge.
const INNER_HEIGHT = 360 - 16 - 32;

const twoSeries = [
  {
    id: 'a1',
    label: 'GiroA',
    points: [
      { month: '2024-01', balance: 100 },
      { month: '2024-02', balance: 200 },
      { month: '2024-03', balance: 300 },
    ],
  },
  {
    id: 'a2',
    label: 'Tages',
    points: [
      { month: '2024-01', balance: 50 },
      { month: '2024-02', balance: 80 },
      { month: '2024-03', balance: 60 },
    ],
  },
];

const sharedDomainSeries = [
  {
    id: 'small',
    label: 'Small',
    points: [
      { month: '2024-01', balance: 10 },
      { month: '2024-02', balance: 20 },
    ],
  },
  {
    id: 'large',
    label: 'Large',
    points: [
      { month: '2024-01', balance: 100000 },
      { month: '2024-02', balance: 120000 },
    ],
  },
];

// Seven single-point series so index 6 (the seventh) is the first to wrap
// back around to SERIES_COLORS[0] under `index % 6`.
const sevenSeries = Array.from({ length: 7 }, (unused, index) => ({
  id: `s${index}`,
  label: `Series ${index + 1}`,
  points: [{ month: '2024-01', balance: (index + 1) * 10 }],
}));

// Strips everything but digits and a leading minus so a de-DE
// zero-decimal currency tick ("120.000 €") becomes a comparable number.
function parseTickNumber(text) {
  return Number(text.replace(/[^\d-]/g, ''));
}

describe('BalanceHistoryChart multi-series', () => {
  test('two series render exactly two lines and two legend entries naming both', () => {
    const { container } = render(<BalanceHistoryChart series={twoSeries} />);

    expect(container.querySelectorAll('path.balance-line')).toHaveLength(2);
    expect(screen.getByText('GiroA')).toBeInTheDocument();
    expect(screen.getByText('Tages')).toBeInTheDocument();
  });

  test('circle count equals the sum of all series point counts', () => {
    const { container } = render(<BalanceHistoryChart series={twoSeries} />);

    const totalPoints = twoSeries.reduce((sum, oneSeries) => sum + oneSeries.points.length, 0);
    expect(container.querySelectorAll('circle.balance-point')).toHaveLength(totalPoints);
  });

  test('colour assignment is index-stable: series 0 gets series-1, series 1 gets series-2, they differ, and a rerender keeps them', () => {
    const { container, rerender } = render(<BalanceHistoryChart series={twoSeries} />);

    const strokeFor = (label) =>
      container.querySelector(`path.balance-line[data-series="${label}"]`).getAttribute('stroke');

    expect(strokeFor('GiroA')).toBe('var(--chart-series-1)');
    expect(strokeFor('Tages')).toBe('var(--chart-series-2)');
    expect(strokeFor('GiroA')).not.toBe(strokeFor('Tages'));

    rerender(<BalanceHistoryChart series={twoSeries} />);
    expect(strokeFor('GiroA')).toBe('var(--chart-series-1)');
    expect(strokeFor('Tages')).toBe('var(--chart-series-2)');
  });

  test('seven series all render without throwing, and series 7 wraps around to series 1\'s colour', () => {
    const { container } = render(<BalanceHistoryChart series={sevenSeries} />);

    expect(container.querySelectorAll('path.balance-line')).toHaveLength(7);

    const firstStroke = container
      .querySelector('path.balance-line[data-series="Series 1"]')
      .getAttribute('stroke');
    const seventhStroke = container
      .querySelector('path.balance-line[data-series="Series 7"]')
      .getAttribute('stroke');
    expect(seventhStroke).toBe(firstStroke);
    expect(firstStroke).toBe('var(--chart-series-1)');
  });

  test('multi-series circle titles carry their own series label prefix; single-series titles do not', () => {
    const { container: multi } = render(<BalanceHistoryChart series={twoSeries} />);
    const giroTitle = multi
      .querySelector('circle.balance-point[data-series="GiroA"] title')
      .textContent;
    expect(giroTitle).toContain('GiroA');
    expect(giroTitle).toContain('2024-01');

    const { container: single } = render(<BalanceHistoryChart series={oneSeries(rising, 'Total balance')} />);
    const singleTitle = single.querySelector('circle.balance-point title').textContent;
    expect(singleTitle).not.toContain('Total balance');
  });

  test('the y domain spans every series: a large series sets the tick scale and a small series stays on-canvas', () => {
    const { container } = render(<BalanceHistoryChart series={sharedDomainSeries} />);

    const tickTexts = Array.from(container.querySelectorAll('.tick text')).map((node) => node.textContent);
    const maxTick = Math.max(...tickTexts.map(parseTickNumber));
    expect(maxTick).toBeGreaterThanOrEqual(120000);

    const smallCircles = container.querySelectorAll('circle.balance-point[data-series="Small"]');
    smallCircles.forEach((circle) => {
      const cy = Number(circle.getAttribute('cy'));
      expect(Number.isFinite(cy)).toBe(true);
      expect(cy).toBeGreaterThan(0);
      expect(cy).toBeLessThan(INNER_HEIGHT);
    });
  });

  test('multi-series accessible name lists every label; rerendering from three series to one replaces rather than appends', () => {
    const threeSeries = [
      ...twoSeries,
      { id: 'a3', label: 'Depot', points: [{ month: '2024-01', balance: 5 }] },
    ];
    const { container, rerender } = render(<BalanceHistoryChart series={threeSeries} />);

    expect(screen.getByRole('img', { name: 'GiroA, Tages, Depot per month' })).toBeInTheDocument();

    rerender(<BalanceHistoryChart series={oneSeries(rising, 'GiroA')} />);
    expect(container.querySelectorAll('path.balance-line')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'GiroA per month' })).toBeInTheDocument();
  });

  test('an empty series array and a series array whose every entry has zero points both render the empty state', () => {
    const { unmount } = render(<BalanceHistoryChart series={[]} />);
    expect(screen.getByText('No balance history yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    unmount();

    render(
      <BalanceHistoryChart
        series={[
          { id: 'a1', label: 'GiroA', points: [] },
          { id: 'a2', label: 'Tages', points: [] },
        ]}
      />
    );
    expect(screen.getByText('No balance history yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountRatesChart from '../components/AccountRatesChart';

const giro = { id: 'a1', short_name: 'Giro', zinssatz: 1.5, basiszins: 0.25, saldo: 5000 };
const tages = { id: 'a2', short_name: 'Tages', zinssatz: 2, basiszins: null, saldo: 120000 };
const depot = { id: 'a3', short_name: 'Depot', zinssatz: null, basiszins: null, saldo: 0 };

const switchToBalanceView = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Balance' }));
  return user;
};

describe('AccountRatesChart', () => {
  test('no accounts: renders the empty message, no svg', () => {
    render(<AccountRatesChart accounts={[]} />);

    expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('an account with neither rate set still gets its own row, both bars invisible', () => {
    const { container } = render(<AccountRatesChart accounts={[depot]} />);

    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText(depot.short_name)).toBeInTheDocument();

    const rects = container.querySelectorAll('.account-group rect');
    expect(rects).toHaveLength(2);
    for (const rect of rects) {
      expect(rect.getAttribute('opacity')).toBe('0');
    }
  });

  test('an account with neither rate set still contributes its own bar group, alongside a rated one', () => {
    const { container } = render(<AccountRatesChart accounts={[giro, depot]} />);

    // Every account gets a row -- depot must not be dropped just because
    // it has nothing to plot.
    expect(container.querySelectorAll('.account-group')).toHaveLength(2);
    expect(screen.getByText(giro.short_name)).toBeInTheDocument();
    expect(screen.getByText(depot.short_name)).toBeInTheDocument();
  });

  test('accounts with at least one rate render one bar group per account, two rects per group', () => {
    const { container } = render(<AccountRatesChart accounts={[giro, tages]} />);

    const groups = container.querySelectorAll('.account-group');
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.querySelectorAll('rect')).toHaveLength(2);
    }
  });

  test('a null rate on an otherwise-plotted account renders its bar at opacity 0, not a real zero-height bar with opacity 1', () => {
    const { container } = render(<AccountRatesChart accounts={[tages]} />);

    const rects = container.querySelectorAll('.account-group rect');
    const opacities = Array.from(rects).map((rect) => rect.getAttribute('opacity'));

    // tages has zinssatz=2 (real, opacity 1) and basiszins=null (opacity 0).
    expect(opacities).toContain('1');
    expect(opacities).toContain('0');
  });

  test('renders an accessible svg labelled for the two rate series', () => {
    render(<AccountRatesChart accounts={[giro]} />);

    expect(screen.getByRole('img', { name: 'Zinssatz and Basiszins per account' })).toBeInTheDocument();
  });

  test('renders both legend labels', () => {
    render(<AccountRatesChart accounts={[giro]} />);

    expect(screen.getByText('Zinssatz')).toBeInTheDocument();
    expect(screen.getByText('Basiszins')).toBeInTheDocument();
  });

  test('y-axis renders one tick label per plotted account, using short_name', () => {
    render(<AccountRatesChart accounts={[giro, tages]} />);

    expect(screen.getByText(giro.short_name)).toBeInTheDocument();
    expect(screen.getByText(tages.short_name)).toBeInTheDocument();
  });

  test('a flat 0% rate across every plotted account still renders a non-degenerate x-axis', () => {
    const zeroRateAccount = { id: 'a4', short_name: 'Zero', zinssatz: 0, basiszins: 0 };
    const { container } = render(<AccountRatesChart accounts={[zeroRateAccount]} />);

    // One account contributes exactly one y-axis tick. If the x-axis
    // (domain [0, 1], the maxRate<=0 fallback) were degenerate it would
    // contribute at most one more -- more than 2 total proves the x-axis
    // actually spread out into multiple ticks.
    const ticks = container.querySelectorAll('.tick');
    expect(ticks.length).toBeGreaterThan(2);
  });

  test('re-rendering with new accounts replaces the previous chart rather than appending to it', () => {
    const { container, rerender } = render(<AccountRatesChart accounts={[giro]} />);
    expect(container.querySelectorAll('.account-group')).toHaveLength(1);

    rerender(<AccountRatesChart accounts={[giro, tages]} />);
    expect(container.querySelectorAll('.account-group')).toHaveLength(2);
  });

  test('defaults to the rates view, with the Rates tab marked selected', () => {
    render(<AccountRatesChart accounts={[giro]} />);

    expect(screen.getByRole('tab', { name: 'Rates' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Balance' })).toHaveAttribute('aria-selected', 'false');
  });

  test('switching to the Balance tab replaces the rate bars with one within-limit balance bar per account', async () => {
    const { container } = render(<AccountRatesChart accounts={[giro, tages]} />);

    await switchToBalanceView();

    expect(screen.getByRole('tab', { name: 'Balance' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Rates' })).toHaveAttribute('aria-selected', 'false');

    const groups = container.querySelectorAll('.account-group');
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      // Every account gets exactly one within-limit segment, regardless of
      // whether it also gets an over-limit one.
      expect(group.querySelectorAll('rect.balance-bar-within')).toHaveLength(1);
    }
  });

  test('a balance under the threshold renders as a single green bar with no over-limit segment', async () => {
    const { container } = render(<AccountRatesChart accounts={[giro]} />);

    await switchToBalanceView();

    const group = container.querySelector('.account-group');
    expect(group.querySelectorAll('rect')).toHaveLength(1);
    expect(group.querySelector('rect.balance-bar-over')).not.toBeInTheDocument();
    expect(group.querySelector('rect.balance-bar-within').getAttribute('fill')).toBe('var(--chart-saldo)');
  });

  test('a balance over the threshold splits into a within-limit segment and a red over-limit segment', async () => {
    const { container } = render(<AccountRatesChart accounts={[tages]} />);

    await switchToBalanceView();

    const group = container.querySelector('.account-group');
    const within = group.querySelector('rect.balance-bar-within');
    const over = group.querySelector('rect.balance-bar-over');

    expect(within).toBeInTheDocument();
    expect(over).toBeInTheDocument();
    expect(over.getAttribute('fill')).toBe('var(--chart-saldo-over)');

    // tages.saldo is 120000: the within-limit segment must stop exactly at
    // the threshold, and the over-limit segment must start exactly where
    // it stopped -- no gap, no overlap.
    const withinRight = Number(within.getAttribute('x')) + Number(within.getAttribute('width'));
    expect(withinRight).toBeCloseTo(Number(over.getAttribute('x')), 5);
  });

  test('the Over limit legend swatch only appears when an account actually exceeds the threshold', async () => {
    const { rerender } = render(<AccountRatesChart accounts={[giro]} />);
    await switchToBalanceView();
    expect(screen.queryByText('Over limit')).not.toBeInTheDocument();

    rerender(<AccountRatesChart accounts={[giro, tages]} />);
    expect(screen.getByText('Over limit')).toBeInTheDocument();
  });

  test('balance view draws a fixed reference line at the EUR 100,000 threshold', async () => {
    const { container } = render(<AccountRatesChart accounts={[giro]} />);

    await switchToBalanceView();

    const line = container.querySelector('line.balance-threshold');
    expect(line).toBeInTheDocument();
    expect(line.getAttribute('stroke-dasharray')).toBe('4 3');

    // Matched by its distinguishing attributes rather than an exact string
    // comparison -- Intl-formatted currency text carries locale-specific
    // whitespace (narrow no-break space) that isn't worth pinning exactly.
    const label = container.querySelector('svg text[text-anchor="middle"]');
    expect(label).toBeInTheDocument();
    expect(label.textContent).toMatch(/100.000/);
    expect(label.textContent).toMatch(/€/);
  });

  test('balance view renders the reference line even when every account is far below it', async () => {
    const { container } = render(<AccountRatesChart accounts={[giro]} />);

    await switchToBalanceView();

    // giro's saldo (5000) is nowhere near 100000 -- the line must still be
    // positioned within the plotted range, not clipped off past the axis.
    const line = container.querySelector('line.balance-threshold');
    const x1 = Number(line.getAttribute('x1'));
    expect(x1).toBeGreaterThan(0);
  });

  test('balance view labels the accessible svg and legend for the money view, not the rate view', async () => {
    const { container } = render(<AccountRatesChart accounts={[giro]} />);

    await switchToBalanceView();

    expect(screen.getByRole('img', { name: /^Balance per account/ })).toBeInTheDocument();
    expect(screen.getByText('Account balance')).toBeInTheDocument();

    const legend = container.querySelector('.flex.items-center.gap-4');
    expect(legend.textContent).toContain('limit');
    expect(screen.queryByText('Zinssatz')).not.toBeInTheDocument();
    expect(screen.queryByText('Basiszins')).not.toBeInTheDocument();
  });

  test('switching back to Rates restores the original rate bars', async () => {
    const { container } = render(<AccountRatesChart accounts={[giro]} />);
    const user = await switchToBalanceView();

    await user.click(screen.getByRole('tab', { name: 'Rates' }));

    expect(screen.getByRole('tab', { name: 'Rates' })).toHaveAttribute('aria-selected', 'true');
    const rects = container.querySelectorAll('.account-group rect');
    expect(rects).toHaveLength(2);
    expect(container.querySelector('line.balance-threshold')).not.toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import AccountRatesChart from '../components/AccountRatesChart';

const giro = { id: 'a1', short_name: 'Giro', zinssatz: 1.5, basiszins: 0.25 };
const tages = { id: 'a2', short_name: 'Tages', zinssatz: 2, basiszins: null };
const depot = { id: 'a3', short_name: 'Depot', zinssatz: null, basiszins: null };

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
});

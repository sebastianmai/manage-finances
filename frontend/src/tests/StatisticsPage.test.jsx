import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatisticsPage from '../components/StatisticsPage';
import { installFetchMock, jsonResponse, notOkResponse, deferred, EUR, normalizeSpace } from '../test-utils';

// Fixture spans three accounts (one excluded from the saldo), two calendar
// years, and one pair of consecutive months with an identical
// carried-forward balance (2024-02 -> 2024-03 on GiroA, and again on
// Depot).
const HISTORY_FIXTURE = {
  months: ['2024-01', '2024-02', '2024-03', '2025-01'],
  total: [
    { month: '2024-01', balance: 1000 },
    { month: '2024-02', balance: 1200 },
    { month: '2024-03', balance: 1200 },
    { month: '2025-01', balance: 1500 },
  ],
  accounts: [
    {
      account_id: 'a1',
      short_name: 'GiroA',
      include_in_saldo: true,
      points: [
        { month: '2024-01', balance: 700 },
        { month: '2024-02', balance: 900 },
        { month: '2024-03', balance: 900 },
        { month: '2025-01', balance: 1000 },
      ],
    },
    {
      account_id: 'a2',
      short_name: 'Tages',
      include_in_saldo: true,
      points: [
        { month: '2024-01', balance: 300 },
        { month: '2024-02', balance: 300 },
        { month: '2024-03', balance: 300 },
        { month: '2025-01', balance: 500 },
      ],
    },
    {
      account_id: 'a3',
      short_name: 'Depot',
      include_in_saldo: false,
      points: [
        { month: '2024-01', balance: 50 },
        { month: '2024-02', balance: 50 },
        { month: '2024-03', balance: 50 },
        { month: '2025-01', balance: 50 },
      ],
    },
  ],
};

const EMPTY_HISTORY = { months: [], total: [], accounts: [] };

// The checkbox list and the chart legend can both contain an account's bare
// short_name as text (e.g. "GiroA"), so a plain screen.getByText would be
// ambiguous once a case needs to assert legend content specifically. This
// scopes the query to the legend, which always sits directly after the
// chart svg.
function getLegend() {
  return screen.getByRole('img').closest('.flex.flex-col.gap-2');
}

// Account checkboxes and "Sum selected" live inside AccountMultiSelect's
// dropdown panel, hidden until its button is opened -- every test that
// touches one of them opens the panel first. The panel stays open across
// however many checkboxes get clicked within one open, so callers only
// need this once per test, not once per checkbox.
async function openAccountMenu(user) {
  await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
}

describe('StatisticsPage', () => {
  test('the loading card renders before the fetch resolves', async () => {
    const fetchMock = installFetchMock();
    const { promise, resolve } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    render(<StatisticsPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    resolve(jsonResponse({ history: EMPTY_HISTORY }));
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
  });

  test('notOkResponse(500) renders the error message and no chart', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(notOkResponse(500));

    render(<StatisticsPage />);

    await waitFor(() => expect(screen.getByText('Failed to load statistics')).toBeInTheDocument());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('notOkResponse(401) renders the error message and no chart', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    render(<StatisticsPage />);

    await waitFor(() => expect(screen.getByText('Failed to load statistics')).toBeInTheDocument());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('a rejected fetch renders the error message and no chart', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    render(<StatisticsPage />);

    await waitFor(() => expect(screen.getByText('Failed to load statistics')).toBeInTheDocument());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('on success the page defaults to Total with nothing checked, and the old select is gone', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);

    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    expect(screen.queryByLabelText('Account:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accounts: Total (all accounts)' })).toBeInTheDocument();

    const user = userEvent.setup();
    await openAccountMenu(user);
    expect(screen.getByLabelText('GiroA')).not.toBeChecked();
    expect(screen.getByLabelText('Tages')).not.toBeChecked();
    expect(screen.getByLabelText('Depot')).not.toBeChecked();
    expect(screen.getByRole('img', { name: 'Total balance per month' })).toBeInTheDocument();
    expect(screen.getByText('Total balance')).toBeInTheDocument();

    const circles = document.querySelectorAll('circle.balance-point');
    expect(circles).toHaveLength(HISTORY_FIXTURE.months.length);
  });

  test('checking GiroA swaps the line to that account, replacing not overlaying the Total line', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));

    expect(screen.getByRole('img', { name: 'GiroA per month' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Total balance per month' })).not.toBeInTheDocument();
    expect(screen.queryByText('Total balance')).not.toBeInTheDocument();

    const circles = document.querySelectorAll('circle.balance-point');
    expect(circles).toHaveLength(HISTORY_FIXTURE.months.length);

    // Exactly one path.balance-line must exist -- proves replacement, not
    // an overlay of every account.
    expect(document.querySelectorAll('path.balance-line')).toHaveLength(1);

    // GiroA's 2024-01 balance (700) is unique to that account -- the
    // Total-only 2024-02 value (1200, which never appears anywhere in
    // GiroA's own points: 700/900/900/1000) must not be present.
    const titles = Array.from(document.querySelectorAll('circle.balance-point title')).map(
      (node) => node.textContent
    );
    expect(titles.some((text) => text.includes('2024-01'))).toBe(true);
    expect(titles.every((text) => !text.includes('1.200,00'))).toBe(true);
  });

  test('unchecking GiroA restores the Total line', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    expect(screen.getByRole('img', { name: 'GiroA per month' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('GiroA'));
    expect(screen.getByRole('img', { name: 'Total balance per month' })).toBeInTheDocument();
  });

  test('checking GiroA and Tages overlays exactly two lines, both names in the legend, and no Total line', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));

    expect(document.querySelectorAll('path.balance-line')).toHaveLength(2);
    expect(within(getLegend()).getByText('GiroA')).toBeInTheDocument();
    expect(within(getLegend()).getByText('Tages')).toBeInTheDocument();
    expect(screen.queryByText('Total balance')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Total balance per month' })).not.toBeInTheDocument();
  });

  test('with nothing selected, no account chips render', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /^Remove account:/ })).not.toBeInTheDocument();
  });

  test('checking GiroA and Tages renders exactly two named chips, one per selection', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Remove account: GiroA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove account: Tages' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove account: Depot' })).not.toBeInTheDocument();
  });

  test('clicking a chip\'s x removes only that account, leaving the other selection and its chip intact', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Remove account: GiroA' }));

    expect(screen.queryByRole('button', { name: 'Remove account: GiroA' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove account: Tages' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Tages per month' })).toBeInTheDocument();
    await openAccountMenu(user);
    expect(screen.getByLabelText('GiroA')).not.toBeChecked();
    expect(screen.getByLabelText('Tages')).toBeChecked();
  });

  test('removing the last remaining chip restores the Total line and hides the chip row', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Remove account: GiroA' }));

    expect(screen.queryByRole('button', { name: /^Remove account:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Total balance per month' })).toBeInTheDocument();
  });

  test('"Select all" overlays all three accounts; clicking it again ("Unselect all") restores Total', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByRole('button', { name: 'Select all' }));

    expect(screen.getByLabelText('GiroA')).toBeChecked();
    expect(screen.getByLabelText('Tages')).toBeChecked();
    expect(screen.getByLabelText('Depot')).toBeChecked();
    expect(document.querySelectorAll('path.balance-line')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Accounts: 3 accounts selected' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unselect all' }));

    expect(screen.getByLabelText('GiroA')).not.toBeChecked();
    expect(screen.getByRole('img', { name: 'Total balance per month' })).toBeInTheDocument();
  });

  test('an account with include_in_saldo false is still listed as a checkbox and is selectable', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    const depotCheckbox = screen.getByLabelText('Depot');
    expect(depotCheckbox).toBeInTheDocument();

    await user.click(depotCheckbox);
    expect(screen.getByRole('img', { name: 'Depot per month' })).toBeInTheDocument();
  });

  test('"Sum selected" is disabled with 0 and with 1 checked, enabled with 2 checked', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    const sumCheckbox = screen.getByLabelText('Sum selected');
    expect(sumCheckbox).toBeDisabled();

    await user.click(screen.getByLabelText('GiroA'));
    expect(sumCheckbox).toBeDisabled();

    await user.click(screen.getByLabelText('Tages'));
    expect(sumCheckbox).not.toBeDisabled();
  });

  test('with GiroA and Tages checked, "Sum selected" renders one line whose 2024-01 tooltip equals the Total line\'s 2024-01 tooltip (gated-subset equality)', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const totalTitle = Array.from(document.querySelectorAll('circle.balance-point title')).find(
      (node) => node.textContent.includes('2024-01')
    ).textContent;

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));
    await user.click(screen.getByLabelText('Sum selected'));

    expect(document.querySelectorAll('path.balance-line')).toHaveLength(1);
    expect(screen.getByText('Sum of selected accounts')).toBeInTheDocument();

    const sumTitle = Array.from(document.querySelectorAll('circle.balance-point title')).find(
      (node) => node.textContent.includes('2024-01')
    ).textContent;

    // GiroA + Tages at 2024-01 (700 + 300) is exactly the gated Total
    // (1000) -- this is the CONTEXT-documented coincidence, not a
    // special case in the implementation.
    expect(sumTitle).toBe(totalTitle);
  });

  test('with all three accounts checked, the summed 2024-01 value is 1050, not Total\'s 1000 -- proving the sum is ungated', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));
    await user.click(screen.getByLabelText('Depot'));
    await user.click(screen.getByLabelText('Sum selected'));

    // 700 + 300 + 50 = 1050. Depot is excluded from Total (include_in_saldo:
    // false) but the sum checkbox has no such gate -- this 1050-not-1000
    // result is the locked, intended behaviour (CONTEXT "Sum toggle"), not
    // a bug to "fix" by adding an include_in_saldo filter here.
    const expectedText = normalizeSpace(EUR.format(1050));
    const sumTitle = Array.from(document.querySelectorAll('circle.balance-point title')).find(
      (node) => node.textContent.includes('2024-01')
    ).textContent;
    expect(normalizeSpace(sumTitle)).toContain(expectedText);
  });

  test('unchecking to 1 while "Sum selected" stays checked plots the single account; re-checking a second restores the sum', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));
    await user.click(screen.getByLabelText('Sum selected'));
    expect(screen.getByText('Sum of selected accounts')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Tages'));
    expect(screen.getByRole('img', { name: 'GiroA per month' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sum selected')).toBeChecked();
    expect(screen.getByLabelText('Sum selected')).toBeDisabled();

    await user.click(screen.getByLabelText('Tages'));
    expect(screen.getByText('Sum of selected accounts')).toBeInTheDocument();
  });

  test('overlay year narrowing: two accounts over four months render 8 circles, narrowing to 2024 leaves 6, surviving tooltip is byte-identical', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));

    expect(document.querySelectorAll('circle.balance-point')).toHaveLength(8);

    const titleBefore = Array.from(document.querySelectorAll('circle.balance-point title')).find(
      (node) => node.textContent.includes('2024-01')
    ).textContent;

    await user.selectOptions(screen.getByLabelText('From year:'), '2024');
    await user.selectOptions(screen.getByLabelText('To year:'), '2024');

    expect(document.querySelectorAll('circle.balance-point')).toHaveLength(6);

    const titleAfter = Array.from(document.querySelectorAll('circle.balance-point title')).find(
      (node) => node.textContent.includes('2024-01')
    ).textContent;

    expect(titleAfter).toBe(titleBefore);
  });

  test('sum-mode year narrowing: 4 circles narrow to 3 with byte-identical surviving tooltip text', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));
    await user.click(screen.getByLabelText('Sum selected'));

    expect(document.querySelectorAll('circle.balance-point')).toHaveLength(4);

    const titleBefore = Array.from(document.querySelectorAll('circle.balance-point title')).find(
      (node) => node.textContent.includes('2024-01')
    ).textContent;

    await user.selectOptions(screen.getByLabelText('From year:'), '2024');
    await user.selectOptions(screen.getByLabelText('To year:'), '2024');

    expect(document.querySelectorAll('circle.balance-point')).toHaveLength(3);

    const titleAfter = Array.from(document.querySelectorAll('circle.balance-point title')).find(
      (node) => node.textContent.includes('2024-01')
    ).textContent;

    expect(titleAfter).toBe(titleBefore);
  });

  test('colour-to-account mapping is identical whether Tages is checked before or after GiroA', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    const first = render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('Tages'));
    await user.click(screen.getByLabelText('GiroA'));

    const strokeByLabelFirst = {};
    document.querySelectorAll('path.balance-line').forEach((path) => {
      strokeByLabelFirst[path.getAttribute('data-series')] = path.getAttribute('stroke');
    });
    first.unmount();

    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));
    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const userTwo = userEvent.setup();
    await openAccountMenu(userTwo);
    await userTwo.click(screen.getByLabelText('GiroA'));
    await userTwo.click(screen.getByLabelText('Tages'));

    const strokeByLabelSecond = {};
    document.querySelectorAll('path.balance-line').forEach((path) => {
      strokeByLabelSecond[path.getAttribute('data-series')] = path.getAttribute('stroke');
    });

    expect(strokeByLabelSecond).toEqual(strokeByLabelFirst);
  });

  test('setting from-year above to-year pushes to-year up to match (and the mirrored case)', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('From year:'), '2025');
    expect(screen.getByLabelText('To year:').value).toBe('2025');

    await user.selectOptions(screen.getByLabelText('To year:'), '2024');
    expect(screen.getByLabelText('From year:').value).toBe('2024');
  });

  test('carry-forward passthrough: two consecutive months with an identical balance both render a circle', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    // Total's 2024-02 and 2024-03 are both 1200 -- neither dropped nor
    // collapsed into one point.
    const titles = Array.from(document.querySelectorAll('circle.balance-point title')).map(
      (node) => node.textContent
    );
    expect(titles.some((text) => text.includes('2024-02'))).toBe(true);
    expect(titles.some((text) => text.includes('2024-03'))).toBe(true);
    expect(document.querySelectorAll('circle.balance-point')).toHaveLength(4);
  });

  test('global.fetch is called exactly once -- checkbox, sum toggle and year interactions do not refetch', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    const user = userEvent.setup();
    await openAccountMenu(user);
    await user.click(screen.getByLabelText('GiroA'));
    await user.click(screen.getByLabelText('Tages'));
    await user.click(screen.getByLabelText('Sum selected'));
    await user.selectOptions(screen.getByLabelText('From year:'), '2025');
    await user.selectOptions(screen.getByLabelText('To year:'), '2025');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('the fetch is issued with credentials: include', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: HISTORY_FIXTURE }));

    render(<StatisticsPage />);
    await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/balance/history',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  test('an empty payload renders the chart empty state and no year selects', async () => {
    const fetchMock = installFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse({ history: EMPTY_HISTORY }));

    render(<StatisticsPage />);

    await waitFor(() => expect(screen.getByText('No balance history yet.')).toBeInTheDocument());
    expect(screen.queryByLabelText('From year:')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('To year:')).not.toBeInTheDocument();
  });
});

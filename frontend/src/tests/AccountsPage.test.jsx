import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountsPage from '../components/AccountsPage';
import {
  renderAtRoute,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
  EUR,
  normalizeSpace,
} from '../test-utils';

const account1 = {
  id: '11111111-1111-1111-1111-111111111111',
  type: 'Haupt',
  account_number: 'DE00 1234 5678',
  full_name: 'Girokonto Sparkasse',
  short_name: 'Giro',
  saldo: 1234.56,
  active_since: '2020-01-15',
  owner_name: 'Ada Lovelace',
  vollmacht: 'Grace Hopper',
  aktiv: true,
  include_in_saldo: true,
  zinssatz: 2.5,
  basiszins: 1.75,
  comment: 'Main account',
};

const account2 = {
  id: '22222222-2222-2222-2222-222222222222',
  type: 'Anlage',
  account_number: 'DE00 8765 4321',
  full_name: 'Tagesgeldkonto',
  short_name: 'Tagesgeld',
  saldo: 500,
  active_since: '2021-06-01',
  owner_name: 'Ada Lovelace',
  vollmacht: '',
  aktiv: false,
  include_in_saldo: false,
  zinssatz: null,
  basiszins: null,
  comment: '',
};

function setup() {
  return renderAtRoute(<AccountsPage />, {
    route: '/accounts',
    path: '/accounts',
    sentinels: ['/login', '/accounts/new', '/accounts/:id/edit'],
  });
}

describe('AccountsPage', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('loading: renders loading text while /accounts is pending', () => {
    const { promise } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    setup();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('unauthenticated: 401 navigates to /login sentinel, no table', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    setup();

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('non-401 not-ok (500): shows load error, does not navigate', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(500));

    setup();

    expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
  });

  test('rejected fetch: shows load error, calls console.error, does not navigate', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    setup();

    expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('issues the GET to the right url with method and credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    setup();

    await screen.findByText('No accounts yet.');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/accounts',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  test('two accounts render as two table rows with every field visible, saldo formatted de-DE EUR', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }));

    setup();

    const rows = await screen.findAllByRole('row');
    // header row + two data rows
    expect(rows).toHaveLength(3);

    expect(screen.getByText('Haupt')).toBeInTheDocument();
    expect(screen.getByText('DE00 1234 5678')).toBeInTheDocument();
    expect(screen.getByText('Girokonto Sparkasse')).toBeInTheDocument();
    expect(screen.getByText('Giro')).toBeInTheDocument();
    expect(screen.getByText(normalizeSpace(EUR.format(1234.56)))).toBeInTheDocument();
    expect(screen.getByText('2020-01-15')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    expect(screen.getByText('Anlage')).toBeInTheDocument();
    expect(screen.getByText('Tagesgeld')).toBeInTheDocument();
    expect(screen.getByText(normalizeSpace(EUR.format(500)))).toBeInTheDocument();
  });

  test('table shows the interest-rate and comment columns, de-DE percent rates', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }));

    setup();

    await screen.findByText('Girokonto Sparkasse');

    expect(screen.getByText('Zinssatz')).toBeInTheDocument();
    expect(screen.getByText('Basiszins')).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByText('In saldo')).toBeInTheDocument();
    expect(screen.getByText('Comment')).toBeInTheDocument();

    expect(screen.getByText('2,50 %')).toBeInTheDocument();
    expect(screen.getByText('1,75 %')).toBeInTheDocument();
    expect(screen.getByText('Main account')).toBeInTheDocument();
  });

  test('an account excluded from the saldo is still listed, with its checkboxes reflecting its actual state', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }));

    setup();

    await screen.findByText('Tagesgeldkonto');

    // account1: aktiv=true, include_in_saldo=true. account2: both false --
    // excluded rows must stay fully visible and interactive, never hidden.
    expect(screen.getByRole('checkbox', { name: `Aktiv: ${account1.short_name}` })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: `Include in saldo: ${account1.short_name}` })
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: `Aktiv: ${account2.short_name}` })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: `Include in saldo: ${account2.short_name}` })
    ).not.toBeChecked();
  });

  test('toggling Include in saldo in the overview: PATCHes both current flags, keeps the toggle checked on success', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByText('Girokonto Sparkasse');

    const toggle = screen.getByRole('checkbox', {
      name: `Include in saldo: ${account1.short_name}`,
    });
    await user.click(toggle);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`http://localhost:8080/accounts/${account1.id}`);
    expect(options.method).toBe('PATCH');
    expect(options.credentials).toBe('include');
    const body = JSON.parse(options.body);
    // aktiv is sent alongside the changed flag, unchanged from its current value.
    expect(body).toEqual({ aktiv: true, include_in_saldo: false });
    expect(toggle).not.toBeChecked();
  });

  test('toggling Aktiv in the overview when the PATCH fails: reverts the checkbox and shows an error', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    await screen.findByText('Girokonto Sparkasse');

    const toggle = screen.getByRole('checkbox', { name: `Aktiv: ${account1.short_name}` });
    await user.click(toggle);

    expect(await screen.findByText('Failed to update account')).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  test('toggling a flag when the PATCH rejects: reverts the checkbox, shows an error, calls console.error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await screen.findByText('Girokonto Sparkasse');

    const toggle = screen.getByRole('checkbox', { name: `Aktiv: ${account1.short_name}` });
    await user.click(toggle);

    expect(await screen.findByText('Failed to update account')).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('unset vollmacht, rates, and comment all render the em-dash placeholder, not a blank cell', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account2] }));

    setup();

    await screen.findByText('Tagesgeldkonto');

    // account2 has four unset fields: vollmacht, zinssatz, basiszins, comment.
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  test('empty accounts array renders "No accounts yet." and zero table rows', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    setup();

    expect(await screen.findByText('No accounts yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('"Add account" is a link to /accounts/new; clicking it navigates there; no inline form is present', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [] }));
    const user = userEvent.setup();
    setup();

    const link = await screen.findByRole('link', { name: 'Add account' });
    expect(link).toHaveAttribute('href', '/accounts/new');
    expect(screen.queryByLabelText('Type:')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    await user.click(link);

    expect(await screen.findByText('navigated:/accounts/new')).toBeInTheDocument();
  });

  test('each row carries a per-row Edit link to /accounts/{id}/edit; clicking it navigates there', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account1] }));
    const user = userEvent.setup();
    setup();

    const link = await screen.findByRole('link', { name: `Edit ${account1.short_name}` });
    expect(link).toHaveAttribute('href', `/accounts/${account1.id}/edit`);

    await user.click(link);

    expect(await screen.findByText('navigated:/accounts/:id/edit')).toBeInTheDocument();
  });

  test('each row carries a per-row delete control with a distinguishing accessible name', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }));

    setup();

    expect(await screen.findByText('Actions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`Delete.*${account1.short_name}`) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`Delete.*${account2.short_name}`) })
    ).toBeInTheDocument();
  });

  test('delete success: confirms, DELETEs the right url, refetches, removes the row', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account deleted successfully' }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [account2] }));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    setup();

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`Delete.*${account1.short_name}`) })
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toEqual(expect.stringContaining(account1.short_name));

    await screen.findByText('Tagesgeldkonto');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`http://localhost:8080/accounts/${account1.id}`);
    expect(options.method).toBe('DELETE');
    expect(options.credentials).toBe('include');

    expect(screen.queryByText('Girokonto Sparkasse')).not.toBeInTheDocument();
    expect(screen.getByText('Tagesgeldkonto')).toBeInTheDocument();
  });

  test('delete cancelled: no request, row stays', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    setup();

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`Delete.*${account1.short_name}`) })
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount GET only, no DELETE
    expect(screen.getByText('Girokonto Sparkasse')).toBeInTheDocument();
  });

  test('delete fails not-ok: shows error, no refresh, row stays', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(notOkResponse(500));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    setup();

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`Delete.*${account1.short_name}`) })
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Failed to delete account')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // mount GET + DELETE, no refresh GET
    expect(screen.getByText('Girokonto Sparkasse')).toBeInTheDocument();
  });

  test('delete rejects: shows error, calls console.error, row stays', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockRejectedValueOnce(new Error('network down'));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    setup();

    await user.click(
      await screen.findByRole('button', { name: new RegExp(`Delete.*${account1.short_name}`) })
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Failed to delete account')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
    expect(screen.getByText('Girokonto Sparkasse')).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});

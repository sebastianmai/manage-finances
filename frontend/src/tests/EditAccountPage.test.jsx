import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditAccountPage from '../components/EditAccountPage';
import {
  renderAtRoute,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
} from '../test-utils';

const account = {
  id: 'acct-1',
  type: 'Haupt',
  account_number: 'DE99 1111 2222',
  full_name: 'Girokonto Sparkasse',
  short_name: 'Giro',
  saldo: 500,
  active_since: '2022-03-01',
  owner_name: 'Ada Lovelace',
  vollmacht: '',
  aktiv: true,
  include_in_saldo: true,
  zinssatz: null,
  basiszins: null,
  comment: '',
};

const otherAccount = { ...account, id: 'acct-2', short_name: 'Other' };

function setup() {
  return renderAtRoute(<EditAccountPage />, {
    route: '/accounts/acct-1/edit',
    path: '/accounts/:id/edit',
    sentinels: ['/login', '/accounts'],
  });
}

describe('EditAccountPage', () => {
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

  test('unauthenticated: 401 navigates to /login sentinel, no form controls', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    setup();

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
    expect(screen.queryByLabelText('Type:')).not.toBeInTheDocument();
  });

  test('non-401 not-ok (500): shows "Failed to load account", does not navigate', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(500));

    setup();

    expect(await screen.findByText('Failed to load account')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
  });

  test('rejected fetch: shows "Failed to load account", calls console.error, does not navigate', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    setup();

    expect(await screen.findByText('Failed to load account')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('account id not present in the list (someone else\'s account, or a bad id): shows "Account not found"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [otherAccount] }));

    setup();

    expect(await screen.findByText('Account not found')).toBeInTheDocument();
    expect(screen.queryByLabelText('Type:')).not.toBeInTheDocument();
  });

  test('issues the mount GET to /accounts with credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account] }));

    setup();

    await screen.findByLabelText('Type:');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/accounts',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  test('form is prefilled with the matching account\'s values', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account] }));

    setup();

    await screen.findByLabelText('Type:');

    expect(screen.getByLabelText('Type:')).toHaveValue('Haupt');
    expect(screen.getByLabelText('Account nr / IBAN:')).toHaveValue(account.account_number);
    expect(screen.getByLabelText('Full name:')).toHaveValue(account.full_name);
    expect(screen.getByLabelText('Short name:')).toHaveValue(account.short_name);
    expect(screen.getByLabelText('Saldo:')).toHaveValue(500);
    expect(screen.getByLabelText('Active since:')).toHaveValue(account.active_since);
    expect(screen.getByLabelText('Owner:')).toHaveValue(account.owner_name);
    expect(screen.getByLabelText('Aktiv:')).toBeChecked();
    expect(screen.getByLabelText('Include in saldo:')).toBeChecked();
    // Null rates render as an empty input, not the string "null" or a 0.
    expect(screen.getByLabelText('Zinssatz (%):')).toHaveValue(null);
    expect(screen.getByLabelText('Basiszins (%):')).toHaveValue(null);
  });

  test('a set rate renders as its numeric value, not empty', async () => {
    const rated = { ...account, zinssatz: 2.5, basiszins: 0 };
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [rated] }));

    setup();

    await screen.findByLabelText('Type:');

    expect(screen.getByLabelText('Zinssatz (%):')).toHaveValue(2.5);
    // An explicit 0% must render as 0, not fall back to empty the way a
    // careless falsy check on the stored value would.
    expect(screen.getByLabelText('Basiszins (%):')).toHaveValue(0);
  });

  test('missing required field (cleared Full name): shows validation error, stays on page, issues no PUT', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account] }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.clear(screen.getByLabelText('Full name:'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(
        'Type, account number, full name, short name, saldo, active since and owner are required'
      )
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount GET only, no PUT
  });

  test('save success: PUTs the right url/method/credentials/headers, navigates to /accounts', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('navigated:/accounts')).toBeInTheDocument();

    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('http://localhost:8080/accounts/acct-1');
    expect(options.method).toBe('PUT');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
  });

  test('unedited submit round-trips saldo as a number and unset rates as null', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('navigated:/accounts');

    const [, options] = fetchMock.mock.calls[1];
    const body = JSON.parse(options.body);

    expect(body.saldo).toBe(500);
    expect(typeof body.saldo).toBe('number');
    expect(body.zinssatz).toBeNull();
    expect(body.basiszins).toBeNull();
    expect(body.aktiv).toBe(true);
    expect(typeof body.aktiv).toBe('boolean');
  });

  test('editing a field changes exactly that field in the PUT body', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.clear(screen.getByLabelText('Saldo:'));
    await user.type(screen.getByLabelText('Saldo:'), '750');
    await user.type(screen.getByLabelText('Zinssatz (%):'), '1.25');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('navigated:/accounts');

    const [, options] = fetchMock.mock.calls[1];
    const body = JSON.parse(options.body);

    expect(body.saldo).toBe(750);
    expect(body.zinssatz).toBe(1.25);
    expect(body.full_name).toBe(account.full_name);
  });

  test('clearing a previously-set rate sends null, not 0 or an empty string', async () => {
    const rated = { ...account, zinssatz: 2.5 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [rated] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.clear(screen.getByLabelText('Zinssatz (%):'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('navigated:/accounts');

    const [, options] = fetchMock.mock.calls[1];
    const body = JSON.parse(options.body);

    expect(body.zinssatz).toBeNull();
  });

  test('unchecking Aktiv sends false, not omitted', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.click(screen.getByLabelText('Aktiv:'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('navigated:/accounts');

    const [, options] = fetchMock.mock.calls[1];
    const body = JSON.parse(options.body);

    expect(body.aktiv).toBe(false);
  });

  test('PUT not-ok: shows "Failed to save account", stays on the page', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account] }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Failed to save account')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/accounts')).not.toBeInTheDocument();
  });

  test('PUT rejects: shows "Failed to save account", calls console.error, stays on the page', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account] }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Failed to save account')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/accounts')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

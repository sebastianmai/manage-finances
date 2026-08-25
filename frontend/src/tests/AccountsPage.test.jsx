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
  id: 1,
  type: 'Girokonto',
  account_number: 'DE00 1234 5678',
  full_name: 'Girokonto Sparkasse',
  short_name: 'Giro',
  saldo: 1234.56,
  active_since: '2020-01-15',
  owner_name: 'Ada Lovelace',
  vollmacht: 'Grace Hopper',
};

const account2 = {
  id: 2,
  type: 'Tagesgeld',
  account_number: 'DE00 8765 4321',
  full_name: 'Tagesgeldkonto',
  short_name: 'Tagesgeld',
  saldo: 500,
  active_since: '2021-06-01',
  owner_name: 'Ada Lovelace',
  vollmacht: '',
};

const validFormEntries = [
  ['Type:', 'Depot'],
  ['Account nr / IBAN:', 'DE99 1111 2222'],
  ['Full name:', 'Depot Konto'],
  ['Short name:', 'Depot'],
  ['Saldo:', '100'],
  ['Active since:', '2022-03-01'],
  ['Owner:', 'Ada Lovelace'],
];

function setup() {
  return renderAtRoute(<AccountsPage />, {
    route: '/accounts',
    path: '/accounts',
    sentinels: ['/login'],
  });
}

async function fillValidForm(user, { skip } = {}) {
  for (const [label, value] of validFormEntries) {
    if (skip === label) {
      continue;
    }
    await user.type(screen.getByLabelText(label), value);
  }
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

    expect(screen.getByText('Girokonto')).toBeInTheDocument();
    expect(screen.getByText('DE00 1234 5678')).toBeInTheDocument();
    expect(screen.getByText('Girokonto Sparkasse')).toBeInTheDocument();
    expect(screen.getByText('Giro')).toBeInTheDocument();
    expect(screen.getByText(normalizeSpace(EUR.format(1234.56)))).toBeInTheDocument();
    expect(screen.getByText('2020-01-15')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    expect(screen.getAllByText('Tagesgeld').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(normalizeSpace(EUR.format(500)))).toBeInTheDocument();
  });

  test('empty vollmacht renders the em-dash placeholder, not a blank cell', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [account2] }));

    setup();

    await screen.findByText('Tagesgeldkonto');

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('empty accounts array renders "No accounts yet." and zero table rows', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    setup();

    expect(await screen.findByText('No accounts yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('clicking Add account reveals eight labelled inputs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [] }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Add account' }));

    expect(screen.getByLabelText('Type:')).toBeInTheDocument();
    expect(screen.getByLabelText('Account nr / IBAN:')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name:')).toBeInTheDocument();
    expect(screen.getByLabelText('Short name:')).toBeInTheDocument();
    expect(screen.getByLabelText('Saldo:')).toBeInTheDocument();
    expect(screen.getByLabelText('Active since:')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner:')).toBeInTheDocument();
    expect(screen.getByLabelText('Vollmacht:')).toBeInTheDocument();
  });

  test('submitting with a required field empty shows validation error, keeps form open, issues no POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [] }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    await fillValidForm(user, { skip: 'Owner:' });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('All fields except Vollmacht are required')).toBeInTheDocument();
    expect(screen.getByLabelText('Type:')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount GET only, no POST
  });

  test('submitting with only Vollmacht empty DOES issue the POST', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account created successfully' }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('create success: POSTs correct url/method/credentials/headers/body (saldo as number), closes form, refetches, shows new row', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account created successfully' }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Girokonto');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('http://localhost:8080/accounts');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));

    const body = JSON.parse(options.body);
    expect(body.type).toBe('Depot');
    expect(body.account_number).toBe('DE99 1111 2222');
    expect(body.full_name).toBe('Depot Konto');
    expect(body.short_name).toBe('Depot');
    expect(body.saldo).toBe(100);
    expect(typeof body.saldo).toBe('number');
    expect(body.active_since).toBe('2022-03-01');
    expect(body.owner_name).toBe('Ada Lovelace');

    expect(screen.queryByLabelText('Type:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument();
  });

  test('create failure (not-ok): shows create error, keeps form open', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Failed to create account')).toBeInTheDocument();
    expect(screen.getByLabelText('Type:')).toBeInTheDocument();
  });

  test('create rejection: shows create error, calls console.error, keeps form open', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Failed to create account')).toBeInTheDocument();
    expect(screen.getByLabelText('Type:')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('cancel closes the form and issues no POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [] }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Type:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount GET only, no POST
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

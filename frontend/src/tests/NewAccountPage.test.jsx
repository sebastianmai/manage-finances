import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewAccountPage from '../components/NewAccountPage';
import {
  renderAtRoute,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
} from '../test-utils';

// Type defaults to 'Haupt' (already a valid selection) and Vollmacht is
// optional, so both are deliberately absent here -- see AccountsPage's own
// fillValidForm helper for the same reasoning this mirrors.
const validFormEntries = [
  ['Account nr / IBAN:', 'DE99 1111 2222'],
  ['Full name:', 'Depot Konto'],
  ['Short name:', 'Depot'],
  ['Saldo:', '100'],
  ['Active since:', '2022-03-01'],
  ['Owner:', 'Ada Lovelace'],
];

function setup() {
  return renderAtRoute(<NewAccountPage />, {
    route: '/accounts/new',
    path: '/accounts/new',
    sentinels: ['/login', '/accounts'],
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

describe('NewAccountPage', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('loading: renders loading text while /me is pending', () => {
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

  test('non-401 not-ok (500): shows "Failed to verify session", does not navigate', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(500));

    setup();

    expect(await screen.findByText('Failed to verify session')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
  });

  test('rejected fetch: shows "Failed to verify session", calls console.error, does not navigate', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    setup();

    expect(await screen.findByText('Failed to verify session')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('issues the mount GET to the right url with method and credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }));

    setup();

    await screen.findByLabelText('Type:');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/me',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  test('thirteen labelled controls render', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }));

    setup();

    await screen.findByLabelText('Type:');

    expect(screen.getByLabelText('Type:')).toBeInTheDocument();
    expect(screen.getByLabelText('Account nr / IBAN:')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name:')).toBeInTheDocument();
    expect(screen.getByLabelText('Short name:')).toBeInTheDocument();
    expect(screen.getByLabelText('Saldo:')).toBeInTheDocument();
    expect(screen.getByLabelText('Active since:')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner:')).toBeInTheDocument();
    expect(screen.getByLabelText('Vollmacht:')).toBeInTheDocument();
    expect(screen.getByLabelText('Aktiv:')).toBeInTheDocument();
    expect(screen.getByLabelText('Include in saldo:')).toBeInTheDocument();
    expect(screen.getByLabelText('Zinssatz (%):')).toBeInTheDocument();
    expect(screen.getByLabelText('Basiszins (%):')).toBeInTheDocument();
    expect(screen.getByLabelText('Comment:')).toBeInTheDocument();
  });

  test('defaults on load: type Haupt, both flags checked, rates and comment empty', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }));

    setup();

    await screen.findByLabelText('Type:');

    expect(screen.getByLabelText('Type:')).toHaveValue('Haupt');
    expect(screen.getByLabelText('Aktiv:')).toBeChecked();
    expect(screen.getByLabelText('Include in saldo:')).toBeChecked();
    expect(screen.getByLabelText('Zinssatz (%):')).toHaveValue(null);
    expect(screen.getByLabelText('Basiszins (%):')).toHaveValue(null);
    expect(screen.getByLabelText('Comment:')).toHaveValue('');
  });

  test('missing required field (skip Full name): shows validation error, stays on page, issues no POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await fillValidForm(user, { skip: 'Full name:' });
    await user.click(screen.getByRole('button', { name: 'Save account' }));

    expect(
      await screen.findByText(
        'Type, account number, full name, short name, saldo, active since and owner are required'
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Type:')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount GET only, no POST
  });

  test('only Vollmacht empty: the POST is issued', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save account' }));

    expect(await screen.findByText('navigated:/accounts')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('create success: POSTs correct url/method/credentials/headers, body saldo as number, navigates to /accounts', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save account' }));

    expect(await screen.findByText('navigated:/accounts')).toBeInTheDocument();

    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('http://localhost:8080/accounts');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));

    const body = JSON.parse(options.body);
    expect(body.saldo).toBe(100);
    expect(typeof body.saldo).toBe('number');
  });

  test('defaults untouched: aktiv and include_in_saldo are real booleans, rates are null, comment is empty', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save account' }));

    await screen.findByText('navigated:/accounts');

    const [, options] = fetchMock.mock.calls[1];
    const body = JSON.parse(options.body);

    expect(body.aktiv).toBe(true);
    expect(typeof body.aktiv).toBe('boolean');
    expect(body.include_in_saldo).toBe(true);
    expect(typeof body.include_in_saldo).toBe('boolean');
    // A 0 would pass a falsy check, which is exactly the bug being guarded
    // against -- assert null explicitly, not merely falsy.
    expect(body.zinssatz).toBeNull();
    expect(body.basiszins).toBeNull();
    expect(body.comment).toBe('');
  });

  test('optional fields filled: type Anlage, numeric rates, comment string present', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Account created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await fillValidForm(user);
    await user.selectOptions(screen.getByLabelText('Type:'), 'Anlage');
    await user.type(screen.getByLabelText('Zinssatz (%):'), '2.5');
    await user.type(screen.getByLabelText('Basiszins (%):'), '1.75');
    await user.type(screen.getByLabelText('Comment:'), 'A note');
    await user.click(screen.getByRole('button', { name: 'Save account' }));

    await screen.findByText('navigated:/accounts');

    const [, options] = fetchMock.mock.calls[1];
    const body = JSON.parse(options.body);

    expect(body.type).toBe('Anlage');
    expect(body.zinssatz).toBe(2.5);
    expect(typeof body.zinssatz).toBe('number');
    expect(body.basiszins).toBe(1.75);
    expect(typeof body.basiszins).toBe('number');
    expect(body.comment).toBe('A note');
  });

  test('POST not-ok: shows "Failed to create account", stays on the page', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save account' }));

    expect(await screen.findByText('Failed to create account')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/accounts')).not.toBeInTheDocument();
  });

  test('POST rejects: shows "Failed to create account", calls console.error, stays on the page', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' } }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Type:');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Save account' }));

    expect(await screen.findByText('Failed to create account')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/accounts')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

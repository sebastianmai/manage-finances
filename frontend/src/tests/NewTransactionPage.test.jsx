import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewTransactionPage from '../components/NewTransactionPage';
import {
  renderAtRoute,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
} from '../test-utils';

const account1 = {
  id: '11111111-1111-1111-1111-111111111111',
  short_name: 'Giro',
  full_name: 'Girokonto Sparkasse',
};

const account2 = {
  id: '22222222-2222-2222-2222-222222222222',
  short_name: 'Spar',
  full_name: 'Sparkonto Tagesgeld',
};

// Exactly the eight seeded names and nothing else -- typing a ninth name not
// in this list is what proves a value outside the suggestion list still
// submits.
const CATEGORY_FIXTURE = [
  'Groceries',
  'Housing',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Health',
  'Dining',
  'Savings',
];

function setup() {
  return renderAtRoute(<NewTransactionPage />, {
    route: '/transactions/new',
    path: '/transactions/new',
    sentinels: ['/login', '/'],
  });
}

async function fillBasicFields(
  user,
  { account = account1, category = 'Groceries', description = 'Test booking', amount = '50', date = '2026-08-25', skip } = {}
) {
  if (skip !== 'date') {
    await user.type(screen.getByLabelText('Date:'), date);
  }
  if (skip !== 'account') {
    await user.selectOptions(screen.getByLabelText('Account:'), account.id);
  }
  if (skip !== 'category') {
    await user.type(screen.getByLabelText('Category:'), category);
  }
  if (skip !== 'description') {
    await user.type(screen.getByLabelText('Description:'), description);
  }
  if (skip !== 'amount') {
    await user.type(screen.getByLabelText('Amount:'), amount);
  }
}

describe('NewTransactionPage', () => {
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
    fetchMock
      .mockResolvedValueOnce(notOkResponse(401))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account:')).not.toBeInTheDocument();
  });

  test('non-401 not-ok (500): shows load error, does not navigate', async () => {
    fetchMock
      .mockResolvedValueOnce(notOkResponse(500))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
  });

  test('rejected fetch: shows load error, calls console.error, does not navigate', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('issues the mount GETs to the right urls with method and credentials', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    await screen.findByLabelText('Account:');

    expect(fetchMock.mock.calls[0]).toEqual([
      'http://localhost:8080/accounts',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      'http://localhost:8080/categories',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    ]);
  });

  test('zero accounts: renders the pointer message and an /accounts link, no account select', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(
      await screen.findByText('You need at least one account before you can record a booking.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to accounts' })).toHaveAttribute('href', '/accounts');
    expect(screen.queryByLabelText('Account:')).not.toBeInTheDocument();
  });

  test('with accounts: the account select offers one distinguishably-labelled option per account', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    const select = await screen.findByLabelText('Account:');
    expect(within(select).getByText('Giro — Girokonto Sparkasse')).toBeInTheDocument();
    expect(within(select).getByText('Spar — Sparkonto Tagesgeld')).toBeInTheDocument();
  });

  test('missing required field: shows validation error, keeps form mounted, issues no POST', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user, { skip: 'description' });
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('All fields are required')).toBeInTheDocument();
    expect(screen.getByLabelText('Account:')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only, no POST
  });

  test('zero amount: shows the zero-amount error, issues no POST', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user, { amount: '0' });
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('Amount cannot be zero')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only, no POST
  });

  test('destination select is absent unchecked, present checked, absent again after unchecking', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    expect(screen.queryByLabelText('Transfer to:')).not.toBeInTheDocument();

    const checkbox = screen.getByLabelText('This is a transfer to another of my own accounts');
    await user.click(checkbox);
    expect(screen.getByLabelText('Transfer to:')).toBeInTheDocument();

    await user.click(checkbox);
    expect(screen.queryByLabelText('Transfer to:')).not.toBeInTheDocument();
  });

  test('exclusion: with source set to account 1, destination offers account 2 but not account 1', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await user.selectOptions(screen.getByLabelText('Account:'), account1.id);
    await user.click(screen.getByLabelText('This is a transfer to another of my own accounts'));

    const destinationSelect = screen.getByLabelText('Transfer to:');
    expect(within(destinationSelect).queryByText('Giro — Girokonto Sparkasse')).not.toBeInTheDocument();
    expect(within(destinationSelect).getByText('Spar — Sparkonto Tagesgeld')).toBeInTheDocument();
  });

  test('reactive exclusion: changing source onto the chosen destination clears it and blocks submit', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user, { account: account1 });
    await user.click(screen.getByLabelText('This is a transfer to another of my own accounts'));
    await user.selectOptions(screen.getByLabelText('Transfer to:'), account2.id);

    // Change the source to the account currently chosen as the destination.
    await user.selectOptions(screen.getByLabelText('Account:'), account2.id);

    expect(screen.getByLabelText('Transfer to:').value).toBe('');

    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(
      await screen.findByText('Select a destination account for the transfer')
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only, no POST
  });

  test('normal booking success: POSTs string account_id, numeric amount with sign preserved, no transfer key, navigates to /', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user, { amount: '-42.50' });
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('navigated:/')).toBeInTheDocument();

    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe('http://localhost:8080/transactions');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));

    const body = JSON.parse(options.body);
    expect(body.account_id).toBe(account1.id);
    expect(typeof body.account_id).toBe('string');
    expect(body.amount).toBe(-42.5);
    expect(typeof body.amount).toBe('number');
    expect(body).not.toHaveProperty('transfer_to_account_id');
  });

  test('transfer success: POSTs string transfer_to_account_id, navigates to /', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1, account2] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user, { account: account1, amount: '30' });
    await user.click(screen.getByLabelText('This is a transfer to another of my own accounts'));
    await user.selectOptions(screen.getByLabelText('Transfer to:'), account2.id);
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('navigated:/')).toBeInTheDocument();

    const [, options] = fetchMock.mock.calls[2];
    const body = JSON.parse(options.body);
    expect(body.transfer_to_account_id).toBe(account2.id);
    expect(typeof body.transfer_to_account_id).toBe('string');
  });

  test('POST not-ok: shows submit error, stays on the page', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user);
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('Failed to create transaction')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/')).not.toBeInTheDocument();
  });

  test('POST rejects: shows submit error, calls console.error, stays on the page', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user);
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('Failed to create transaction')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('category suggestions: focusing the category input offers one option per category the backend returned, and no others', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    // The native datalist element is gone entirely -- this is the gate
    // that the custom combobox genuinely replaced it rather than sitting
    // alongside it.
    expect(document.getElementById('category-suggestions')).toBeNull();

    await user.click(screen.getByLabelText('Category:'));

    const listbox = screen.getByRole('listbox');
    const optionTexts = within(listbox).getAllByRole('option').map(
      (option) => option.textContent
    );
    expect(optionTexts).toEqual(CATEGORY_FIXTURE);
  });

  test('unrecognised category: typing a name not in the suggestion list still submits it verbatim', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');
    await fillBasicFields(user, { category: 'Kinderbetreuung' });
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('navigated:/')).toBeInTheDocument();

    const [, options] = fetchMock.mock.calls[2];
    const body = JSON.parse(options.body);
    expect(body.category).toBe('Kinderbetreuung');
  });

  test('categories fetch fails: form still renders, suggestion list stays empty, console.error called, booking still submits (D-10)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ accounts: [account1] }))
      .mockResolvedValueOnce(notOkResponse(500))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction created successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Account:');

    await user.click(screen.getByLabelText('Category:'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();

    await fillBasicFields(user);
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    expect(await screen.findByText('navigated:/')).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});

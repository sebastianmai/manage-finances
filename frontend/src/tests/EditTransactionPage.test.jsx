import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditTransactionPage from '../components/EditTransactionPage';
import {
  renderAtRoute,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
} from '../test-utils';

const transaction1 = {
  id: 7,
  account_id: '11111111-1111-1111-1111-111111111111',
  amount: -42.5,
  description: 'Weekly groceries',
  category: 'Groceries',
  transaction_date: '2026-08-20',
};

const transaction2 = {
  id: 8,
  account_id: '11111111-1111-1111-1111-111111111111',
  amount: 100,
  description: 'Salary',
  category: 'Income',
  transaction_date: '2026-08-01',
};

const transaction3 = {
  id: 9,
  account_id: '22222222-2222-2222-2222-222222222222',
  amount: -12,
  description: 'Coffee',
  category: 'Dining',
  transaction_date: '2026-08-15',
};

const CATEGORY_FIXTURE = ['Dining', 'Groceries', 'Income'];

function setup() {
  return renderAtRoute(<EditTransactionPage />, {
    route: '/transactions/7/edit',
    path: '/transactions/:id/edit',
    sentinels: ['/login', '/transactions'],
  });
}

describe('EditTransactionPage', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('loading: renders loading text while /transactions is pending', () => {
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
    expect(screen.queryByLabelText('Date:')).not.toBeInTheDocument();
  });

  test('non-401 not-ok (500): shows "Failed to load transaction", does not navigate', async () => {
    fetchMock
      .mockResolvedValueOnce(notOkResponse(500))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(await screen.findByText('Failed to load transaction')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
  });

  test('rejected fetch: shows "Failed to load transaction", calls console.error, does not navigate', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(await screen.findByText('Failed to load transaction')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('id absent from the returned list (foreign or nonexistent id): shows "Transaction not found"', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction2, transaction3] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(await screen.findByText('Transaction not found')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date:')).not.toBeInTheDocument();
  });

  test('mount issues GET /transactions then GET /categories, both with credentials: include', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    await screen.findByLabelText('Date:');

    expect(fetchMock.mock.calls[0]).toEqual([
      'http://localhost:8080/transactions',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      'http://localhost:8080/categories',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    ]);
  });

  test('form is prefilled with the matching transaction\'s date, category, description and amount', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1, transaction2] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    await screen.findByLabelText('Date:');

    expect(screen.getByLabelText('Date:')).toHaveValue(transaction1.transaction_date);
    expect(screen.getByLabelText('Category:')).toHaveValue(transaction1.category);
    expect(screen.getByLabelText('Description:')).toHaveValue(transaction1.description);
    expect(screen.getByLabelText('Amount:')).toHaveValue(transaction1.amount);
  });

  // D-12 trap: the route param '7' is a string, transaction1.id is the
  // number 7. A bare === between them fails, and only this test catches it.
  test('a numeric id is matched from the string route param (D-12)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));

    setup();

    expect(await screen.findByLabelText('Date:')).toBeInTheDocument();
    expect(screen.queryByText('Transaction not found')).not.toBeInTheDocument();
  });

  test('category suggestions: focusing the category input offers one option per category the backend returned', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    // The native datalist element is gone entirely -- this is the gate
    // that the custom combobox genuinely replaced it rather than sitting
    // alongside it.
    expect(document.getElementById('category-suggestions')).toBeNull();

    // The field opens pre-filled with the transaction's own category, so
    // it must be cleared first to observe the full unfiltered list this
    // page's `categories` state feeds the combobox (D-02): a non-empty
    // query would legitimately narrow it, which is exercised separately
    // by the free-text PATCH test below.
    await user.clear(screen.getByLabelText('Category:'));

    const listbox = screen.getByRole('listbox');
    const optionTexts = within(listbox).getAllByRole('option').map(
      (option) => option.textContent
    );
    expect(optionTexts).toEqual(CATEGORY_FIXTURE);
  });

  test('categories fetch fails: suggestion list stays empty, form still renders, console.error called, save still succeeds (D-10)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(notOkResponse(500))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    // The field opens pre-filled with the transaction's own category, so
    // with zero real suggestions from the failed fetch the panel still
    // shows the create-hint row for that typed text (this is correct
    // combobox behavior, not a leftover suggestion) -- the assertion that
    // matters here is that no *real* category option renders.
    await user.click(screen.getByLabelText('Category:'));
    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toBe('Create "Groceries"');
    expect(errorSpy).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('navigated:/transactions')).toBeInTheDocument();

    errorSpy.mockRestore();
  });

  test('clearing the description and saving shows "All fields are required", issues no PATCH', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    await user.clear(screen.getByLabelText('Description:'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('All fields are required')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only, no PATCH
  });

  test('an amount of 0 shows "Amount cannot be zero", issues no PATCH', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    await user.clear(screen.getByLabelText('Amount:'));
    await user.type(screen.getByLabelText('Amount:'), '0');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Amount cannot be zero')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only, no PATCH
  });

  test('save success: PATCHes the right url/method/credentials/headers, navigates to /transactions', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('navigated:/transactions')).toBeInTheDocument();

    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe('http://localhost:8080/transactions/7');
    expect(options.method).toBe('PATCH');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
  });

  test('the PATCH body carries a numeric amount and no account_id key', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('navigated:/transactions');

    const [, options] = fetchMock.mock.calls[2];
    const body = JSON.parse(options.body);

    expect(body.amount).toBe(transaction1.amount);
    expect(typeof body.amount).toBe('number');
    expect(body).not.toHaveProperty('account_id');
  });

  test('typing a category not in the suggestion list sends that exact text in the PATCH body', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Transaction updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    await user.clear(screen.getByLabelText('Category:'));
    await user.type(screen.getByLabelText('Category:'), 'Kinderbetreuung');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('navigated:/transactions');

    const [, options] = fetchMock.mock.calls[2];
    const body = JSON.parse(options.body);
    expect(body.category).toBe('Kinderbetreuung');
  });

  test('PATCH not-ok: shows "Failed to save transaction", stays on the page', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Failed to save transaction')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/transactions')).not.toBeInTheDocument();
  });

  test('PATCH rejects: shows "Failed to save transaction", calls console.error, stays on the page', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ transactions: [transaction1] }))
      .mockResolvedValueOnce(jsonResponse({ categories: CATEGORY_FIXTURE }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Date:');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Failed to save transaction')).toBeInTheDocument();
    expect(screen.queryByText('navigated:/transactions')).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

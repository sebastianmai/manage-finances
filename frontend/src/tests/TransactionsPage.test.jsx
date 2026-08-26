import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionsPage from '../components/TransactionsPage';
import {
  renderAtRoute,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
  EUR,
  normalizeSpace,
} from '../test-utils';

const accountGiro = { id: 'acct-giro-uuid', short_name: 'Giro' };
const accountTages = { id: 'acct-tages-uuid', short_name: 'Tages' };

// Amounts are chosen so numeric ascending order (-50, 5, 1000) differs from
// lexicographic ascending order ('-50', '1000', '5') -- an amount-sort
// assertion that only holds under numeric comparison has real teeth.
// txn1 and txn3 share a category but have different descriptions, giving
// the description-only search assertions something to prove. "run" appears
// in both txn1's and txn2's descriptions but not txn3's, for the
// search+sort combine test.
const txn1 = {
  id: 1,
  account_id: accountGiro.id,
  amount: -50,
  description: 'Grocery shopping run',
  category: 'Groceries',
  transaction_date: '2026-08-20',
  transfer_to_account_id: '',
  updated_at: '2026-08-20 10:00:00',
};

const txn2 = {
  id: 2,
  account_id: accountTages.id,
  amount: 5,
  description: 'Coffee run downtown',
  category: 'Dining',
  transaction_date: '2026-08-22',
  transfer_to_account_id: '',
  updated_at: '2026-08-22 10:00:00',
};

const txn3 = {
  id: 3,
  account_id: accountGiro.id,
  amount: 1000,
  description: 'Salary payment received',
  category: 'Groceries',
  transaction_date: '2026-08-25',
  transfer_to_account_id: '',
  updated_at: '2026-08-25 10:00:00',
};

function setup() {
  return renderAtRoute(<TransactionsPage />, {
    route: '/transactions',
    path: '/transactions',
    sentinels: ['/login'],
  });
}

/** Returns which of txn1/txn2/txn3 are currently rendered, in row order. */
function orderedTxnKeys() {
  const rows = screen.getAllByRole('row').slice(1); // skip header row
  return rows.map((row) => {
    if (row.textContent.includes(txn1.description)) return 'txn1';
    if (row.textContent.includes(txn2.description)) return 'txn2';
    if (row.textContent.includes(txn3.description)) return 'txn3';
    return null;
  });
}

describe('TransactionsPage', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('load and auth', () => {
    test('loading: renders loading text while /transactions is pending', () => {
      const { promise } = deferred();
      fetchMock.mockReturnValueOnce(promise);

      setup();

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('401 from /transactions navigates to /login sentinel, renders no table', async () => {
      fetchMock.mockResolvedValueOnce(notOkResponse(401));

      setup();

      expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    test('non-401 not-ok (500): shows load error, does not navigate', async () => {
      fetchMock
        .mockResolvedValueOnce(notOkResponse(500))
        .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

      setup();

      expect(await screen.findByText('Failed to load transactions')).toBeInTheDocument();
      expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
    });

    test('rejected /transactions fetch: shows load error, calls console.error, does not navigate', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

      setup();

      expect(await screen.findByText('Failed to load transactions')).toBeInTheDocument();
      expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    test('failing /accounts fetch: shows Failed to load accounts, does not navigate', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [] }))
        .mockResolvedValueOnce(notOkResponse(500));

      setup();

      expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
      expect(screen.queryByText('navigated:/login')).not.toBeInTheDocument();
    });

    test('mount issues GET /transactions then GET /accounts, both with credentials: include', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

      setup();

      await screen.findByText('No transactions yet.');

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://localhost:8080/transactions',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8080/accounts',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });
  });

  describe('rendering', () => {
    test('two transactions render as two data rows plus a header row', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }));

      setup();

      const rows = await screen.findAllByRole('row');
      expect(rows).toHaveLength(3);

      expect(screen.getByText(txn1.transaction_date)).toBeInTheDocument();
      expect(screen.getByText(accountGiro.short_name)).toBeInTheDocument();
      expect(screen.getByText(normalizeSpace(EUR.format(txn1.amount)))).toBeInTheDocument();
      expect(screen.getByText(txn1.description)).toBeInTheDocument();
      expect(screen.getByText(txn1.category)).toBeInTheDocument();

      expect(screen.getByText(accountTages.short_name)).toBeInTheDocument();
      expect(screen.getByText(normalizeSpace(EUR.format(txn2.amount)))).toBeInTheDocument();
    });

    test('account column shows the resolved short_name; the raw account_id UUID appears nowhere', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro] }));

      setup();

      await screen.findByText(txn1.description);

      expect(screen.getByText(accountGiro.short_name)).toBeInTheDocument();
      expect(screen.queryByText(accountGiro.id)).not.toBeInTheDocument();
    });

    test('a negative amount cell carries text-red-500 and a positive one text-green-600', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }));

      setup();

      const negativeCell = await screen.findByText(normalizeSpace(EUR.format(txn1.amount)));
      const positiveCell = screen.getByText(normalizeSpace(EUR.format(txn2.amount)));

      expect(negativeCell).toHaveClass('text-red-500');
      expect(positiveCell).toHaveClass('text-green-600');
    });

    test('empty list renders "No transactions yet." and no table', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

      setup();

      expect(await screen.findByText('No transactions yet.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    function setupThreeTxns() {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }));
      return setup();
    }

    test('default order is the server order (transaction_date descending)', async () => {
      setupThreeTxns();

      await screen.findByText(txn1.description);

      expect(orderedTxnKeys()).toEqual(['txn3', 'txn2', 'txn1']);
    });

    test('clicking Description sorts ascending; clicking again reverses to descending', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: /Description/ }));
      expect(orderedTxnKeys()).toEqual(['txn2', 'txn1', 'txn3']);

      await user.click(screen.getByRole('button', { name: /Description/ }));
      expect(orderedTxnKeys()).toEqual(['txn3', 'txn1', 'txn2']);
    });

    test('clicking Amount sorts numerically ascending, distinguishing numeric from lexicographic order', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: /Amount/ }));
      // Numeric ascending: -50, 5, 1000 -> txn1, txn2, txn3.
      // Lexicographic ascending would instead give txn1, txn3, txn2.
      expect(orderedTxnKeys()).toEqual(['txn1', 'txn2', 'txn3']);
    });

    test('the active header shows a direction indicator, an inactive header does not', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: /Amount/ }));

      expect(screen.getByRole('button', { name: /Amount/ }).textContent).toContain('▲');
      expect(screen.getByRole('button', { name: /^Date/ }).textContent).not.toMatch(/[▲▼]/);
    });

    test('switching to a different column starts that column ascending', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: /Amount/ }));
      expect(screen.getByRole('button', { name: /Amount/ }).textContent).toContain('▲');

      await user.click(screen.getByRole('button', { name: /Category/ }));
      expect(screen.getByRole('button', { name: /Category/ }).textContent).toContain('▲');
      expect(screen.getByRole('button', { name: /Amount/ }).textContent).not.toMatch(/[▲▼]/);
    });
  });

  describe('search', () => {
    function setupThreeTxns() {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }));
      return setup();
    }

    test('typing a description substring narrows the table to matching rows', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.type(screen.getByLabelText('Search descriptions:'), 'run');

      expect(screen.getByText(txn1.description)).toBeInTheDocument();
      expect(screen.getByText(txn2.description)).toBeInTheDocument();
      expect(screen.queryByText(txn3.description)).not.toBeInTheDocument();
    });

    test('matching is case-insensitive', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.type(screen.getByLabelText('Search descriptions:'), 'GROCERY');

      expect(screen.getByText(txn1.description)).toBeInTheDocument();
      expect(screen.queryByText(txn2.description)).not.toBeInTheDocument();
      expect(screen.queryByText(txn3.description)).not.toBeInTheDocument();
    });

    test('a term matching only a category matches nothing -- search is description-only', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.type(screen.getByLabelText('Search descriptions:'), 'Dining');

      expect(await screen.findByText('No transactions match your search.')).toBeInTheDocument();
    });

    test('a term matching only an account name matches nothing -- search is description-only', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.type(screen.getByLabelText('Search descriptions:'), accountGiro.short_name);

      expect(await screen.findByText('No transactions match your search.')).toBeInTheDocument();
    });

    test('a term matching nothing renders "No transactions match your search."', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.type(screen.getByLabelText('Search descriptions:'), 'zzzznomatch');

      expect(await screen.findByText('No transactions match your search.')).toBeInTheDocument();
    });

    test('search and sort combine: filter applied, remaining rows stay in the active sort order', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: /Amount/ }));
      await user.type(screen.getByLabelText('Search descriptions:'), 'run');

      expect(orderedTxnKeys()).toEqual(['txn1', 'txn2']);
    });
  });

  describe('edit', () => {
    function setupThreeTxns() {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }));
      return setup();
    }

    test('clicking Edit reveals prefilled inputs and swaps Edit/Delete for Save/Cancel', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));

      expect(screen.getByLabelText(`Date: ${txn1.description}`)).toHaveValue(txn1.transaction_date);
      expect(screen.getByLabelText(`Amount: ${txn1.description}`)).toHaveValue(txn1.amount);
      expect(screen.getByLabelText(`Description: ${txn1.description}`)).toHaveValue(txn1.description);
      expect(screen.getByLabelText(`Category: ${txn1.description}`)).toHaveValue(txn1.category);

      expect(screen.getByRole('button', { name: `Save ${txn1.description}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Cancel ${txn1.description}` })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: `Edit ${txn1.description}` })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: `Delete ${txn1.description}` })).not.toBeInTheDocument();
    });

    test('save success: PATCHes the right url/method/credentials/headers with a numeric amount, closes edit, refetches', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }))
        .mockResolvedValueOnce(jsonResponse({ message: 'Transaction updated successfully' }))
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }));
      setup();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));
      await user.click(screen.getByRole('button', { name: `Save ${txn1.description}` }));

      await screen.findByRole('button', { name: `Edit ${txn1.description}` });

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const [url, options] = fetchMock.mock.calls[2];
      expect(url).toBe(`http://localhost:8080/transactions/${txn1.id}`);
      expect(options.method).toBe('PATCH');
      expect(options.credentials).toBe('include');
      expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));

      const body = JSON.parse(options.body);
      expect(typeof body.amount).toBe('number');
      expect(body.amount).toBe(txn1.amount);
    });

    test('the PATCH body contains no account_id key', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }))
        .mockResolvedValueOnce(jsonResponse({ message: 'Transaction updated successfully' }))
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }));
      setup();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));
      await user.click(screen.getByRole('button', { name: `Save ${txn1.description}` }));

      await screen.findByRole('button', { name: `Edit ${txn1.description}` });

      const [, options] = fetchMock.mock.calls[2];
      const body = JSON.parse(options.body);
      expect(body).not.toHaveProperty('account_id');
    });

    test('save failure (not-ok): shows error, leaves row in edit mode with the attempted values', async () => {
      const user = userEvent.setup();
      setupThreeTxns();
      fetchMock.mockResolvedValueOnce(notOkResponse(500));

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));
      const amountInput = screen.getByLabelText(`Amount: ${txn1.description}`);
      await user.clear(amountInput);
      await user.type(amountInput, '-75');
      await user.click(screen.getByRole('button', { name: `Save ${txn1.description}` }));

      expect(await screen.findByText('Failed to update transaction')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Save ${txn1.description}` })).toBeInTheDocument();
      expect(screen.getByLabelText(`Amount: ${txn1.description}`)).toHaveValue(-75);
    });

    test('save rejection: shows error, calls console.error, stays in edit mode', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      setupThreeTxns();
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));
      await user.click(screen.getByRole('button', { name: `Save ${txn1.description}` }));

      expect(await screen.findByText('Failed to update transaction')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Save ${txn1.description}` })).toBeInTheDocument();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    test('clearing description and saving shows "All fields are required" and issues no PATCH', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));
      const descriptionInput = screen.getByLabelText(`Description: ${txn1.description}`);
      await user.clear(descriptionInput);
      await user.click(screen.getByRole('button', { name: `Save ${txn1.description}` }));

      expect(await screen.findByText('All fields are required')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only
    });

    test('an amount of 0 shows "Amount cannot be zero" and issues no PATCH', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));
      const amountInput = screen.getByLabelText(`Amount: ${txn1.description}`);
      await user.clear(amountInput);
      await user.type(amountInput, '0');
      await user.click(screen.getByRole('button', { name: `Save ${txn1.description}` }));

      expect(await screen.findByText('Amount cannot be zero')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only
    });

    test('cancel closes the edit row and issues no PATCH', async () => {
      const user = userEvent.setup();
      setupThreeTxns();

      await screen.findByText(txn1.description);

      await user.click(screen.getByRole('button', { name: `Edit ${txn1.description}` }));
      await user.click(screen.getByRole('button', { name: `Cancel ${txn1.description}` }));

      expect(screen.getByRole('button', { name: `Edit ${txn1.description}` })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only
    });
  });

  describe('delete', () => {
    function setupThreeTxns() {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }));
      return setup();
    }

    test('each row carries a per-row delete control with a distinguishing accessible name', async () => {
      setupThreeTxns();

      expect(await screen.findByRole('button', { name: `Delete ${txn1.description}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Delete ${txn2.description}` })).toBeInTheDocument();
    });

    test('delete success: confirms, DELETEs the right url, refetches, row disappears', async () => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn1, txn2, txn3] }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountGiro, accountTages] }))
        .mockResolvedValueOnce(jsonResponse({ message: 'Transaction deleted successfully' }))
        .mockResolvedValueOnce(jsonResponse({ transactions: [txn2, txn3] }));
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      setup();

      await user.click(await screen.findByRole('button', { name: `Delete ${txn1.description}` }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0][0]).toEqual(expect.stringContaining(txn1.description));

      await screen.findByText(txn2.description);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const [url, options] = fetchMock.mock.calls[2];
      expect(url).toBe(`http://localhost:8080/transactions/${txn1.id}`);
      expect(options.method).toBe('DELETE');
      expect(options.credentials).toBe('include');

      expect(screen.queryByText(txn1.description)).not.toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    test('delete cancelled: no request, row stays', async () => {
      const user = userEvent.setup();
      setupThreeTxns();
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

      await user.click(await screen.findByRole('button', { name: `Delete ${txn1.description}` }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2); // mount GETs only
      expect(screen.getByText(txn1.description)).toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    test('delete fails not-ok: shows error, no refetch, row stays', async () => {
      const user = userEvent.setup();
      setupThreeTxns();
      fetchMock.mockResolvedValueOnce(notOkResponse(500));
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

      await user.click(await screen.findByRole('button', { name: `Delete ${txn1.description}` }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Failed to delete transaction')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(3); // mount GETs + DELETE, no refresh GET
      expect(screen.getByText(txn1.description)).toBeInTheDocument();

      confirmSpy.mockRestore();
    });

    test('delete rejects: shows error, calls console.error, row stays', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();
      setupThreeTxns();
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

      await user.click(await screen.findByRole('button', { name: `Delete ${txn1.description}` }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Failed to delete transaction')).toBeInTheDocument();
      expect(errorSpy).toHaveBeenCalled();
      expect(screen.getByText(txn1.description)).toBeInTheDocument();

      errorSpy.mockRestore();
      confirmSpy.mockRestore();
    });
  });
});

import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../components/Home';
import {
  renderWithRouter,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
  dispatchAuthChange,
  EUR,
  normalizeSpace,
} from '../test-utils';

const accountWithRates = {
  id: 'acct-1',
  short_name: 'Giro',
  zinssatz: 1.5,
  basiszins: 0.25,
};

describe('Home', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
    // Load-bearing, not decoration: this is what lets all the
    // mockResolvedValueOnce chains below keep working untouched. Calls 1-3
    // (/me, /balance, /accounts) are still satisfied in order by each
    // test's explicit chain; the new fourth call (/settings) falls through
    // to this non-Once default instead of resolving to undefined.
    fetchMock.mockResolvedValue(
      jsonResponse({ settings: { balance_threshold: 100000, show_decimals: true } })
    );
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('while /me is pending, the component renders nothing at all', () => {
    const { promise } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    const { container } = renderWithRouter(<Home />);

    expect(container).toBeEmptyDOMElement();
  });

  test('/me not-ok -> logged-out hero renders and balance/accounts are never requested', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Welcome to My-Finances')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log In' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/sign-up');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/balance'),
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/accounts'),
      expect.anything()
    );
  });

  test('/me ok + /balance ok zero -> welcome-back with name, formatted amount, and no-transactions hint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Welcome back, Ada')).toBeInTheDocument();
    expect(screen.getByText(normalizeSpace(EUR.format(0)))).toBeInTheDocument();
    expect(screen.getByText('No transactions have been recorded yet.')).toBeInTheDocument();
  });

  test('/me ok + /balance ok non-zero -> formatted amount shows, no hint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    renderWithRouter(<Home />);

    expect(await screen.findByText(normalizeSpace(EUR.format(1234.5)))).toBeInTheDocument();
    expect(
      screen.queryByText('No transactions have been recorded yet.')
    ).not.toBeInTheDocument();
  });

  test('/me ok + /balance not-ok -> error renders, numeric balance paragraph does not', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(notOkResponse(500))
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Failed to load balance')).toBeInTheDocument();
    expect(screen.queryByText(normalizeSpace(EUR.format(0)))).not.toBeInTheDocument();
  });

  test('/me ok + /balance rejects -> same error, no crash, console.error called', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Failed to load balance')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('a failing /balance does not block /accounts from being fetched -- the two are independent', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(notOkResponse(500))
      .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Failed to load balance')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Zinssatz and Basiszins/ })).toBeInTheDocument();
  });

  test('authchange re-fetch flips logged-out hero to welcome-back with balance', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Home />);
    expect(await screen.findByText('Welcome to My-Finances')).toBeInTheDocument();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }));
    await dispatchAuthChange();

    expect(await screen.findByText('Welcome back, Ada')).toBeInTheDocument();
    expect(screen.getByText(normalizeSpace(EUR.format(1234.5)))).toBeInTheDocument();
  });

  test('logged-in view exposes a link to /transactions/new', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Welcome back, Ada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New booking' })).toHaveAttribute(
      'href',
      '/transactions/new'
    );
  });

  test('logged-out hero does not render the new-booking link', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Welcome to My-Finances')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New booking' })).not.toBeInTheDocument();
  });

  test('renders the server balance verbatim, not re-derived from the /accounts response', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 100 }))
      .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }));

    renderWithRouter(<Home />);

    expect(await screen.findByText(normalizeSpace(EUR.format(100)))).toBeInTheDocument();
  });

  test('listener cleanup: after unmount, authchange no longer triggers a fetch', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    const { unmount } = renderWithRouter(<Home />);
    await screen.findByText('Welcome to My-Finances');

    unmount();
    fetchMock.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('authchange'));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('rates chart', () => {
    test('issues a GET to /accounts with credentials: include', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }));

      renderWithRouter(<Home />);

      await screen.findByRole('img', { name: /Zinssatz and Basiszins/ });

      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'http://localhost:8080/accounts',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });

    test('with rated accounts: renders the chart and both legend labels', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }));

      renderWithRouter(<Home />);

      expect(await screen.findByRole('img', { name: /Zinssatz and Basiszins/ })).toBeInTheDocument();
      expect(screen.getByText('Zinssatz')).toBeInTheDocument();
      expect(screen.getByText('Basiszins')).toBeInTheDocument();
    });

    test('empty accounts list: shows the no-accounts message, not the chart', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [] }));

      renderWithRouter(<Home />);

      expect(await screen.findByText('No accounts yet.')).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /Zinssatz and Basiszins/ })).not.toBeInTheDocument();
    });

    test('an account with neither rate set still renders in the chart, not the no-accounts message', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
        .mockResolvedValueOnce(
          jsonResponse({ accounts: [{ id: 'a', short_name: 'Giro', zinssatz: null, basiszins: null }] })
        );

      renderWithRouter(<Home />);

      expect(await screen.findByRole('img', { name: /Zinssatz and Basiszins/ })).toBeInTheDocument();
      expect(screen.getByText('Giro')).toBeInTheDocument();
      expect(screen.queryByText('No accounts yet.')).not.toBeInTheDocument();
    });

    test('/accounts not-ok: shows Failed to load accounts, not the chart', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
        .mockResolvedValueOnce(notOkResponse(500));

      renderWithRouter(<Home />);

      expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /Zinssatz and Basiszins/ })).not.toBeInTheDocument();
    });

    test('/accounts rejects: shows Failed to load accounts, calls console.error, no crash', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
        .mockRejectedValueOnce(new Error('network down'));

      renderWithRouter(<Home />);

      expect(await screen.findByText('Failed to load accounts')).toBeInTheDocument();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('user settings', () => {
    const switchToBalanceView = async () => {
      const user = userEvent.setup();
      await user.click(screen.getByRole('tab', { name: 'Balance' }));
      return user;
    };

    test('show_decimals: false drops cents from Total balance and moves the chart aria-label to 250000', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }))
        .mockResolvedValueOnce(
          jsonResponse({ settings: { balance_threshold: 250000, show_decimals: false } })
        );

      renderWithRouter(<Home />);

      const noDecimals = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      expect(await screen.findByText(normalizeSpace(noDecimals.format(1234.5)))).toBeInTheDocument();

      await switchToBalanceView();
      expect(
        screen.getByRole('img', { name: /^Balance per account/ })
      ).toHaveAttribute('aria-label', expect.stringContaining('250.000'));
    });

    test('show_decimals: true is a pure no-op, byte-for-byte identical to a user who never opens /settings', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
        .mockResolvedValueOnce(
          jsonResponse({ settings: { balance_threshold: 100000, show_decimals: true } })
        );

      renderWithRouter(<Home />);

      expect(await screen.findByText(normalizeSpace(EUR.format(1234.5)))).toBeInTheDocument();
    });

    test('GET /settings not-ok: Total balance keeps 2 decimals, chart keeps the 100000 line, no settings error text', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }))
        .mockResolvedValueOnce(notOkResponse(500));

      renderWithRouter(<Home />);

      expect(await screen.findByText(normalizeSpace(EUR.format(1234.5)))).toBeInTheDocument();

      await switchToBalanceView();
      expect(
        screen.getByRole('img', { name: /^Balance per account/ })
      ).toHaveAttribute('aria-label', expect.stringContaining('100.000'));
      expect(screen.queryByText(/failed to load settings/i)).not.toBeInTheDocument();
    });

    test('GET /settings rejects: same fallback, page still renders normally', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [] }))
        .mockRejectedValueOnce(new Error('network down'));

      renderWithRouter(<Home />);

      expect(await screen.findByText(normalizeSpace(EUR.format(1234.5)))).toBeInTheDocument();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    test('logged out (/me not-ok): /settings is never requested, only one fetch total', async () => {
      fetchMock.mockResolvedValueOnce(notOkResponse(401));

      renderWithRouter(<Home />);

      expect(await screen.findByText('Welcome to My-Finances')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('the settings fetch is the fourth call, issued after /accounts', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 0 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }))
        .mockResolvedValueOnce(
          jsonResponse({ settings: { balance_threshold: 100000, show_decimals: true } })
        );

      renderWithRouter(<Home />);

      await screen.findByRole('img', { name: /Zinssatz and Basiszins/ });

      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        'http://localhost:8080/accounts',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        'http://localhost:8080/settings',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });

    test('show_decimals: false changes only the Total balance figure -- the chart legend/axis formatting is unaffected', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
        .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }))
        .mockResolvedValueOnce(jsonResponse({ accounts: [accountWithRates] }))
        .mockResolvedValueOnce(
          jsonResponse({ settings: { balance_threshold: 100000, show_decimals: false } })
        );

      renderWithRouter(<Home />);

      const noDecimals = new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      expect(await screen.findByText(normalizeSpace(noDecimals.format(1234.5)))).toBeInTheDocument();

      await switchToBalanceView();
      // The chart's own currencyFormatter always uses maximumFractionDigits:
      // 0 regardless of show_decimals -- unaffected by the Total's setting.
      expect(screen.getByText(normalizeSpace('100.000 € limit'))).toBeInTheDocument();
    });
  });
});

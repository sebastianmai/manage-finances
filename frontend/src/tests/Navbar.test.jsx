import { screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from '../components/Navbar';
import {
  renderWithRouter,
  installFetchMock,
  jsonResponse,
  notOkResponse,
  deferred,
  dispatchAuthChange,
} from '../test-utils';

describe('Navbar', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('while /me is pending, neither Profile nor Log In render, but the toggle and nav link do', async () => {
    const { promise } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(screen.queryByRole('img', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log In' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Theme toggle' })).toBeInTheDocument();
    expect(screen.getByText('My-Finances')).toBeInTheDocument();

    // Resolve so no pending promise is left dangling at test end.
    fetchMock.mockClear();
  });

  test('/me resolves ok -> Profile image appears, Log In does not', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(await screen.findByRole('img', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log In' })).not.toBeInTheDocument();
  });

  test('/me resolves not-ok -> Log In appears, Profile does not', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(await screen.findByRole('link', { name: 'Log In' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Profile' })).not.toBeInTheDocument();
  });

  test('/me rejects -> Log In appears and console.error was called', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(await screen.findByRole('link', { name: 'Log In' })).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('requests /me with GET and credentials include', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    await screen.findByRole('link', { name: 'Log In' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/me',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  test('authchange re-fetch flips Log In to Profile', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(await screen.findByRole('link', { name: 'Log In' })).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));
    await dispatchAuthChange();

    expect(await screen.findByRole('img', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log In' })).not.toBeInTheDocument();
  });

  test('theme toggle click calls setTheme with the opposite theme', async () => {
    fetchMock.mockResolvedValue(notOkResponse(401));
    const setTheme = jest.fn();
    const user = userEvent.setup();

    const { rerender } = renderWithRouter(<Navbar theme="dark" setTheme={setTheme} />);
    await screen.findByRole('link', { name: 'Log In' });

    await user.click(screen.getByRole('img', { name: 'Theme toggle' }));
    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith('light');

    setTheme.mockClear();
    rerender(<Navbar theme="light" setTheme={setTheme} />);
    await user.click(screen.getByRole('img', { name: 'Theme toggle' }));
    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  test('theme rendering: dark applies invert filter, light applies none', async () => {
    fetchMock.mockResolvedValue(notOkResponse(401));

    const { rerender } = renderWithRouter(<Navbar theme="dark" setTheme={jest.fn()} />);
    await screen.findByRole('link', { name: 'Log In' });
    expect(screen.getByRole('img', { name: 'Theme toggle' })).toHaveStyle({
      filter: 'brightness(0) invert(1)',
    });

    rerender(<Navbar theme="light" setTheme={jest.fn()} />);
    expect(screen.getByRole('img', { name: 'Theme toggle' }).style.filter).toBe('');
  });

  test('logged out (/me not-ok): no Accounts link', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    await screen.findByRole('link', { name: 'Log In' });
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument();
  });

  test('while /me is pending: no Accounts link', async () => {
    const { promise } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument();

    fetchMock.mockClear();
  });

  test('logged in (/me ok): Accounts link exists with href="/accounts"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    const link = await screen.findByRole('link', { name: 'Accounts' });
    expect(link).toHaveAttribute('href', '/accounts');
  });

  test('authchange after a logged-out mount makes the Accounts link appear', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    await screen.findByRole('link', { name: 'Log In' });
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));
    await dispatchAuthChange();

    expect(await screen.findByRole('link', { name: 'Accounts' })).toBeInTheDocument();
  });

  test('logged out (/me not-ok): no Transactions link', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    await screen.findByRole('link', { name: 'Log In' });
    expect(screen.queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument();
  });

  test('while /me is pending: no Transactions link', async () => {
    const { promise } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(screen.queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument();

    fetchMock.mockClear();
  });

  test('logged in (/me ok): Transactions link exists with href="/transactions"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    const link = await screen.findByRole('link', { name: 'Transactions' });
    expect(link).toHaveAttribute('href', '/transactions');
  });

  test('authchange after a logged-out mount makes the Transactions link appear', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    await screen.findByRole('link', { name: 'Log In' });
    expect(screen.queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));
    await dispatchAuthChange();

    expect(await screen.findByRole('link', { name: 'Transactions' })).toBeInTheDocument();
  });

  test('logged out (/me not-ok): no Statistics link', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    await screen.findByRole('link', { name: 'Log In' });
    expect(screen.queryByRole('link', { name: 'Statistics' })).not.toBeInTheDocument();
  });

  test('while /me is pending: no Statistics link', async () => {
    const { promise } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    expect(screen.queryByRole('link', { name: 'Statistics' })).not.toBeInTheDocument();

    fetchMock.mockClear();
  });

  test('logged in (/me ok): Statistics link exists with href="/statistics"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    const link = await screen.findByRole('link', { name: 'Statistics' });
    expect(link).toHaveAttribute('href', '/statistics');
  });

  test('authchange after a logged-out mount makes the Statistics link appear', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);

    await screen.findByRole('link', { name: 'Log In' });
    expect(screen.queryByRole('link', { name: 'Statistics' })).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));
    await dispatchAuthChange();

    expect(await screen.findByRole('link', { name: 'Statistics' })).toBeInTheDocument();
  });

  test('listener cleanup: after unmount, authchange no longer triggers a fetch', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    const { unmount } = renderWithRouter(<Navbar theme="light" setTheme={jest.fn()} />);
    await screen.findByRole('link', { name: 'Log In' });

    unmount();
    fetchMock.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('authchange'));
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { screen, act } from '@testing-library/react';
import Home from './Home';
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

describe('Home', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
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

  test('/me not-ok -> logged-out hero renders and balance is never requested', async () => {
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
  });

  test('/me ok + /balance ok zero -> welcome-back with name, formatted amount, and no-transactions hint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 0 }));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Welcome back, Ada')).toBeInTheDocument();
    expect(screen.getByText(normalizeSpace(EUR.format(0)))).toBeInTheDocument();
    expect(screen.getByText('No transactions have been recorded yet.')).toBeInTheDocument();
  });

  test('/me ok + /balance ok non-zero -> formatted amount shows, no hint', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }));

    renderWithRouter(<Home />);

    expect(await screen.findByText(normalizeSpace(EUR.format(1234.5)))).toBeInTheDocument();
    expect(
      screen.queryByText('No transactions have been recorded yet.')
    ).not.toBeInTheDocument();
  });

  test('/me ok + /balance not-ok -> error renders, numeric balance paragraph does not', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(notOkResponse(500));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Failed to load balance')).toBeInTheDocument();
    expect(screen.queryByText(normalizeSpace(EUR.format(0)))).not.toBeInTheDocument();
  });

  test('/me ok + /balance rejects -> same error, no crash, console.error called', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockRejectedValueOnce(new Error('network down'));

    renderWithRouter(<Home />);

    expect(await screen.findByText('Failed to load balance')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('authchange re-fetch flips logged-out hero to welcome-back with balance', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    renderWithRouter(<Home />);
    expect(await screen.findByText('Welcome to My-Finances')).toBeInTheDocument();

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }))
      .mockResolvedValueOnce(jsonResponse({ balance: 1234.5 }));
    await dispatchAuthChange();

    expect(await screen.findByText('Welcome back, Ada')).toBeInTheDocument();
    expect(screen.getByText(normalizeSpace(EUR.format(1234.5)))).toBeInTheDocument();
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
});

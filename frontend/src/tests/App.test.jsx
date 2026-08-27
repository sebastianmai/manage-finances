import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { installFetchMock, notOkResponse } from '../test-utils';

describe('App theme persistence', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
    fetchMock.mockResolvedValue(notOkResponse(401));
    sessionStorage.clear();
  });

  afterEach(() => {
    delete global.fetch;
    sessionStorage.clear();
  });

  test('defaults to dark when sessionStorage has no stored theme', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Theme toggle' })).toBeInTheDocument());

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('initializes from a theme already stored in sessionStorage', async () => {
    sessionStorage.setItem('theme', 'light');

    render(<App />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Theme toggle' })).toBeInTheDocument());

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('toggling the theme persists the new value to sessionStorage', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByRole('img', { name: 'Theme toggle' })).toBeInTheDocument());
    expect(sessionStorage.getItem('theme')).toBe('dark');

    await user.click(screen.getByRole('img', { name: 'Theme toggle' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(sessionStorage.getItem('theme')).toBe('light');
  });
});

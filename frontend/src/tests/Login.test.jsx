import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../components/Login';
import { renderAtRoute, installFetchMock, jsonResponse, notOkResponse } from '../test-utils';

// Login.jsx's page heading reads "Sign Up" -- a pre-existing copy defect
// (it duplicates the Signup heading text). This is asserted as-is; the
// component is never queried by heading, only by its button's accessible
// name, so the defect doesn't need to be worked around here.

function setup() {
  const authchangeListener = jest.fn();
  window.addEventListener('authchange', authchangeListener);

  const utils = renderAtRoute(<Login />, {
    route: '/login',
    path: '/login',
    sentinels: ['/'],
  });

  return { ...utils, authchangeListener };
}

describe('Login', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('typing into email and password round-trips the values', async () => {
    const user = userEvent.setup();
    setup();

    const emailInput = screen.getByLabelText('email:');
    const passwordInput = screen.getByLabelText('Password:');

    await user.type(emailInput, 'ada@example.com');
    await user.type(passwordInput, 'hunter2');

    expect(emailInput).toHaveValue('ada@example.com');
    expect(passwordInput).toHaveValue('hunter2');
  });

  test('submit guard: empty email and password performs no fetch', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'Log In' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('submit guard: only email filled performs no fetch', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText('email:'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('submit guard: only password filled performs no fetch', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText('Password:'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('success: sends PUT with credentials/json body, navigates, dispatches authchange once', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));
    const user = userEvent.setup();
    const { authchangeListener } = setup();

    await user.type(screen.getByLabelText('email:'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password:'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    expect(await screen.findByText('navigated:/')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/login',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ email: 'ada@example.com', password: 'hunter2' });

    expect(authchangeListener).toHaveBeenCalledTimes(1);
  });

  test('failure (not-ok): fields reset, no navigation, no authchange', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));
    const user = userEvent.setup();
    const { authchangeListener } = setup();

    await user.type(screen.getByLabelText('email:'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password:'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => expect(screen.getByLabelText('email:')).toHaveValue(''));
    expect(screen.getByLabelText('Password:')).toHaveValue('');
    expect(screen.queryByText('navigated:/')).not.toBeInTheDocument();
    expect(authchangeListener).not.toHaveBeenCalled();
  });

  test('network rejection: console.error called, no navigation, no authchange, fields survive', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    const { authchangeListener } = setup();

    await user.type(screen.getByLabelText('email:'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password:'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.queryByText('navigated:/')).not.toBeInTheDocument();
    expect(authchangeListener).not.toHaveBeenCalled();
    expect(screen.getByLabelText('email:')).toHaveValue('ada@example.com');
    expect(screen.getByLabelText('Password:')).toHaveValue('hunter2');

    errorSpy.mockRestore();
  });
});

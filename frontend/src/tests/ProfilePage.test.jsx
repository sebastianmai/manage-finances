import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from '../components/ProfilePage';
import { renderAtRoute, installFetchMock, jsonResponse, notOkResponse, deferred } from '../test-utils';

const originalUser = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

function setup() {
  return renderAtRoute(<ProfilePage />, {
    route: '/profile',
    path: '/profile',
    sentinels: ['/login'],
  });
}

describe('ProfilePage', () => {
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

  test('unauthenticated: /me not-ok navigates to /login sentinel, no profile fields', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    setup();

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
    expect(screen.queryByText('First name:')).not.toBeInTheDocument();
  });

  test('fetch rejection: navigates to /login sentinel, console.error called', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    setup();

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('view mode: heading, name and email as text, Edit/Log Out present, no inputs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: originalUser }));

    setup();

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  test('entering edit mode: form has three prefilled inputs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: originalUser }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(3);
    expect(screen.getByLabelText('First name:')).toHaveValue('Ada');
    expect(screen.getByLabelText('Last name:')).toHaveValue('Lovelace');
    expect(screen.getByLabelText('Email:')).toHaveValue('ada@example.com');
  });

  test('cancel reverts: edited value discarded, no PATCH sent, re-entering edit restores original', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: originalUser }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const firstNameInput = screen.getByLabelText('First name:');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Grace');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount /me only, no PATCH

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('First name:')).toHaveValue('Ada');
  });

  test('validation guard: clearing a required field on Save shows error, stays in edit mode, no PATCH sent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: originalUser }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Email:'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('All fields are required')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('save success: PATCH with credentials/json body, view mode shows updated values', async () => {
    const updatedUser = { first_name: 'Grace', last_name: 'Hopper', email: 'grace@example.com' };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: originalUser }))
      .mockResolvedValueOnce(jsonResponse({ user: updatedUser }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('First name:'));
    await user.type(screen.getByLabelText('First name:'), 'Grace');
    await user.clear(screen.getByLabelText('Last name:'));
    await user.type(screen.getByLabelText('Last name:'), 'Hopper');
    await user.clear(screen.getByLabelText('Email:'));
    await user.type(screen.getByLabelText('Email:'), 'grace@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Grace');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('http://localhost:8080/me');
    expect(options.method).toBe('PATCH');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    expect(JSON.parse(options.body)).toEqual({
      first_name: 'Grace',
      last_name: 'Hopper',
      email: 'grace@example.com',
    });

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText('Hopper')).toBeInTheDocument();
    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
  });

  test('save failure (not-ok): error renders, stays in edit mode', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: originalUser }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Failed to update profile')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
  });

  test('save rejection: error renders, stays in edit mode, console.error called', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: originalUser }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Failed to update profile')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('error clears on retry after a successful save', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: originalUser }))
      .mockResolvedValueOnce(jsonResponse({ user: originalUser }));
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Email:'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('All fields are required')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email:'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.queryByText('All fields are required')).not.toBeInTheDocument();
  });

  test('log out, happy path: POST to logout, authchange fires, lands on /login sentinel', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: originalUser }))
      .mockResolvedValueOnce(jsonResponse({}));
    const authchangeListener = jest.fn();
    window.addEventListener('authchange', authchangeListener);
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Log Out' }));

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
    expect(authchangeListener).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('http://localhost:8080/logout');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');

    window.removeEventListener('authchange', authchangeListener);
  });

  test('log out, fetch rejects: finally block still fires authchange and navigates to /login', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: originalUser }))
      .mockRejectedValueOnce(new Error('network down'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const authchangeListener = jest.fn();
    window.addEventListener('authchange', authchangeListener);
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('button', { name: 'Log Out' }));

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
    expect(authchangeListener).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    window.removeEventListener('authchange', authchangeListener);
    errorSpy.mockRestore();
  });
});

/**
 * Signup.jsx's `passwordRequirements` object only computes a `length` key;
 * the JSX also reads `lowercase`, `uppercase`, `number`, and `special` keys
 * that are never defined on that object, so those four checklist rows
 * render as permanently unmet (undefined is falsy) regardless of the
 * typed password. The `length` check itself uses a lower bound of 1
 * character, not the 8 advertised in its own label. This suite asserts
 * that CURRENT behavior deliberately -- it documents the bug, it does not
 * fix it. A future reader should not "correct" these assertions without
 * first fixing the component's `passwordRequirements` computation.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Signup from './Signup';
import { renderAtRoute, installFetchMock, jsonResponse, notOkResponse } from '../test-utils';

function setup() {
  return renderAtRoute(<Signup />, {
    route: '/sign-up',
    path: '/sign-up',
    sentinels: ['/'],
  });
}

async function fillValidForm(user) {
  await user.type(screen.getByLabelText('First name'), 'Ada');
  await user.type(screen.getByLabelText('Last name'), 'Lovelace');
  await user.type(screen.getByLabelText('Email:'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password:'), 'Passw0rd!');
  await user.type(screen.getByLabelText('Repeat Confirmation:'), 'Passw0rd!');
}

describe('Signup', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('all five fields round-trip typed values', async () => {
    const user = userEvent.setup();
    setup();

    await fillValidForm(user);

    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Last name')).toHaveValue('Lovelace');
    expect(screen.getByLabelText('Email:')).toHaveValue('ada@example.com');
    expect(screen.getByLabelText('Password:')).toHaveValue('Passw0rd!');
    expect(screen.getByLabelText('Repeat Confirmation:')).toHaveValue('Passw0rd!');
  });

  test('mismatch guard: differing passwords perform no fetch and do not navigate', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText('Password:'), 'Passw0rd!');
    await user.type(screen.getByLabelText('Repeat Confirmation:'), 'Different1!');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('navigated:/')).not.toBeInTheDocument();
  });

  test('matching passwords: fires one POST request with JSON header and no credentials property', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));
    const user = userEvent.setup();
    setup();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await screen.findByText('navigated:/');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8080/signup');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    // Signup deliberately omits credentials (unlike Login) -- assert the
    // property is entirely absent, not merely falsy.
    expect(options).not.toHaveProperty('credentials');
  });

  // Known gap, not a guard: with every field empty, password and
  // password_confirmation are both "" and therefore trivially equal, so
  // the mismatch guard passes and a request IS sent. There is no
  // required-field validation on this form. Asserted as current behavior.
  test('empty-form quirk: an entirely empty form still submits a request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: {} }));
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('success: response ok navigates to /', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { first_name: 'Ada' } }));
    const user = userEvent.setup();
    setup();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByText('navigated:/')).toBeInTheDocument();
  });

  test('failure (not-ok): all fields reset, console.error called, no navigation', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(notOkResponse(400));
    const user = userEvent.setup();
    setup();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByLabelText('First name')).toHaveValue('');
    expect(screen.getByLabelText('Last name')).toHaveValue('');
    expect(screen.getByLabelText('Email:')).toHaveValue('');
    expect(screen.getByLabelText('Password:')).toHaveValue('');
    expect(screen.getByLabelText('Repeat Confirmation:')).toHaveValue('');
    expect(errorSpy).toHaveBeenCalled();
    expect(screen.queryByText('navigated:/')).not.toBeInTheDocument();

    errorSpy.mockRestore();
  });

  test('network rejection: console.error called, no navigation, fields not reset', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await screen.findByLabelText('First name');
    expect(errorSpy).toHaveBeenCalled();
    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
    expect(screen.getByLabelText('Password:')).toHaveValue('Passw0rd!');
    expect(screen.queryByText('navigated:/')).not.toBeInTheDocument();

    errorSpy.mockRestore();
  });

  test('focus-gated checklist: absent, then visible on focus, then stays visible after focus moves', async () => {
    const user = userEvent.setup();
    setup();

    expect(screen.queryByText('Password requirements:')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Password:'));
    expect(screen.getByText('Password requirements:')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Repeat Confirmation:'));
    // No onBlur handler exists on the password field, so the checklist
    // remains visible even though focus has moved elsewhere.
    expect(screen.getByText('Password requirements:')).toBeInTheDocument();
  });

  test('known-bug: empty password -> first row unmet', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByLabelText('Password:'));

    const rows = within(screen.getByText('Password requirements:').closest('div')).getAllByRole(
      'listitem'
    );
    expect(rows[0].textContent.startsWith('✗')).toBe(true);
  });

  test('known-bug: a single character flips the length row to met (advertised bound is 8, implemented bound is 1)', async () => {
    const user = userEvent.setup();
    setup();

    const passwordInput = screen.getByLabelText('Password:');
    await user.click(passwordInput);
    await user.type(passwordInput, 'a');

    const rows = within(screen.getByText('Password requirements:').closest('div')).getAllByRole(
      'listitem'
    );
    expect(rows[0].textContent.startsWith('✓')).toBe(true);
  });

  test('known-bug: a password satisfying every advertised rule still leaves the other four rows unmet', async () => {
    const user = userEvent.setup();
    setup();

    const passwordInput = screen.getByLabelText('Password:');
    await user.click(passwordInput);
    await user.type(passwordInput, 'Passw0rd!');

    const rows = within(screen.getByText('Password requirements:').closest('div')).getAllByRole(
      'listitem'
    );
    expect(rows[0].textContent.startsWith('✓')).toBe(true);
    expect(rows[1].textContent.startsWith('✗')).toBe(true);
    expect(rows[2].textContent.startsWith('✗')).toBe(true);
    expect(rows[3].textContent.startsWith('✗')).toBe(true);
    expect(rows[4].textContent.startsWith('✗')).toBe(true);
  });

  test('known-bug: a password longer than 24 characters flips the length row back to unmet', async () => {
    const user = userEvent.setup();
    setup();

    const passwordInput = screen.getByLabelText('Password:');
    await user.click(passwordInput);
    await user.type(passwordInput, 'a'.repeat(25));

    const rows = within(screen.getByText('Password requirements:').closest('div')).getAllByRole(
      'listitem'
    );
    expect(rows[0].textContent.startsWith('✗')).toBe(true);
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../components/SettingsPage';
import { renderAtRoute, installFetchMock, jsonResponse, notOkResponse, deferred } from '../test-utils';

const defaultSettings = { balance_threshold: 100000, show_decimals: true };

function setup() {
  return renderAtRoute(<SettingsPage />, {
    route: '/settings',
    path: '/settings',
    sentinels: ['/login'],
  });
}

describe('SettingsPage', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('loading: renders the shared Loading... card and nothing else while GET /settings is pending', () => {
    const { promise } = deferred();
    fetchMock.mockReturnValueOnce(promise);

    setup();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
  });

  test('GET /settings returns 401: navigates to /login', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(401));

    setup();

    expect(await screen.findByText('navigated:/login')).toBeInTheDocument();
  });

  test('GET /settings not-ok (non-401): renders a load error and no form', async () => {
    fetchMock.mockResolvedValueOnce(notOkResponse(500));

    setup();

    expect(await screen.findByText('Failed to load settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
  });

  test('GET /settings rejects: renders a load error and no form', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    setup();

    expect(await screen.findByText('Failed to load settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('GET /settings ok for a fresh user: the number input holds 100000 and the checkbox is checked', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }));

    setup();

    expect(await screen.findByLabelText('Balance threshold:')).toHaveValue(100000);
    expect(screen.getByLabelText('Show decimals:')).toBeChecked();
  });

  test('editing both fields and submitting sends exactly one PUT with method, credentials, headers and a numeric body', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Settings updated successfully' }));
    const user = userEvent.setup();
    setup();

    const thresholdInput = await screen.findByLabelText('Balance threshold:');
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '250000');
    await user.click(screen.getByLabelText('Show decimals:'));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    await screen.findByText('Settings saved.');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('http://localhost:8080/settings');
    expect(options.method).toBe('PUT');
    expect(options.credentials).toBe('include');
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }));
    const body = JSON.parse(options.body);
    expect(body).toEqual({ balance_threshold: 250000, show_decimals: false });
    expect(typeof body.balance_threshold).toBe('number');
  });

  test('submitting a blank threshold shows a client-side error and issues no PUT', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }));
    const user = userEvent.setup();
    setup();

    const thresholdInput = await screen.findByLabelText('Balance threshold:');
    await user.clear(thresholdInput);
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Balance threshold must be a positive number')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('submitting a zero threshold shows a client-side error and issues no PUT', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }));
    const user = userEvent.setup();
    setup();

    const thresholdInput = await screen.findByLabelText('Balance threshold:');
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '0');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Balance threshold must be a positive number')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('submitting a negative threshold shows a client-side error and issues no PUT', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }));
    const user = userEvent.setup();
    setup();

    const thresholdInput = await screen.findByLabelText('Balance threshold:');
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '-5');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Balance threshold must be a positive number')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('PUT not-ok: shows a save error and the form keeps the edited values', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }))
      .mockResolvedValueOnce(notOkResponse(500));
    const user = userEvent.setup();
    setup();

    const thresholdInput = await screen.findByLabelText('Balance threshold:');
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '250000');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Failed to save settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Balance threshold:')).toHaveValue(250000);
  });

  test('PUT rejects: shows a save error and the form keeps the edited values', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }))
      .mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    setup();

    const thresholdInput = await screen.findByLabelText('Balance threshold:');
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '250000');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Failed to save settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Balance threshold:')).toHaveValue(250000);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test('PUT ok: shows a saved confirmation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ settings: defaultSettings }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Settings updated successfully' }));
    const user = userEvent.setup();
    setup();

    await screen.findByLabelText('Balance threshold:');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
  });
});

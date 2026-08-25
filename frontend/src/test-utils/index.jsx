import { render, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * Renders `ui` inside a MemoryRouter seeded with `initialEntries: [route]`.
 * For components that only contain NavLinks and don't need a full Route tree.
 */
export function renderWithRouter(ui, { route = '/' } = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
  });
}

/**
 * Renders `ui` as the element of a Route at `path` inside a MemoryRouter
 * seeded at `route`, plus one sentinel Route per entry in `sentinels`.
 * Each sentinel route renders a div whose only child is the text
 * `navigated:${sentinelPath}` -- this is how navigation is asserted without
 * ever mocking react-router-dom.
 */
export function renderAtRoute(ui, { route, path, sentinels = [] } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
        {sentinels.map((sentinelPath) => (
          <Route
            key={sentinelPath}
            path={sentinelPath}
            element={<div>{`navigated:${sentinelPath}`}</div>}
          />
        ))}
      </Routes>
    </MemoryRouter>
  );
}

/** Installs a fresh jest.fn() as global.fetch and returns it. */
export function installFetchMock() {
  const fetchMock = jest.fn();
  global.fetch = fetchMock;
  return fetchMock;
}

/** Returns an object shaped like a successful fetch Response. */
export function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

/** Returns an object shaped like a failed fetch Response. */
export function notOkResponse(status = 401, data = {}) {
  return {
    ok: false,
    status,
    json: async () => data,
  };
}

/** Returns a controllable promise plus its resolve/reject callbacks. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Dispatches a real `authchange` window event and flushes the resulting
 * state updates inside `act`.
 */
export async function dispatchAuthChange() {
  await act(async () => {
    window.dispatchEvent(new Event('authchange'));
  });
}

/** Shared de-DE/EUR formatter so suites never hardcode NBSP literals. */
export const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

/**
 * RTL's default text-matcher normalizer collapses whitespace runs
 * (including U+00A0 NBSP, which JS classifies as \s) down to a single
 * regular space in the DOM's actual text -- but does NOT apply that same
 * normalization to the string passed in as the matcher. EUR.format()
 * output contains a real NBSP before the currency symbol, so a raw
 * `screen.getByText(EUR.format(x))` call will never match. Suites should
 * wrap the expected string in this helper before matching against it.
 */
export function normalizeSpace(str) {
  return str.replace(/\s+/g, ' ');
}

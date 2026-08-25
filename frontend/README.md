## Testing

Tests are written with Jest + React Testing Library. Components live in `src/components/`; their `*.test.jsx` suites live separately in `src/tests/`, one file per component.

**Run all tests:**

```bash
npm test
```

**Run a single component's suite** (matches on filename, case-insensitive):

```bash
npm test -- Navbar
```

This runs any test file whose path matches `Navbar`, e.g. `src/tests/Navbar.test.jsx`. You can also point directly at a file:

```bash
npm test -- src/tests/Navbar.test.jsx
```

**Run a single test case by name** (matches on the test's description, across all files):

```bash
npm test -- -t "authchange re-fetch flips Log In to Profile"
```

Combine both to scope to one file *and* one test:

```bash
npm test -- Navbar -t "theme toggle"
```

**Watch mode** (re-runs affected tests as you edit):

```bash
npm run test:watch
```

> Note the `--` before any arguments — npm needs it to pass flags/patterns through to the underlying `jest` command instead of interpreting them itself.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

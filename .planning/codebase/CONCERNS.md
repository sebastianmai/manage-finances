# Codebase Concerns

**Analysis Date:** 2026-08-25

## Tech Debt

### Session Validation Bug

**Issue:** Logic error in session retrieval that can silently fail
- **Files:** `backend/repository/repository.go` (lines 145-161)
- **Impact:** `GetSingleUser()` checks `if row != nil` where `row` is an error from `Scan()`. This means when a scan error occurs, the function returns `nil` silently instead of propagating the error. Valid queries will work, but any database errors are swallowed.
- **Fix approach:** Change the error handling to properly check `if row != nil { return nil, row }` to surface database errors, or refactor to return an error value.

### Missing Session Expiration Validation

**Issue:** Expired sessions are not checked when retrieving users
- **Files:** `backend/services/services.go` (lines 84-108)
- **Impact:** The `GetUserBySession()` function retrieves all sessions and checks if they match the session ID, but never validates if `expiresAt` is before the current time. This means expired sessions will be treated as valid, allowing unauthorized access.
- **Fix approach:** Add a check `if expiresAt.Before(time.Now()) { continue }` before returning the user to validate session hasn't expired.

### Inefficient Database Queries

**Issue:** Full table scans instead of WHERE clauses
- **Files:** `backend/services/services.go` (lines 39-69, 84-108), `backend/repository/repository.go` (lines 132-142, 188-197)
- **Impact:** Login requires fetching all users from the database and iterating through them. Session lookup requires fetching all sessions. This is O(n) and will become a serious performance problem as user/session count grows. Database transactions increase with every login.
- **Fix approach:** Add WHERE clauses to repository methods:
  - `GetAllUsers()` → `GetUserByEmail(email string)` with `WHERE email = $1`
  - `GetAllSessions()` → `GetSessionByID(sessionID string)` with `WHERE session_id = $1`

### Missing Database Indexes

**Issue:** No indexes on frequently queried columns
- **Files:** `backend/migrations/001_create_users.sql`, `backend/migrations/002_create_session.sql`
- **Impact:** Without indexes on `users.email` and `sessions.session_id`, every login and session validation performs a full table scan.
- **Fix approach:** Add migration to create indexes:
  ```sql
  CREATE INDEX idx_users_email ON users(email);
  CREATE INDEX idx_sessions_session_id ON sessions(session_id);
  CREATE INDEX idx_sessions_uuid ON sessions(uuid);
  ```

### Variable Shadowing Bug

**Issue:** `sessionID` declared twice in same scope
- **Files:** `backend/handlers/handlers.go` (lines 129, 133)
- **Impact:** The variable `sessionID` is declared on line 129, then redeclared on line 133 with `:=`. This shadows the original variable. The returned `sessionID` from `CreateSession()` may differ from the original UUID, causing potential inconsistencies.
- **Fix approach:** Use single assignment: change line 133 to `returnedSessionID, err := h.services.CreateSession(...)`

## Known Bugs

### Form Submit Not Wired Correctly

**Issue:** Signup form button doesn't trigger form submission
- **Files:** `frontend/src/components/Signup.jsx` (line 215)
- **Impact:** The signup button is rendered outside the form context and has no `onClick` handler. While it's styled as a submit button, it doesn't actually submit the form. Users can fill out the form but clicking "Sign Up" does nothing. The form has `onSubmit={handleSubmit}` on line 82, but it's never triggered.
- **Fix approach:** Add `onClick={handleSubmit}` to the button on line 215, or move it inside the form and make it a proper type="submit" button.

### Login Form Title Mismatch

**Issue:** Login page displays wrong heading
- **Files:** `frontend/src/components/Login.jsx` (line 64)
- **Impact:** The heading says "Sign Up" when it should say "Log In", confusing users on the login page.
- **Fix approach:** Change line 64 from `<h1 className="text-2xl text-ui-text font-bold mb-4">Sign Up</h1>` to `<h1 className="text-2xl text-ui-text font-bold mb-4">Log In</h1>`

### Password Requirements Display Mismatch

**Issue:** UI shows 5 password requirements but code only validates 1
- **Files:** `frontend/src/components/Signup.jsx` (lines 25-35, 139-196)
- **Impact:** The commented requirements object (lines 25-31) shows proper password rules (8-24 chars, uppercase, lowercase, number, special). But the active requirements object (lines 33-35) only checks `length >= 1`. The UI displays all 5 validation indicators, but 4 of them reference undefined properties (`passwordRequirements.lowercase`, etc.) which will always be `undefined` and show as failed. This is misleading to users.
- **Fix approach:** Either implement the full password requirements or remove the unused validation indicators from the UI. The current state suggests development work was incomplete.

### Empty ProfilePage Component

**Issue:** ProfilePage component has no implementation
- **Files:** `frontend/src/components/ProfilePage.jsx`
- **Impact:** The component is empty - just declares an empty export. This component is not used in routes yet, but if added to routing in `App.jsx`, it would render nothing.
- **Fix approach:** Either implement the profile page functionality or remove the unused file.

## Security Considerations

### Database Credentials Exposed in Logs

**Issue:** Database connection string printed to stdout
- **Files:** `backend/repository/repository.go` (line 69)
- **Impact:** The DSN string (`fmt.Print(dsn)`) includes the database password in plain text printed to server logs. This is a critical security issue in production where logs might be collected or stored.
- **Fix approach:** Remove the `fmt.Print(dsn)` line. If debugging is needed, log only non-sensitive parts like host and port.

### Sensitive Error Details Returned to Client

**Issue:** Error messages expose internal implementation details
- **Files:** `backend/handlers/handlers.go` (lines 85-88, 117-121, 135-139)
- **Impact:** Error responses include raw error messages like `"test": err.Error()` on line 119. These can leak information about database structure, connection issues, or other implementation details to potential attackers.
- **Fix approach:** Return generic error messages to clients ("Invalid email or password") and log detailed errors server-side only.

### Hard-Coded CORS Origin

**Issue:** CORS restricted to localhost only
- **Files:** `backend/handlers/handlers.go` (line 40)
- **Impact:** CORS is hard-coded to `http://localhost:5173`, which won't work in any environment other than local development. For production, this needs to be configurable via environment variables, but currently there's no way to support multiple deployments.
- **Fix approach:** Load allowed origins from environment configuration:
  ```go
  allowedOrigins := []string{os.Getenv("ALLOWED_ORIGINS")}
  corsHandler := handlers.CORS(
      handlers.AllowedOrigins(allowedOrigins),
      ...
  )
  ```

### Insecure Cookie Configuration

**Issue:** Session cookies marked as insecure in dev but no production configuration
- **Files:** `backend/handlers/handlers.go` (lines 142-150)
- **Impact:** The `Secure: false` flag (line 147) is commented as "only in local http dev", but there's no mechanism to set `Secure: true` in production. This means in production, the session cookie could be transmitted over HTTP if not enforced at deployment level.
- **Fix approach:** Make the Secure flag environment-dependent:
  ```go
  secure := os.Getenv("ENVIRONMENT") == "production"
  http.SetCookie(w, &http.Cookie{
      ...
      Secure: secure,
      ...
  })
  ```

### No CSRF Protection

**Issue:** No CSRF tokens or validation implemented
- **Files:** `backend/handlers/handlers.go`, `frontend/src/components/Login.jsx`, `frontend/src/components/Signup.jsx`
- **Impact:** POST/PUT requests have no CSRF protection. A malicious website could perform actions on behalf of authenticated users.
- **Fix approach:** Implement CSRF token validation middleware in the backend and include tokens in all state-changing requests.

### No Rate Limiting

**Issue:** No brute force protection on authentication endpoints
- **Files:** `backend/handlers/handlers.go` (lines 49-94, 96-165)
- **Impact:** The `/signup` and `/login` endpoints have no rate limiting. An attacker can attempt unlimited login tries or create unlimited accounts.
- **Fix approach:** Implement rate limiting middleware that tracks failed attempts per IP/email and temporarily blocks after N failures.

### No Input Sanitization

**Issue:** User inputs not sanitized before database storage
- **Files:** `backend/handlers/handlers.go` (lines 49-94), `backend/repository/repository.go` (lines 101-117)
- **Impact:** While SQL injection is prevented via parameterized queries, other injection attacks (XSS if data is displayed, etc.) are possible. No string length enforcement on frontend means backend could receive extremely long strings.
- **Fix approach:** Add input validation/sanitization:
  - Validate email format with a regex or email parser
  - Enforce maximum lengths on first_name (50), last_name (50)
  - Trim whitespace from all inputs

## Performance Bottlenecks

### N+1 Query Pattern in Session Validation

**Issue:** Separate queries for session lookup and user fetch
- **Files:** `backend/services/services.go` (lines 84-108)
- **Impact:** For each session check, the code:
  1. Fetches all sessions (potentially thousands)
  2. For each session, if it matches, fetches the single user
  This could be a single query with a JOIN: `SELECT u.* FROM users u JOIN sessions s ON u.uuid = s.uuid WHERE s.session_id = $1`
- **Fix approach:** Add a repository method: `GetUserBySessionID(sessionID string)` that uses a JOIN query.

### Login Performance Requires Full User Table Scan

**Issue:** Every login fetches and iterates through all users
- **Files:** `backend/services/services.go` (lines 39-69)
- **Impact:** With 1,000 users, a login attempt means fetching and scanning 1,000 rows. With 100,000 users, this becomes a major bottleneck.
- **Fix approach:** Add index on `users.email` and replace `GetAllUsers()` with `GetUserByEmail(email)` that returns a single row.

## Fragile Areas

### Auth Flow Has Multiple Failure Modes

**Issue:** Session and user lookup logic is fragile
- **Files:** `backend/handlers/handlers.go` (lines 167-189), `backend/services/services.go` (lines 84-108)
- **Why fragile:** 
  - Session expiration not validated, so expired sessions grant access
  - `GetSingleUser()` error handling is broken (silently returns nil)
  - Login form not properly connected to submission (frontend)
  - No validation that returned user is not nil before using it
- **Safe modification:** Add comprehensive tests for:
  - Expired sessions should be rejected
  - Deleted users should not be accessible via old sessions
  - Empty form submission should show error
  - Database errors should be surfaced, not hidden

### Frontend Form Handling

**Issue:** Form submission wiring is incomplete
- **Files:** `frontend/src/components/Signup.jsx`, `frontend/src/components/Login.jsx`
- **Why fragile:** Buttons exist but don't call handlers. Form elements are wired but form never actually submits. Users won't understand why clicking submit doesn't work.
- **Safe modification:** 
  - Ensure all buttons have proper `onClick` or `type="submit"` attributes
  - Test form submission in browser before deployment
  - Add visual feedback for form errors

## Test Coverage Gaps

### No Tests for Session Expiration

**Issue:** Session expiration logic not tested
- **Files:** `backend/services/services.go` (lines 84-108)
- **What's not tested:** Whether expired sessions are correctly rejected
- **Risk:** Expired sessions could grant unauthorized access unnoticed
- **Priority:** High

### No Tests for Error Handling

**Issue:** Error paths in database layer not exercised
- **Files:** `backend/repository/repository.go`
- **What's not tested:** Database connection failures, query errors, scan errors
- **Risk:** Silent failures in `GetSingleUser()` and other methods could hide database issues
- **Priority:** High

### No Integration Tests for Auth Flow

**Issue:** No end-to-end tests for signup/login/session
- **Files:** All `backend/handlers`, `backend/services`, `backend/repository`
- **What's not tested:** Complete auth flow (signup → login → validate session → access protected resource)
- **Risk:** Auth bugs like the session expiration issue are not caught before production
- **Priority:** High

### No Frontend Form Submission Tests

**Issue:** Form handling not tested in frontend
- **Files:** `frontend/src/components/Signup.jsx`, `frontend/src/components/Login.jsx`
- **What's not tested:** Form submission, error handling, success redirect
- **Risk:** Users can't sign up or log in if form wiring breaks
- **Priority:** Critical

## Missing Critical Features

### No Password Reset Flow

**Issue:** No way for users to reset forgotten passwords
- **Problem:** Once a user forgets their password, they cannot recover their account
- **Blocks:** User onboarding and account recovery workflows

### No Email Verification

**Issue:** Email addresses not validated as belonging to user
- **Problem:** Users could sign up with anyone's email address without verification
- **Blocks:** Account security and communication with correct user

### No Logout Functionality

**Issue:** Users cannot log out (no endpoint or mechanism)
- **Problem:** No way to terminate user sessions. Sessions just expire after 24 hours.
- **Blocks:** Security and session management

### No Session Management in UI

**Issue:** Profile page is empty, no user settings or session management
- **Files:** `frontend/src/components/ProfilePage.jsx`, `frontend/src/components/Profile.jsx`
- **Problem:** Users can't see their profile or manage sessions
- **Blocks:** User profile functionality

### Transactions Table Created But Unused

**Issue:** Database table exists but no endpoints or UI
- **Files:** `backend/migrations/003_transactions.sql`
- **Problem:** Core feature (transactions) is not implemented in handlers or services
- **Blocks:** Main feature of the "manage-finances" application

---

*Concerns audit: 2026-08-25*

# Manage Finances Implementation Plan

## Goal

Build session-based authentication backed by Postgres, then use that foundation for the finance app.

The current state is:

- Frontend has login and signup screens, but they are static.
- Backend is only a placeholder HTTP server.
- Postgres exists in `docker-compose.yml`, but it is not used by the app yet.

## Planned Work

### 1. Backend Foundation

This is the first thing to implement because every auth feature depends on it.

What needs to exist:

- Go backend config loaded from environment variables.
- A real Postgres connection.
- Database schema for users and sessions.
- Password hashing for stored credentials.
- A clean place to put future auth and finance routes.

Concrete substeps:

1. Add a DB config layer.
   - Read host, port, user, password, db name, and ssl mode from env vars.
   - Fail fast if required values are missing.

2. Create the database schema.
   - `users` table with username, password hash, created timestamp, and updated timestamp.
   - `sessions` table with session id, user id, expiry, revoked flag or revoked timestamp, and created timestamp.

3. Add DB startup and health behavior.
   - Open the Postgres connection when the backend starts.
   - Ping the database before accepting requests.
   - Return a simple health endpoint for local verification.

4. Add password utilities.
   - Hash passwords before insert.
   - Compare candidate passwords safely during login.

5. Prepare the backend for auth routes.
   - Create a router or handler structure that can grow beyond the current single `main.go` file.
   - Keep auth logic separate from transport logic.

6. Make the backend Docker and Compose friendly.
   - Use the existing `docker-compose.yml` database service.
   - Ensure the backend can read local dev env vars cleanly.

### 2. Auth API

- `POST /api/signup`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

### 3. Session Middleware

- Read the session cookie.
- Look up the session in Postgres.
- Reject expired or revoked sessions.
- Attach the user to the request context.

### 4. Frontend Auth Wiring

- Make login and signup forms controlled.
- Submit to the backend.
- Show loading and error states.
- Redirect after success.

### 5. Session-Aware App Shell

- Check session on app startup.
- Guard protected routes.
- Add logout in the navbar.

### 6. Finance Domain Follow-Up

- Add accounts.
- Add transactions.
- Add categories.
- Add summaries and reporting.

## What Item 1 Means In Practice

If you want to start with only one thing, start here:

- Make the backend connect to Postgres.
- Create the user and session tables.
- Add password hashing helpers.
- Refactor `main.go` so it no longer behaves like a placeholder server.

Once that is done, login and signup can be built on top of a stable base.

# manage-finances

## What This Is

A personal finance tracker — single-user for now — built with a Go/Gorilla-Mux backend, a React/Vite frontend, and PostgreSQL for storage. Users sign up, log in, and (once transaction tracking is built out) will track their personal spending. Right now the app has working auth and session handling; the next slice of work is a real user profile page.

## Core Value

A logged-in user can see and manage their own account (profile) reliably — this is the foundation everything else (transaction tracking, budgets) builds on.

## Requirements

### Validated

- ✓ User can sign up with email/password — existing (`POST /signup`)
- ✓ User can log in and get a session cookie — existing (`PUT /login`)
- ✓ Session persists via HTTP-only cookie; frontend can fetch current user via `GET /me` — existing
- ✓ Navbar shows logged-in vs logged-out state — existing

### Active

- [ ] User can open a dedicated profile page showing their account info (name/email) via `/me`
- [ ] User can edit their name/email from the profile page
- [ ] User can log out from the profile page
- [ ] Backend supports updating user info (new endpoint — none exists today)
- [ ] Backend supports logout (session deletion — no endpoint exists today; sessions currently only expire after 24h)

### Out of Scope

- Transaction/spending tracking — the `003_transactions.sql` migration is scaffolding only; no requirements gathered yet for this, deferred to a future milestone
- Multi-user / shared household accounts — single-user for now, per user
- Password change / account deletion from profile page — not requested, can be added later
- Avatar upload — existing Profile.jsx icon is static; no upload flow requested

## Context

- Existing codebase mapped in `.planning/codebase/*.md` (ARCHITECTURE.md, STACK.md, etc.) — reuse rather than re-discover.
- `frontend/src/components/Profile.jsx` is NOT the profile page — it's the small navbar avatar button (currently just `console.log`s on click).
- `frontend/src/components/ProfilePage.jsx` exists as an empty stub — this is the actual target for the new profile page, not yet wired into any route in `App.jsx`.
- `frontend/src/components/Navbar.jsx` has a pre-existing uncommitted local diff (minor flex-wrapper layout fix around the avatar/theme buttons) — cosmetic, unrelated to profile page wiring; leave it alone unless it conflicts.
- Backend routes today: `POST /signup`, `PUT /login`, `GET /me` only (`backend/main.go`). No update-user or logout endpoint exists.
- Sessions currently have no explicit logout/delete path — they just expire after 24h (`backend/services/services.go`).
- Known backend anti-patterns from ARCHITECTURE.md worth avoiding when adding new endpoints: N+1 queries (fetch-all-then-loop instead of `WHERE` clauses), inline request structs, minimal input validation. New endpoints should use parameterized single-row queries and validate input.

## Constraints

- **Tech stack**: Go + Gorilla Mux backend, React 19 + Vite frontend, PostgreSQL 16 via Goose migrations — must fit this existing stack, no new frameworks
- **Auth model**: Session-cookie based (HTTP-only, `session_id`) — new endpoints (update user, logout) must follow this existing pattern, not introduce JWTs or a different auth scheme

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Profile page includes edit + logout, not just view | User wants full profile management, not a read-only page | — Pending |
| Transaction tracking explicitly out of scope for this milestone | Not yet discussed/scoped; the migration is just scaffolding | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-25 after initialization*

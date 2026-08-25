# External Integrations

**Analysis Date:** 2026-08-25

## APIs & External Services

**Currently None Deployed:**
- All API endpoints are internal and locally scoped
- Frontend hardcodes backend URL as `http://localhost:8080` (`frontend/src/components/Login.jsx`, `frontend/src/components/Signup.jsx`)
- VITE_API_URL environment variable defined in `docker-compose.yml` but not yet utilized in frontend code

## Data Storage

**Databases:**
- PostgreSQL 16 (Alpine container)
  - Connection: Environment variables in `.env`
    - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  - Client: github.com/lib/pq (PostgreSQL driver)
  - Singleton connection in `backend/repository/repository.go` using `sql.DB`

**File Storage:**
- Local filesystem only - No file storage integration

**Caching:**
- None configured - No Redis, Memcached, or similar

## Authentication & Identity

**Auth Provider:**
- Custom session-based authentication
  - Implementation: Cookie-based sessions with HTTP-only secure flag
  - Session tracking: `sessions` table in PostgreSQL
  - Password storage: bcrypt hashing via `golang.org/x/crypto` package
  - Session creation/validation in `backend/handlers/handlers.go` (LoginUser, GetUser)

**Session Flow:**
1. User provides email/password via `/login` endpoint
2. Password verified against bcrypt hash
3. Session created in database with UUID and expiration (24-hour TTL)
4. Cookie set with `session_id` (HTTP-only, SameSite=Lax, Secure=false for local dev)
5. Session validated on `/me` endpoint to retrieve user info

**User Model:**
- `users` table: uuid (PK), first_name, last_name, email (unique), password_hash, created_at
- `sessions` table: session_id (PK), uuid (FK to users), created_at, expires_at

## Monitoring & Observability

**Error Tracking:**
- None - No Sentry, Rollbar, or similar configured

**Logs:**
- Standard Go logging via `log` package
- Frontend: `console` logging only
- Log output examples: connection status, user creation errors

## CI/CD & Deployment

**Hosting:**
- Docker & Docker Compose (local development setup defined)
- No cloud platform integration (AWS, GCP, Heroku, etc.)

**CI Pipeline:**
- None - No GitHub Actions, GitLab CI, or similar configured

**Containers:**
- Frontend: `node:20-alpine` running `npm run dev`
- Backend: `golang:1.25` running `go run .`
- Database: `postgres:16-alpine`
- Admin UI: `dpage/pgadmin4` for database management

**Container Network:**
- Docker bridge network connecting all services
- Frontend accessible on port 5173
- Backend accessible on port 8080
- Database accessible on port 5432 (internal only, exposed via docker-compose)
- pgAdmin accessible on port 8090

## Environment Configuration

**Required env vars (Backend):**
- `DB_HOST` - Database hostname (default in docker-compose: 'database')
- `DB_PORT` - Database port (default: 5432)
- `DB_USER` - Database user (default in docker-compose: postgres)
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name (default in docker-compose: manage_finances)
- `PORT` - Server port (default: 8080)

**Frontend env vars:**
- `VITE_API_URL` - Backend API base URL (set in docker-compose to `http://localhost:8080`)

**Secrets location:**
- `.env` file in backend directory (not committed to git)
- Environment set via `docker-compose.yml` for containerized environment
- Database credentials passed as environment variables

## CORS Configuration

**Allowed Origins:**
- `http://localhost:5173` (frontend dev server)

**Allowed Methods:**
- GET, POST, PUT, DELETE, OPTIONS

**Allowed Headers:**
- Content-Type, Authorization

**Credentials:**
- Enabled (required for cookie-based sessions)

Implementation: `backend/handlers/handlers.go` (NewRouter function using Gorilla CORS middleware)

## Webhooks & Callbacks

**Incoming:**
- None - No webhook endpoints defined

**Outgoing:**
- None - No outbound webhook calls or external event notifications

## Database Migrations

**Tool:** Goose (database migration framework)
**Status:** Migrations defined in `backend/migrations/` with goose markers
**Commands:** Available via `backend/Makefile`
- `make migrate-up` - Apply pending migrations
- `make migrate-down` - Revert last migration
- `make migrate-reset` - Full reset
- `make migrate-status` - Check migration status

---

*Integration audit: 2026-08-25*

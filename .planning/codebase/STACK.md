# Technology Stack

**Analysis Date:** 2026-08-25

## Languages

**Primary:**
- JavaScript (React) - Frontend UI components and logic
- Go 1.25.0 - Backend API and business logic
- SQL - Database queries and migrations

**Secondary:**
- CSS - Styling via TailwindCSS

## Runtime

**Environment:**
- Node.js 20 (Alpine) - Frontend development and builds
- Go 1.25 - Backend runtime
- PostgreSQL 16 (Alpine) - Database runtime

**Package Manager:**
- npm - Node.js package management
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19.2.8 - Frontend UI framework (`frontend/src/`)
- Gorilla Mux 1.8.1 - Backend HTTP router (`backend/handlers/handlers.go`)
- Gorilla Handlers 1.5.2 - CORS middleware and HTTP utilities

**Routing & Navigation:**
- React Router DOM 7.18.2 - Client-side routing (`frontend/src/App.jsx`)

**UI & Styling:**
- TailwindCSS 4.3.3 - Utility-first CSS framework (`frontend/`)
- @tailwindcss/vite 4.3.3 - Vite plugin for TailwindCSS
- @headlessui/react 2.2.10 - Unstyled UI components
- @heroicons/react 2.2.0 - Icon library
- @fortawesome/react-fontawesome 3.5.0 - FontAwesome icons

**Build & Development:**
- Vite 8.2.0 - Frontend build tool and dev server (`frontend/vite.config.js`)
- @vitejs/plugin-react 6.0.4 - Vite plugin for React

**Testing:**
- No test framework installed

## Key Dependencies

**Critical:**
- golang.org/x/crypto v0.55.0 - Password hashing and security primitives (`backend/handlers/handlers.go` uses bcrypt)
- github.com/lib/pq v1.12.3 - PostgreSQL database driver (`backend/repository/repository.go`)
- github.com/google/uuid v1.6.0 - UUID generation for users and sessions

**Infrastructure:**
- github.com/joho/godotenv v1.5.1 - Environment variable loading (`backend/main.go`)

## Configuration

**Environment:**
- Frontend: `VITE_API_URL` - Backend API endpoint (set in `docker-compose.yml` to `http://localhost:8080`)
- Backend: Database configuration via environment variables (`backend/repository/repository.go`):
  - `DB_HOST` - Database hostname
  - `DB_PORT` - Database port
  - `DB_USER` - Database user
  - `DB_PASSWORD` - Database password
  - `DB_NAME` - Database name
  - `PORT` - Server port (default: 8080)

**Build:**
- Frontend: `frontend/vite.config.js`
- Backend: Uses standard Go build (no separate config file)

## Database Migrations

**Tool:** Goose - Database migration framework
**Configuration:** `backend/Makefile` with migration commands
**Migration files:** `backend/migrations/` (SQL with Goose markers)
- `001_create_users.sql` - Users table with UUID, name, email, password_hash
- `002_create_session.sql` - Sessions table for auth tracking
- `003_transactions.sql` - Transactions table (scaffolding for finance tracking)

## Platform Requirements

**Development:**
- Node.js 20+ (for frontend)
- Go 1.25+ (for backend)
- Docker & Docker Compose (for containerized dev environment)
- PostgreSQL 16 (via Docker)

**Production:**
- Deployment target: Docker containers (frontend and backend)
- Database: PostgreSQL 16

---

*Stack analysis: 2026-08-25*

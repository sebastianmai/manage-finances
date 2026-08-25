<!-- refreshed: 2026-08-25 -->
# Architecture

**Analysis Date:** 2026-08-25

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                       Web Browser (Client)                        │
│                    React + React Router                            │
│  `frontend/src/App.jsx`, `frontend/src/components/*.jsx`          │
└─────────────────────────────────────┬──────────────────────────────┘
                                       │
                    HTTP/REST + Cookies (Port 5173)
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Go HTTP Server (Backend)                    │
│              Port 8080, CORS-enabled for Frontend                 │
│                    `backend/main.go`                              │
├──────────────────────┬──────────────────────┬────────────────────┤
│  Handler Layer       │  Service Layer       │ Repository Layer   │
│  (HTTP Handlers)     │  (Business Logic)    │  (Data Access)     │
│ `backend/handlers/`  │ `backend/services/`  │ `backend/repository/`│
└──────────────────────┴──────────────────────┴────────────────────┘
                                       │
                       PostgreSQL Driver (lib/pq)
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                            │
│              Port 5432 (Docker container)                         │
│            Tables: users, sessions                                │
└──────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App Root | Application layout, routing, theme management | `frontend/src/App.jsx` |
| Navbar | Navigation bar, user auth status display, theme toggle | `frontend/src/components/Navbar.jsx` |
| Login | User login form and authentication | `frontend/src/components/Login.jsx` |
| Signup | User registration form | `frontend/src/components/Signup.jsx` |
| Home | Landing page (requires expansion) | `frontend/src/components/Home.jsx` |
| Profile | User profile display | `frontend/src/components/Profile.jsx` |
| Handler Layer | HTTP request handling, input validation, response formatting | `backend/handlers/handlers.go` |
| Service Layer | Business logic, authentication, session management | `backend/services/services.go` |
| Repository Layer | Database operations, user and session persistence | `backend/repository/repository.go` |
| Models | Data structures (User, Session) | `backend/models/models.go` |
| Utilities | UUID generation, password hashing, JSON encoding | `backend/util/util.go` |

## Pattern Overview

**Overall:** Layered architecture with clear separation of concerns (3-tier backend, component-based frontend)

**Key Characteristics:**
- Backend uses explicit dependency injection (layers pass dependencies downward)
- Frontend uses React functional components with hooks for state management
- Singleton pattern for layer instances in backend (using sync.Once)
- Session-based authentication with HTTP-only cookies
- REST API endpoints with JSON request/response bodies

## Layers

**Handler Layer (HTTP):**
- Purpose: Accept HTTP requests, validate input, format responses
- Location: `backend/handlers/handlers.go`
- Contains: CreateUser, LoginUser, GetUser endpoint handlers
- Depends on: Service layer, utility functions
- Used by: Gorilla mux router (HTTP entry point)

**Service Layer (Business Logic):**
- Purpose: Implement authentication, session management, and business rules
- Location: `backend/services/services.go`
- Contains: CreateUser, LoginUser, CreateSession, GetUserBySession methods
- Depends on: Repository layer, models
- Used by: Handler layer

**Repository Layer (Data Persistence):**
- Purpose: Abstract database operations, manage connections
- Location: `backend/repository/repository.go`
- Contains: PostgreSQL connection management, CRUD operations on users and sessions
- Depends on: Standard library sql, postgres driver (lib/pq)
- Used by: Service layer

**Presentation Layer (Frontend):**
- Purpose: Display UI, handle user interactions, manage client state
- Location: `frontend/src/components/`
- Contains: React components for auth, navigation, profile
- Depends on: React, React Router, Fetch API
- Used by: End users in web browsers

## Data Flow

### Primary Request Path: User Login

1. **Frontend User Input** (`frontend/src/components/Login.jsx`)
   - User enters email and password
   - Form submission triggers handleSubmit()
   
2. **HTTP Request** 
   - Fetch POST to `http://localhost:8080/login` with credentials included
   - Body: `{ email: string, password: string }`

3. **Handler Processing** (`backend/handlers/handlers.go:96-165`)
   - LoginUser handler receives PUT request
   - Validates email and password fields are present
   - Calls service.LoginUser(email)

4. **Service Processing** (`backend/services/services.go:39-69`)
   - LoginUser retrieves all users from repository
   - Iterates through results to find matching email
   - Returns User struct with ID, Email, Password hash

5. **Handler Continues** (`backend/handlers/handlers.go:124-150`)
   - Handler uses bcrypt.CompareHashAndPassword to verify password
   - If valid, calls service.CreateSession()
   - Session ID generated and stored in database
   - HTTP cookie set with session_id (24-hour expiry)

6. **Frontend Response** 
   - Receives JSON response with session_id
   - Navigates to home page "/"

### User Authentication Check (Session Validation)

1. **Frontend Mount** (`frontend/src/components/Navbar.jsx:15-37`)
   - Navbar useEffect runs on component mount
   - Fetch GET to `http://localhost:8080/me` with credentials included

2. **Backend Verification** (`backend/handlers/handlers.go:167-189`)
   - GetUser handler reads session_id cookie
   - Calls service.GetUserBySession(sessionID)

3. **Session Lookup** (`backend/services/services.go:84-108`)
   - Service retrieves all sessions from repository
   - Finds session matching the provided sessionID
   - Returns associated User object

4. **Frontend Display**
   - If user found, show Profile component
   - If no user, show Log In button

### Primary Request Path: User Signup

1. **Frontend Form** (`frontend/src/components/Signup.jsx`)
   - User fills first_name, last_name, email, password, password_confirmation
   - Submit triggers handleSubmit()

2. **HTTP Request**
   - Fetch POST to `http://localhost:8080/signup`
   - Body contains all user registration data

3. **Handler Processing** (`backend/handlers/handlers.go:49-94`)
   - CreateUser handler generates UUID for user
   - Validates all required fields present
   - Verifies password matches password_confirmation
   - Calls service.CreateUser()

4. **Service to Repository** (`backend/services/services.go:35-37`)
   - Service passes through to repository.PutUser()

5. **Database Insert** (`backend/repository/repository.go:101-118`)
   - Repository hashes password with bcrypt
   - Executes INSERT statement to users table
   - Returns error if email already exists (constraint violation)

6. **Frontend Navigation**
   - On success, navigates to home page "/"

**State Management:**
- **Frontend:** React useState hooks (theme, user data)
- **Backend:** Session stored in database; no in-memory state maintained
- **Persistence:** PostgreSQL databases with users table and sessions table

## Key Abstractions

**Layer Instance Pattern:**
- Purpose: Ensure single instance of each layer throughout application lifecycle
- Examples: `HandlerLayerInstance`, `ServiceLayerInstance`, `RepositoryLayerInstance` in `backend/handlers/handlers.go`, `backend/services/services.go`, `backend/repository/repository.go`
- Pattern: Singleton using sync.Once to initialize exactly once

**HTTP Routing:**
- Purpose: Map URL paths to handler functions
- Example: `router.HandleFunc("/login", h.LoginUser).Methods("PUT")`
- Pattern: Gorilla mux with method-based routing

**CORS Handling:**
- Purpose: Allow frontend requests from different origin
- Implementation: Gorilla handlers middleware with specific allowed origins and methods
- Location: `backend/handlers/handlers.go:36-47`

**Password Security:**
- Purpose: Protect user passwords with cryptographic hashing
- Pattern: bcrypt.GenerateFromPassword and bcrypt.CompareHashAndPassword
- Location: `backend/util/util.go` and `backend/handlers/handlers.go`

**Session Management:**
- Purpose: Maintain user authentication state across requests
- Pattern: HTTP-only cookies with server-side session database
- Storage: PostgreSQL sessions table with user_id, session_id, created_at, expires_at

## Entry Points

**Backend Server:**
- Location: `backend/main.go`
- Triggers: `go run ./backend` or Docker container startup
- Responsibilities: 
  - Initialize database connection
  - Create layer instances (Repository → Service → Handler)
  - Set up HTTP router with CORS
  - Register routes (/signup, /login, /me)
  - Start HTTP server on port 8080

**Frontend Application:**
- Location: `frontend/src/main.jsx`
- Triggers: Browser loads frontend, `npm run dev` in development
- Responsibilities:
  - Mount React app into DOM root element
  - Initialize App component with routing
  - Load global CSS (Tailwind)

## Architectural Constraints

- **Threading:** Backend uses Go's goroutine model (gorilla/mux handles concurrent requests naturally)
- **Global state:** Singleton layer instances initialized once in `main.go` — no mutable global state beyond database connection
- **Circular imports:** No circular dependencies detected; layers have one-directional dependencies (handlers → services → repository)
- **Database connections:** Single connection pool per application instance, connection sharing across all requests
- **CORS origin:** Hardcoded to `http://localhost:5173` (frontend dev server); must change for production
- **Session expiry:** 24 hours from login; no automatic cleanup of expired sessions
- **Password complexity:** Currently no requirements enforced (signup validation only checks field presence)

## Anti-Patterns

### N+1 Query Problem (Login and Session Lookup)

**What happens:** 
- `LoginUser` fetches ALL users from database, then loops through results in application code
- `GetUserBySession` fetches ALL sessions, then loops through in application code
- Single login can result in full table scan if many users/sessions exist

**Why it's wrong:** 
- Scales poorly; 10,000 users = 10,000 rows transferred for each login
- Database query capability unused (WHERE clause available but not used)

**Do this instead:** 
- Use SQL WHERE clauses: `SELECT * FROM users WHERE email = $1` in `backend/repository/repository.go:132-142`
- Use parameterized queries consistently across all repository methods
- Example fix in repository: Return single row queries instead of full table scans

### Inline Request Structs

**What happens:** 
- Handler methods define request/response structs inline (e.g., createUserRequest inside CreateUser handler)
- Duplicates request structure between Login and Signup forms on frontend

**Why it's wrong:** 
- No shared type definitions between frontend and backend
- Changes to request format must be updated in two places
- No validation schema to enforce consistency

**Do this instead:** 
- Define request/response types in `backend/models/` (e.g., `type LoginRequest struct { Email, Password string }`)
- Consider shared OpenAPI/Swagger spec or TypeScript interfaces generated from backend types
- Centralize validation logic

### No Input Validation

**What happens:** 
- Handlers check field presence only (not empty string)
- No email format validation
- No SQL injection prevention at handler layer (relies on parameterized queries in repo)
- Password requirements commented out in frontend Signup component

**Why it's wrong:** 
- Invalid data reaches database
- No clear feedback to users on what's wrong with their input
- Inconsistent validation between frontend and backend

**Do this instead:** 
- Add validation layer after struct decoding: email format check, password length requirements, name formatting
- Return specific validation errors (field + reason) instead of generic 400
- Enable and enforce password requirements in signup (currently requirements commented out in `frontend/src/components/Signup.jsx`)

### Unencrypted Password in Service Layer

**What happens:** 
- `services.User` struct holds plaintext password returned from database
- Password field accessed directly in handler for bcrypt comparison

**Why it's wrong:** 
- Password exposed in memory longer than necessary
- Service layer should never expose password hashes

**Do this instead:** 
- Return only hashed password from repository to handler layer
- Never include password field in response DTOs
- Consider separate LoginUser return type with only ID and hash for comparison

## Error Handling

**Strategy:** Errors propagated up layers with context wrapped using fmt.Errorf; handlers convert to HTTP status codes

**Patterns:**
- Repository layer returns database errors wrapped with context (e.g., "retrieving users: %w")
- Service layer wraps repository errors with business context (e.g., "deleting existing session: %w")
- Handler layer catches service errors and converts to HTTP responses (401 Unauthorized, 500 Internal Server Error)
- Frontend catches fetch errors and logs to console; shows generic error messages to user

## Cross-Cutting Concerns

**Logging:** 
- Backend: Uses Go standard `log.Fatal` for startup errors, `fmt.Println` for debug output (inconsistent)
- Frontend: Uses `console.log` and `console.error` for debugging

**Validation:** 
- Backend: Field presence checks in handlers
- Frontend: Field presence, password matching, commented-out password requirements

**Authentication:** 
- Session cookie stored as HTTP-only, Secure=false (local dev only), SameSite=Lax
- Session lookup on each API call requiring auth
- No token refresh mechanism

---

*Architecture analysis: 2026-08-25*

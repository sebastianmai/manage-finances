# Coding Conventions

**Analysis Date:** 2026-08-25

## Naming Patterns

**Files:**
- Frontend: PascalCase for React components (`Login.jsx`, `Navbar.jsx`, `Home.jsx`)
- Backend: lowercase snake_case for Go files (`handlers.go`, `repository.go`, `services.go`)
- Test files: Would follow `.test.js` suffix for JavaScript, `_test.go` suffix for Go (not currently present)

**Functions:**
- Frontend/JavaScript: camelCase for functions (`handleChange`, `handleSubmit`, `setUser`)
- Backend/Go: PascalCase for exported functions (`CreateUser`, `LoginUser`, `NewHandlerLayer`, `GetAllUsers`), camelCase for internal functions
- Hook functions in React: Uppercase prefix for custom hooks (not currently used, but would follow `useX` pattern)

**Variables:**
- Frontend/JavaScript: camelCase (`user`, `navigate`, `email`, `password`, `focusedField`, `setdefaultUser`)
- Backend/Go: camelCase for local variables (`uuid`, `sessionID`, `userID`), PascalCase for exported package-level variables
- State variables in React: Follow `state/setState` pattern with camelCase

**Types:**
- Frontend/JavaScript: No formal type system used (plain JavaScript)
- Backend/Go: PascalCase for struct types (`HandlerLayerInstance`, `ServiceLayerInstance`, `RepositoryLayerInstance`, `User`, `dbConfig`)
- Database fields: snake_case in SQL (`first_name`, `last_name`, `password_hash`, `session_id`, `created_at`, `expires_at`)

**Constants and Configuration:**
- Environment variables: UPPERCASE_SNAKE_CASE (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- CSS classes: Tailwind utility format with custom theme prefix (`bg-ui-bg`, `text-ui-text`, `bg-ui-btn`, `border-ui-border`)

## Code Style

**Formatting:**
- Frontend: ESLint configured in `frontend/eslint.config.js` with flat config format
  - ES Lint recommends recommended rules: `js.configs.recommended`
  - React hooks rules enabled: `reactHooks.configs.flat.recommended`
  - React refresh rules for Vite: `reactRefresh.configs.vite`
  - No Prettier configuration found; use ESLint as linter
  
- Backend: Go standard formatting (uses `go fmt` conventions)
  - Imports organized: standard library first, then external packages
  - Package-level variables declared before function implementations

**Linting:**
- Frontend tool: ESLint 10.8.0 with plugins:
  - `eslint-plugin-react-hooks` 7.1.1
  - `eslint-plugin-react-refresh` 0.5.3
  - `@eslint/js` 10.0.1
  - Rules: browser globals enabled, JSX parsing enabled, React refresh validation

- Backend: No explicit linter configuration (Go defaults)

## Import Organization

**Order (Frontend/JavaScript):**
1. CSS/style imports (`import './App.css'`)
2. External packages (`import React`, `import {...} from 'react'`, `import {...} from 'react-router-dom'`)
3. Internal components (`import Navbar from './components/Navbar'`)

**Example from `App.jsx`:**
```javascript
import './App.css'
import Navbar from './components/Navbar'
import Signup from './components/Signup'
import Home from './components/Home'
import Login from './components/Login'
import {useState, useEffect} from 'react'
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom'
```

**Order (Backend/Go):**
1. Package declaration
2. Import block with standard library imports first, then external packages

**Example from `handlers.go`:**
```go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"backend/handlers"
	"backend/repository"
	"backend/util"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
)
```

**Path Aliases:**
- Frontend: Not used; relative imports from components directory
- Backend: Go package imports using module path (`backend/handlers`, `backend/services`, `backend/models`)

## Error Handling

**Frontend/JavaScript Patterns:**
- Console logging for debugging: `console.log()`, `console.error()`
- Try-catch blocks for async operations
- HTTP response status checking: `if (!response.ok)`
- Error fields reset on failure: `setUser({email: "", password: ""})`

**Example from `Login.jsx`:**
```javascript
try {
    let body = JSON.stringify(user);
    const response = await fetch("http://localhost:8080/login", {
        method: "PUT",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
        },
        body: body,
    });

    console.log("Response status:", response.status);

    if (!response.ok) {
        setUser({email: "", password: ""});
        return;
    } else {
        const loggedInUser = await response.json();
        console.log("Login successful:", loggedInUser);
        navigate("/");
    }
} catch (error) {
    console.error("Error logging in:", error);
}
```

**Backend/Go Patterns:**
- Error wrapping with context using `fmt.Errorf()` with `%w` verb
- Immediate error checking with `if err != nil` pattern
- Console output with `fmt.Println()` and `fmt.Printf()` for debugging
- HTTP error responses using `http.Error()` or custom `util.WriteJSON()` for structured responses
- Multiple return values for error handling (standard Go pattern)

**Example from `repository.go`:**
```go
func (r *RepositoryLayerInstance) PutUser(UUID, firstName, lastName, email, password string) error {
    hash, err := util.HashPwd(password)
    if err != nil {
        return fmt.Errorf("hashing password: %w", err)
    }

    _, err = r.db.Exec(`...`, UUID, firstName, lastName, email, hash)

    if err != nil {
        return fmt.Errorf("inserting user: %w", err)
    }

    return nil
}
```

## Logging

**Framework:**
- Frontend: `console` object (console.log, console.error, console.info)
- Backend: `fmt` package with `Println()` and `Printf()`

**Patterns:**
- Frontend:
  - Info/debug logs: `console.log("message")`
  - Error logs: `console.error("Error message:", error)`
  - Status tracking: `console.log("Response status:", response.status)`

- Backend:
  - Info logs: `fmt.Println("Connected to the database successfully")`
  - Debug output: `fmt.Println("Error retrieving", err)`
  - Server startup: `log.Println("Server running on http://localhost:8080")`
  - Fatal errors: `log.Fatal(err)`

## Comments

**When to Comment:**
- Backend: Minimal commenting; used for marking sections (`// ROUTES:`) and temporarily disabled code
- Frontend: Used for disabled code blocks (e.g., commented-out password requirements)

**JSDoc/TSDoc:**
- Not currently used in this codebase
- No function-level documentation comments present

## Function Design

**Size:**
- Frontend components: 100-200 lines typical (Login.jsx: 109 lines, Signup.jsx: 224 lines)
- Backend handler functions: 50-100 lines typical
- Utility functions: 20-40 lines (focused, single responsibility)

**Parameters:**
- Frontend: Components accept props from React Router or parent components
- Backend: Handlers receive `(w http.ResponseWriter, r *http.Request)` as standard pattern

**Return Values:**
- Frontend: Components return JSX elements
- Backend: Handlers return nothing (void); write to ResponseWriter directly; service/repository methods return `(value, error)` tuple

## Module Design

**Exports:**
- Frontend: `export default function ComponentName() {...}` pattern (default export)
- Backend: PascalCase function names for exported functions; lowercase for package-private functions

**Barrel Files:**
- Not used in this codebase
- Each component/module imported directly from its file

**Architecture Layers:**
- Backend uses explicit layer separation:
  - `handlers/`: HTTP request handlers
  - `services/`: Business logic and orchestration
  - `repository/`: Data access layer
  - `models/`: Data structures
  - `util/`: Shared utilities

**Example from `main.go`:**
```go
r, err := repository.NewRepositoryLayer()
s := services.NewServiceLayer(r)
h := handlers.NewHandlerLayer(s)
```

---

*Convention analysis: 2026-08-25*

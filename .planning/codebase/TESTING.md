# Testing Patterns

**Analysis Date:** 2026-08-25

## Test Framework

**Status:**
- No test framework currently configured
- No test files present in source code (`src/` directories)

**Recommended Setup:**

For Frontend:
- Runner: Vitest (recommended for Vite projects)
- Assertion Library: Vitest built-in `expect()` or external `@testing-library/react`
- Test utilities: React Testing Library for component testing

For Backend:
- Runner: Go's built-in `testing` package
- Assertion Library: None required (use simple comparisons or testify for assertions)
- Test utilities: Table-driven testing (idiomatic Go pattern)

## Test File Organization

**Current Status:**
- Location: Not established (recommend parallel structure to source)
- Naming: No established pattern
- Structure: N/A (no tests present)

**Recommended Setup:**

**Frontend:**
```
frontend/src/
├── components/
│   ├── Login.jsx
│   ├── Login.test.jsx          # Co-located with component
│   ├── Signup.jsx
│   └── Signup.test.jsx
├── App.jsx
└── App.test.jsx
```

**Backend:**
```
backend/
├── handlers/
│   ├── handlers.go
│   └── handlers_test.go        # Standard Go convention
├── services/
│   ├── services.go
│   └── services_test.go
└── repository/
    ├── repository.go
    └── repository_test.go
```

## Test Structure

**Current State:**
- No test structure established
- No testing patterns observable in codebase

**Recommended Patterns:**

**Frontend (Vitest + React Testing Library):**
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from './Login'

describe('Login Component', () => {
  it('should render login form', () => {
    render(<Login />)
    expect(screen.getByText('Sign Up')).toBeInTheDocument()
  })

  it('should handle form submission', async () => {
    render(<Login />)
    const emailInput = screen.getByPlaceholderText('Enter your email')
    await userEvent.type(emailInput, 'test@example.com')
    // ... test implementation
  })
})
```

**Backend (Go testing pattern - table-driven tests):**
```go
package handlers

import (
	"testing"
	"net/http"
	"net/http/httptest"
)

func TestCreateUser(t *testing.T) {
	tests := []struct {
		name           string
		body           string
		expectedStatus int
	}{
		{
			name:           "valid user creation",
			body:           `{"first_name":"John","last_name":"Doe","email":"john@example.com","password":"pass123","password_confirmation":"pass123"}`,
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "missing fields",
			body:           `{"email":"john@example.com"}`,
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test implementation
		})
	}
}
```

## Mocking

**Current Status:**
- No mocking framework in use
- No mock utilities established

**Recommended Patterns:**

**Frontend:**
- Mock external API calls using Vitest's `vi.mock()` or MSW (Mock Service Worker)
- Mock React Router using `MemoryRouter`
- Mock HTTP requests during component testing

**Example:**
```javascript
import { vi } from 'vitest'

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ message: "Login successful" })
  })
)
```

**Backend:**
- Use dependency injection (already partially in place with layer pattern)
- Mock database connections using interfaces
- Use `http.ResponseWriter` test helpers

**Example:**
```go
type MockRepository struct {
	mockGetUser func(id string) (*models.User, error)
}

func (m *MockRepository) GetUser(id string) (*models.User, error) {
	return m.mockGetUser(id)
}
```

**What to Mock:**
- API calls (fetch requests in frontend)
- Database operations (queries and commands in backend)
- External service dependencies
- Time-dependent functionality (use `clock` or similar)

**What NOT to Mock:**
- Core business logic (test actual logic paths)
- Utility functions (test as-is: UUID generation, password hashing)
- React hooks behavior (test component behavior instead)
- HTTP status codes and error responses (test actual responses)

## Fixtures and Factories

**Current Status:**
- No test data fixtures or factories established

**Recommended Patterns:**

**Frontend - Test fixtures:**
```javascript
// fixtures/users.js
export const mockUser = {
  email: "test@example.com",
  password: "testPassword123"
}

export const mockLoginResponse = {
  message: "Login successful",
  session_id: "uuid-string-here"
}
```

**Backend - Table-driven test data:**
```go
var testCases = []struct {
	name     string
	input    CreateUserRequest
	expected error
}{
	{
		name: "valid user",
		input: CreateUserRequest{
			FirstName:            "John",
			LastName:             "Doe",
			Email:                "john@example.com",
			Password:             "pass123",
			PasswordConfirmation: "pass123",
		},
		expected: nil,
	},
}
```

**Location:**
- Frontend: `frontend/src/__tests__/fixtures/` or co-located in test files
- Backend: Within test files using table-driven patterns (idiomatic Go)

## Coverage

**Requirements:**
- Not currently enforced
- No coverage threshold configured

**Recommended Targets:**
- Frontend: Aim for 70%+ coverage on components and utilities
- Backend: Aim for 80%+ coverage on handlers, services, and repository layers
- Critical paths (auth, user management): Target 90%+ coverage

**View Coverage (Recommended Setup):**

**Frontend (Vitest):**
```bash
npm run test:coverage
# Or add to package.json:
# "test:coverage": "vitest --coverage"
```

**Backend (Go):**
```bash
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Test Types

**Unit Tests:**
- Scope: Individual functions and methods
- Frontend approach: Test component logic, event handlers, state changes in isolation
- Backend approach: Test individual handler methods, service methods, repository queries
- Example:
  - Frontend: Test `handleChange()` updates form state correctly
  - Backend: Test `CreateUser()` with valid/invalid inputs

**Integration Tests:**
- Scope: Component interactions, multi-layer workflows
- Frontend approach: Test complete form submission flow (not mocked)
- Backend approach: Test handler → service → repository flow with test database
- Example:
  - Frontend: Full login flow from form input to navigation
  - Backend: User signup → login → session creation flow

**E2E Tests:**
- Framework: Not currently used
- Recommendation: Implement with Playwright or Cypress for critical user flows
- Scope: Full application flows (signup → login → profile access)

## Common Patterns

**Async Testing:**

**Frontend (using async/await in test):**
```javascript
it('should fetch user data on mount', async () => {
  render(<Home />)
  await waitFor(() => {
    expect(screen.getByText('Welcome')).toBeInTheDocument()
  })
})
```

**Backend (using goroutines in integration tests):**
```go
func TestConcurrentUserCreation(t *testing.T) {
	done := make(chan error, 2)
	go func() {
		done <- createTestUser("user1@example.com")
	}()
	go func() {
		done <- createTestUser("user2@example.com")
	}()
	
	for i := 0; i < 2; i++ {
		if err := <-done; err != nil {
			t.Errorf("concurrent creation failed: %v", err)
		}
	}
}
```

**Error Testing:**

**Frontend:**
```javascript
it('should handle login errors', async () => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401
    })
  )
  
  render(<Login />)
  const form = screen.getByRole('form')
  await userEvent.click(screen.getByText('Log In'))
  
  await waitFor(() => {
    expect(screen.getByPlaceholderText('email')).toHaveValue('')
  })
})
```

**Backend:**
```go
func TestCreateUserValidation(t *testing.T) {
	tests := []struct {
		name           string
		input          CreateUserRequest
		expectedError  string
	}{
		{
			name:          "password mismatch",
			input:         CreateUserRequest{Password: "pass1", PasswordConfirmation: "pass2"},
			expectedError: "Passwords do not match",
		},
		{
			name:          "empty fields",
			input:         CreateUserRequest{Email: ""},
			expectedError: "All fields are required",
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := handler.CreateUser(tt.input)
			if err == nil || err.Error() != tt.expectedError {
				t.Errorf("got %v, want %v", err, tt.expectedError)
			}
		})
	}
}
```

## Critical Testing Gaps

**High Priority:**
- `frontend/src/components/Login.jsx`: Form validation and API error handling
- `frontend/src/components/Signup.jsx`: Password confirmation, field validation
- `backend/handlers/handlers.go`: HTTP request parsing, error responses
- `backend/services/services.go`: Session management, user lookup logic
- `backend/repository/repository.go`: Database operations, error handling

**Medium Priority:**
- State management in React components
- Request/response cycle integration between frontend and backend
- Password hashing and verification in `backend/util/util.go`

---

*Testing analysis: 2026-08-25*

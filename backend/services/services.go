package services

import (
	"backend/models"
	"backend/repository"
	"fmt"
	"sync"
	"time"
)

type ServiceLayerInstance struct {
	repository *repository.RepositoryLayerInstance
}

var (
	serviceInstance *ServiceLayerInstance
	serviceOnce     sync.Once
)

type User struct {
	ID       string
	Email    string
	Password string
}

func NewServiceLayer(r *repository.RepositoryLayerInstance) *ServiceLayerInstance {
	serviceOnce.Do(func() {
		serviceInstance = &ServiceLayerInstance{
			repository: r,
		}
	})
	return serviceInstance
}

func (s *ServiceLayerInstance) CreateUser(UUID, firstName, lastName, email, password string) error {
	return s.repository.PutUser(UUID, firstName, lastName, email, password)
}

func (s *ServiceLayerInstance) LoginUser(email string) (*User, error) {

	rows, err := s.repository.GetAllUsers()
	if err != nil {
		fmt.Printf("Error retrieving")
		return nil, fmt.Errorf("retrieving users: %w", err)
	}

	for rows.Next() {
		var id string
		var userEmail string
		var userPassword string

		err := rows.Scan(&id, &userEmail, &userPassword)

		if err != nil {
			fmt.Printf("Error")
			return nil, fmt.Errorf("scanning user: %w", err)
		}

		if userEmail == email {
			user := &User{
				ID:       id,
				Email:    userEmail,
				Password: userPassword,
			}
			return user, nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

func (s *ServiceLayerInstance) CreateSession(sessionID, userID string, createdAt, expiresAt time.Time) (string, error) {
	if err := s.repository.DeleteSession(userID); err != nil {
		return "", fmt.Errorf("deleting existing session: %w", err)
	}

	sessionID, err := s.repository.CreateSession(sessionID, userID, createdAt, expiresAt)

	if err != nil {
		return "", fmt.Errorf("creating new session: %w", err)
	}
	return sessionID, nil
}

func (s *ServiceLayerInstance) UpdateUser(userID, firstName, lastName, email string) error {
	return s.repository.UpdateUser(userID, firstName, lastName, email)
}

func (s *ServiceLayerInstance) Logout(sessionID string) error {
	return s.repository.DeleteSessionByID(sessionID)
}

func (s *ServiceLayerInstance) GetUserBySession(sessionID string) (*models.User, error) {
	sessions, err := s.repository.GetAllSessions()
	if err != nil {
		return nil, fmt.Errorf("retrieving user ID by session: %w", err)
	}

	for sessions.Next() {
		var ID string
		var userID string
		var createdAt time.Time
		var expiresAt time.Time

		err := sessions.Scan(&ID, &userID, &createdAt, &expiresAt)
		if err != nil {
			return nil, fmt.Errorf("scanning session: %w", err)
		}

		if sessionID == ID {
			singleUser := s.repository.GetSingleUser(userID)

			return singleUser, nil
		}
	}
	return nil, fmt.Errorf("user not found")
}

package services

import (
	"backend/repository"
	"fmt"
	"sync"
)

type ServiceLayerInstance struct {
	repository *repository.RepositoryLayerInstance
}

var (
	serviceInstance *ServiceLayerInstance
	serviceOnce     sync.Once
)

type User struct {
	ID       int
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

func (s *ServiceLayerInstance) CreateUser(firstName, lastName, email, password string) error {
	return s.repository.PutUser(firstName, lastName, email, password)
}

func (s *ServiceLayerInstance) LoginUser(email string) (*User, error) {

	rows, err := s.repository.GetAllUsers()
	if err != nil {
		fmt.Printf("Error retrieving")
		return nil, fmt.Errorf("retrieving users: %w", err)
	}

	for rows.Next() {
		var id int
		var userEmail string
		var userPassword string

		err := rows.Scan(&id, &userEmail, &userPassword)

		if err != nil {
			fmt.Printf("Error")
			return nil, fmt.Errorf("scanning user: %w", err)
		}

		fmt.Println("ID:", id)
		fmt.Println("Email:", email)
		fmt.Println("Password:", userPassword)

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

func (s *ServiceLayerInstance) CreateSession(userID int) error {
	return s.repository.CreateSession(userID)
}

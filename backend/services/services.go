package services

import (
	"backend/repository"
	"sync"
)

type ServiceLayerInstance struct {
	repository *repository.RepositoryLayerInstance
}

var (
	serviceInstance *ServiceLayerInstance
	serviceOnce     sync.Once
)

func NewServiceLayer(r *repository.RepositoryLayerInstance) *ServiceLayerInstance {
	serviceOnce.Do(func() {
		serviceInstance = &ServiceLayerInstance{
			repository: r,
		}
	})
	return serviceInstance
}

func (s *ServiceLayerInstance) GET() string {
	return s.repository.GET()
}

func (s *ServiceLayerInstance) POST() string {
	return s.repository.POST()
}

func (s *ServiceLayerInstance) CreateUser(firstName, lastName, email, password string) error {
	return s.repository.PutUser(firstName, lastName, email, password)
}

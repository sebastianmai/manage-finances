package internal

import (
	"database/sql"
	"fmt"
)

type UserService struct {
	DB *sql.DB
}

func (u *UserService) CreateUser(firstName, lastName, email, password string) error {
	res, err := u.DB.Exec(`
		INSERT INTO users (first_name, last_name, email, password_hash)
		VALUES ($1, $2, $3, $4)
	`, firstName, lastName, email, password)

	fmt.Println("INSERT RESULT:", res)

	return err
}

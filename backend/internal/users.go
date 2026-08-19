package internal

import (
	"database/sql"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

type UserService struct {
	DB *sql.DB
}

func (u *UserService) CreateUser(firstName, lastName, email, password string) error {

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	res, err := u.DB.Exec(`
		INSERT INTO users (first_name, last_name, email, password_hash)
		VALUES ($1, $2, $3, $4)
	`, firstName, lastName, email, hash)

	fmt.Println("INSERT RESULT:", res)

	return err
}

package internal

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

func ConnectToDatabase(dsn string) (*sql.DB, error) {
	database, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	if err := database.Ping(); err != nil {
		_ = database.Close()
		return nil, err
	}
	fmt.Println("Connected to the database successfully")
	return database, nil
}

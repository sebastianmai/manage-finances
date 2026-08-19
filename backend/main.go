package main

import (
	"backend/internal"
	"fmt"
	"log"
	"net/http"
	"os"

	_ "github.com/joho/godotenv/autoload"
)

type dbConfig struct {
	host     string
	port     string
	user     string
	password string
	dbname   string
}

func LoadEnv() (*dbConfig, error) {
	return &dbConfig{
		host:     os.Getenv("DB_HOST"),
		port:     os.Getenv("DB_PORT"),
		user:     os.Getenv("DB_USER"),
		password: os.Getenv("DB_PASSWORD"),
		dbname:   os.Getenv("DB_NAME"),
	}, nil
}

func main() {
	dbConfig, err := LoadEnv()

	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbConfig.host,
		dbConfig.port,
		dbConfig.user,
		dbConfig.password,
		dbConfig.dbname,
	)

	db, err := internal.ConnectToDatabase(dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	users := &internal.UserService{
		DB: db,
	}
	handler := &internal.Handler{
		Users: users,
	}

	router := internal.NewRouter(handler)
	log.Println("Server running on http://localhost:8080")

	log.Fatal(http.ListenAndServe(":8080", router))
}

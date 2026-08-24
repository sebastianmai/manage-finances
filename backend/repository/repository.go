package repository

import (
	"backend/util"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

type dbConfig struct {
	host     string
	port     string
	user     string
	password string
	dbname   string
}

func LoadEnv() (*dbConfig, error) {
	cfg := &dbConfig{
		host:     os.Getenv("DB_HOST"),
		port:     os.Getenv("DB_PORT"),
		user:     os.Getenv("DB_USER"),
		password: os.Getenv("DB_PASSWORD"),
		dbname:   os.Getenv("DB_NAME"),
	}

	if cfg.host == "" ||
		cfg.port == "" ||
		cfg.user == "" ||
		cfg.dbname == "" {
		return nil, fmt.Errorf("missing required database configuration")
	}

	return cfg, nil
}

type RepositoryLayerInstance struct {
	db *sql.DB
}

var (
	repositoryInstance *RepositoryLayerInstance
	repositoryErr      error
	once               sync.Once
)

func NewRepositoryLayer() (*RepositoryLayerInstance, error) {
	once.Do(func() {
		cfg, err := LoadEnv()
		if err != nil {
			repositoryErr = err
			return
		}

		dsn := fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			cfg.host,
			cfg.port,
			cfg.user,
			cfg.password,
			cfg.dbname,
		)

		fmt.Print(dsn)

		db, err := connectToDatabase(dsn)
		if err != nil {
			repositoryErr = fmt.Errorf("failed to connect to database: %w", err)
			return
		}

		repositoryInstance = &RepositoryLayerInstance{
			db: db,
		}
	})

	return repositoryInstance, repositoryErr
}

func connectToDatabase(dsn string) (*sql.DB, error) {
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

func (r *RepositoryLayerInstance) PutUser(UUID, firstName, lastName, email, password string) error {

	hash, err := util.HashPwd(password)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	_, err = r.db.Exec(`
		INSERT INTO users (uuid, first_name, last_name, email, password_hash)
		VALUES ($1, $2, $3, $4, $5)
	`, UUID, firstName, lastName, email, hash)

	if err != nil {
		return fmt.Errorf("inserting user: %w", err)
	}

	return nil
}

func (r *RepositoryLayerInstance) DeleteUser(email string) error {
	_, err := r.db.Exec(`
		DELETE FROM users WHERE email = $1
	`, email)

	if err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}

	return nil
}

func (r *RepositoryLayerInstance) GetAllUsers() (*sql.Rows, error) {
	users, err := r.db.Query(`
		SELECT uuid, email, password_hash FROM users
	`)
	if err != nil {
		fmt.Println("Error retrieving users:", err)
		return nil, fmt.Errorf("retrieving users: %w", err)
	}

	return users, nil

}

func (r *RepositoryLayerInstance) DeleteSession(userID string) error {
	_, err := r.db.Exec(`
		DELETE FROM sessions WHERE uuid = $1
	`, userID)
	if err != nil {
		return fmt.Errorf("deleting session: %w", err)
	}
	return nil
}

func (r *RepositoryLayerInstance) CreateSession(sessionID, userID string, createdAt, expiresAt time.Time) (string, error) {
	var returnedID string
	err := r.db.QueryRow(`
		INSERT INTO sessions (session_id, uuid, created_at, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING session_id
	`, sessionID, userID, createdAt, expiresAt).Scan(&returnedID)

	if err != nil {
		return "", fmt.Errorf("creating session: %w", err)
	}

	return returnedID, nil
}

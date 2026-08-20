package main

import (
	"fmt"
	"log"
	"net/http"

	"backend/handlers"
	"backend/repository"
	"backend/services"

	_ "github.com/joho/godotenv/autoload"
)

func main() {

	r, err := repository.NewRepositoryLayer()

	if err != nil {
		log.Fatal(err)
	}

	s := services.NewServiceLayer(r)
	h := handlers.NewHandlerLayer(s)

	fmt.Printf(h.GET())

	router, corsHandler := h.NewRouter()

	// ROUTES:
	router.HandleFunc("/signup", h.CreateUser).Methods("POST")

	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", corsHandler))
}

package main

import (
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

	router, corsHandler := h.NewRouter()

	// ROUTES:
	router.HandleFunc("/signup", h.CreateUser).Methods("POST")
	router.HandleFunc("/login", h.LoginUser).Methods("PUT")
	router.HandleFunc("/me", h.GetUser).Methods("GET")
	router.HandleFunc("/me", h.UpdateUser).Methods("PATCH")
	router.HandleFunc("/balance", h.GetBalance).Methods("GET")
	router.HandleFunc("/accounts", h.GetAccounts).Methods("GET")
	router.HandleFunc("/accounts", h.CreateAccount).Methods("POST")
	router.HandleFunc("/accounts/{id}", h.DeleteAccount).Methods("DELETE")
	router.HandleFunc("/accounts/{id}", h.UpdateAccountFlags).Methods("PATCH")
	router.HandleFunc("/transactions", h.CreateTransaction).Methods("POST")
	router.HandleFunc("/transactions", h.GetTransactions).Methods("GET")
	router.HandleFunc("/transactions/{id}", h.UpdateTransaction).Methods("PATCH")
	router.HandleFunc("/transactions/{id}", h.DeleteTransaction).Methods("DELETE")
	router.HandleFunc("/logout", h.Logout).Methods("POST")

	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", corsHandler))
}

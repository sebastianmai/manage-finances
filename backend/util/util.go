package util

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		fmt.Println("JSON RESPONSE ERROR:", err)
	}
}

func HashPwd(pwd string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword(
		[]byte(pwd),
		bcrypt.DefaultCost,
	)

	return string(hash), err

}

func GenerateUUID() string {
	uuid, err := uuid.NewRandom()
	if err != nil {
		fmt.Println("Error generating UUID:", err)
		return ""
	}
	return uuid.String()
}

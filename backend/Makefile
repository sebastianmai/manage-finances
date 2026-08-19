include .env
export

migrate-up:
	goose -dir migrations postgres "$(DATABASE_URL)" up

migrate-down:
	goose -dir migrations postgres "$(DATABASE_URL)" down

migrate-reset:
	goose -dir migrations postgres "$(DATABASE_URL)" reset

migrate-status:
	goose -dir migrations postgres "$(DATABASE_URL)" status

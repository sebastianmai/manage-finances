-- +goose Up

-- No DEFAULT and no backfill here on purpose: the table is expected to be
-- empty at this point, and a NOT NULL add with no default is itself the
-- emptiness assertion -- Postgres rejects the ALTER outright if any row
-- already exists, so a differently-seeded database fails loudly at
-- migration time instead of silently getting a bogus backfilled value.
--
-- ON DELETE CASCADE means DELETE /accounts/{id} now also removes that
-- account's transactions. That is intended: a transaction cannot outlive
-- the account it belongs to.
ALTER TABLE transactions ADD COLUMN account_id BIGINT NOT NULL;

ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_account
        FOREIGN KEY (account_id)
        REFERENCES accounts(account_id)
        ON DELETE CASCADE;

-- +goose Down

ALTER TABLE transactions DROP COLUMN account_id;

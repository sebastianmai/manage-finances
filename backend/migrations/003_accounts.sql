-- +goose Up

CREATE TABLE accounts (
    account_id UUID PRIMARY KEY,
    uuid UUID NOT NULL,
    -- type is a fixed two-value classification, Haupt or Anlage, enforced
    -- below by a CHECK constraint with the handler mirroring it at the API
    -- boundary. (This absorbs what was originally a separate free-text
    -- type column plus a second category column carrying this same
    -- constraint -- they turned out to be the same concept.)
    type VARCHAR(50) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    short_name VARCHAR(50) NOT NULL,
    saldo DECIMAL(10, 2) NOT NULL DEFAULT 0,
    active_since DATE NOT NULL,
    owner_name VARCHAR(100) NOT NULL,
    vollmacht VARCHAR(100),
    aktiv BOOLEAN NOT NULL DEFAULT true,
    include_in_saldo BOOLEAN NOT NULL DEFAULT true,
    -- zinssatz and basiszins are nullable with no default: NULL and 0 are
    -- genuinely different values here -- an account with no interest rate
    -- at all must not claim an explicit 0% rate. comment is nullable too,
    -- but only because it is absent-as-empty, not because NULL carries a
    -- distinct meaning from '' the way it does for the rates.
    zinssatz DECIMAL(5, 2),
    basiszins DECIMAL(5, 2),
    comment VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_accounts_user
        FOREIGN KEY (uuid)
        REFERENCES users(uuid)
        ON DELETE CASCADE,

    -- Named explicitly (not left to a generated name) because the
    -- verification gates and \d accounts both reference
    -- accounts_type_check by name. This is enforced at the database
    -- level, not only in the handler, so a direct psql insert or a future
    -- non-API client still cannot store a third value.
    CONSTRAINT accounts_type_check CHECK (type IN ('Haupt', 'Anlage'))
);

-- +goose Down

DROP TABLE accounts;

-- +goose Up

CREATE TABLE user_settings (
    -- uuid is the PRIMARY KEY here, unlike categories where it is a plain
    -- FK column: a user has at most one settings row, so this turns
    -- "one row per user" into a storage guarantee, and gives the upsert's
    -- ON CONFLICT (uuid) a unique index to bind to.
    uuid UUID PRIMARY KEY,
    -- Wider than accounts.saldo's DECIMAL(10, 2): the threshold is a
    -- ceiling that may legitimately exceed any single account balance, and
    -- the handler's upper bound is set to match this column's capacity.
    balance_threshold DECIMAL(12, 2) NOT NULL,
    show_decimals BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_settings_user
        FOREIGN KEY (uuid)
        REFERENCES users(uuid)
        ON DELETE CASCADE
);

-- +goose Down

DROP TABLE user_settings;

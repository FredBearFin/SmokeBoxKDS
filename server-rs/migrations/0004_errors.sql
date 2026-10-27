-- Things that went wrong, for SmokeBox staff: server answers of 500 and up, and page errors sent by tablets. Never request bodies.
CREATE TABLE server_errors (
    id BIGSERIAL PRIMARY KEY,
    at BIGINT NOT NULL,
    source TEXT NOT NULL,          -- 'server' or 'tablet'
    kitchen_id TEXT,
    what TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX server_errors_at ON server_errors (at);

-- Each nightly backup (written by the backup script on the server): when, whether it worked, its size, whether a copy went off the
-- server, and the result of the weekly test restore. The staff console shows the latest.
CREATE TABLE backup_runs (
    id BIGSERIAL PRIMARY KEY,
    at BIGINT NOT NULL,
    kind TEXT NOT NULL,            -- 'backup' or 'restore-check'
    ok BOOLEAN NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    offsite BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT NOT NULL DEFAULT ''
);

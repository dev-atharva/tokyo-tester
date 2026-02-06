CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    nodes_config TEXT NOT NULL,
    edges_config TEXT NOT NULL,
    metadata TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT,
    status TEXT NOT NULL,
    result TEXT,
    logs TEXT,
    error TEXT,
    container_ids TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_sessions_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE IF NOT EXISTS test_results (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    test_name TEXT NOT NULL,
    test_type TEXT NOT NULL,
    status TEXT NOT NULL,
    result_data TEXT,
    duration_ms INTEGER,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_test_results_session
        FOREIGN KEY (session_id) REFERENCES sessions(id),
    CONSTRAINT fk_test_results_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE sync_metadata (
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    last_sync_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sync_version BIGINT NOT NULL DEFAULT 0,
    sync_status TEXT NOT NULL DEFAULT 'idle',

    CONSTRAINT pk_sync_metadata PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_workflows_updated
    ON workflows(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflows_client_active
    ON workflows(client_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sessions_workflow_active
    ON sessions(workflow_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sessions_status
    ON sessions(status);

CREATE INDEX IF NOT EXISTS idx_test_results_session_active
    ON test_results(session_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_test_results_workflow_active
    ON test_results(workflow_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_workflows_user_id
    ON workflows(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_test_results_user_id
    ON test_results(user_id);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_user
    ON sync_metadata(user_id);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_client
    ON sync_metadata(client_id);

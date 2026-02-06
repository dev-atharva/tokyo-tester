CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    nodes_config TEXT NOT NULL,
    edges_config TEXT NOT NULL,
    metadata TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id VARCHAR(255) NOT NULL,
    is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0,1))
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id VARCHAR(255) NOT NULL,
    is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0,1)),
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
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
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT,
    user_id VARCHAR(255) NOT NULL,
    is_deleted INTEGER DEFAULT 0 CHECK (is_deleted IN (0,1)),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_metadata (
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sync_version INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'idle',

    PRIMARY KEY (user_id, client_id)
);


CREATE INDEX IF NOT EXISTS idx_workflows_updated ON workflows(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_client ON workflows(client_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_sessions_workflow ON sessions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_test_results_sessions ON test_results(session_id);
CREATE INDEX IF NOT EXISTS idx_test_results_workflows ON test_results(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);

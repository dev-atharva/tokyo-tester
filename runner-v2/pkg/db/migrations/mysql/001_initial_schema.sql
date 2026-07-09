CREATE TABLE workflows (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    nodes_config LONGTEXT NOT NULL,
    edges_config LONGTEXT NOT NULL,
    metadata LONGTEXT,
    version INT NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    client_id VARCHAR(255),
    user_id VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255),
    status VARCHAR(64) NOT NULL,
    result LONGTEXT,
    logs LONGTEXT,
    error TEXT,
    container_ids LONGTEXT,
    started_at DATETIME(3),
    completed_at DATETIME(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    client_id VARCHAR(255),
    user_id VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_sessions_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);

CREATE TABLE test_results (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    workflow_id VARCHAR(255) NOT NULL,
    test_name VARCHAR(255) NOT NULL,
    test_type VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    result_data LONGTEXT,
    duration_ms INT,
    executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    client_id VARCHAR(255),
    user_id VARCHAR(255),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_test_results_session
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_results_workflow
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE sync_metadata (
    user_id VARCHAR(255) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    last_sync_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_sync_version BIGINT NOT NULL DEFAULT 0,
    sync_status VARCHAR(64) NOT NULL DEFAULT 'idle',
    PRIMARY KEY (user_id, client_id)
);

CREATE INDEX idx_workflows_updated ON workflows(updated_at);
CREATE INDEX idx_workflows_client ON workflows(client_id, is_deleted);
CREATE INDEX idx_sessions_workflow ON sessions(workflow_id, is_deleted);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_test_results_sessions ON test_results(session_id, is_deleted);
CREATE INDEX idx_test_results_workflows ON test_results(workflow_id, is_deleted);
CREATE INDEX idx_workflows_user_id ON workflows(user_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_test_results_user_id ON test_results(user_id);
CREATE INDEX idx_sync_metadata_user ON sync_metadata(user_id);
CREATE INDEX idx_sync_metadata_client ON sync_metadata(client_id);

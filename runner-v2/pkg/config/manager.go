package config

import (
	"fmt"
	"os"
	"strconv"
)

type ConfigManager struct {
	App            AppConfig
	Database       DatabaseConfig
	Telemetry      TelemetryConfig
	Janitor        JanitorConfig
	WorkflowWorker WorkflowWorkerConfig
}

func NewConfigManager() (*ConfigManager, error) {
	cm := &ConfigManager{}

	cm.App = AppConfig{
		Environment:              getEnvOrDefault("APP_ENV", "development"),
		Port:                     getEnvOrDefault("PORT", "8080"),
		LogLevel:                 getEnvOrDefault("LOG_LEVEL", "info"),
		CORSOrigin:               getEnvOrDefault("CORS_ORIGIN", "http://localhost:3000"),
		ReadHeaderTimeoutSec:     getEnvIntOrDefault("READ_HEADER_TIMEOUT_SEC", 10),
		ReadTimeoutSec:           getEnvIntOrDefault("READ_TIMEOUT_SEC", 30),
		WriteTimeoutSec:          getEnvIntOrDefault("WRITE_TIMEOUT_SEC", 2100),
		IdleTimeoutSec:           getEnvIntOrDefault("IDLE_TIMEOUT_SEC", 120),
		ProvisionTimeoutSec:      getEnvIntOrDefault("PROVISION_TIMEOUT_SEC", 900),
		TestRunTimeoutSec:        getEnvIntOrDefault("TEST_RUN_TIMEOUT_SEC", 1800),
		CleanupTimeoutSec:        getEnvIntOrDefault("CLEANUP_TIMEOUT_SEC", 180),
		OperationQueueTimeoutSec: getEnvIntOrDefault("OPERATION_QUEUE_TIMEOUT_SEC", 30),
		MaxConcurrentProvision:   getEnvIntOrDefault("MAX_CONCURRENT_PROVISION", 2),
		MaxConcurrentTestRuns:    getEnvIntOrDefault("MAX_CONCURRENT_TEST_RUNS", 4),
		MaxConcurrentCleanup:     getEnvIntOrDefault("MAX_CONCURRENT_CLEANUP", 4),
	}

	cm.Database = *LoadDatabaseConfig()

	cm.Telemetry = TelemetryConfig{
		Enabled:      getEnvOrDefault("OTEL_ENABLED", "false") == "true",
		ServiceName:  getEnvOrDefault("OTEL_SERVICE_NAME", "cots-runner"),
		CollectorURL: getEnvOrDefault("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
	}

	cm.Janitor = JanitorConfig{
		Enabled:      getEnvBoolOrDefault("JANITOR_ENABLED", false),
		StartupSweep: getEnvBoolOrDefault("JANITOR_STARTUP_SWEEP", true),
		IntervalSec:  getEnvIntOrDefault("JANITOR_INTERVAL_SEC", 900),
		OrphanTTLSec: getEnvIntOrDefault("JANITOR_ORPHAN_TTL_SEC", 900),
		Mode:         getEnvOrDefault("JANITOR_MODE", "ownership_plus_dangling_prune"),
		DryRun:       getEnvBoolOrDefault("JANITOR_DRY_RUN", false),
	}

	cm.WorkflowWorker = WorkflowWorkerConfig{
		Enabled:             getEnvBoolOrDefault("WORKFLOW_WORKER_ENABLED", cm.Database.Type == "sqlite"),
		Concurrency:         getEnvIntOrDefault("WORKFLOW_WORKER_CONCURRENCY", 2),
		ScenarioConcurrency: getEnvIntOrDefault("WORKFLOW_SCENARIO_CONCURRENCY", 2),
		LeaseSeconds:        getEnvIntOrDefault("WORKFLOW_JOB_LEASE_SECONDS", 60),
		HeartbeatSeconds:    getEnvIntOrDefault("WORKFLOW_JOB_HEARTBEAT_SECONDS", 15),
		MaxRecoveries:       getEnvIntOrDefault("WORKFLOW_JOB_MAX_RECOVERIES", 3),
		EventRetentionDays:  getEnvIntOrDefault("WORKFLOW_EVENT_RETENTION_DAYS", 30),
		EncryptionKey:       getEnvOrDefault("WORKFLOW_JOB_ENCRYPTION_KEY", ""),
	}

	if err := cm.Validate(); err != nil {
		return nil, fmt.Errorf("configuration validation failed : %w", err)
	}
	return cm, nil
}

func (cm *ConfigManager) Validate() error {
	if cm.App.Port == "" {
		return fmt.Errorf("PORT cannot be empty")
	}
	validateLogLevels := map[string]bool{
		"debug": true,
		"info":  true,
		"warn":  true,
		"error": true,
	}
	if !validateLogLevels[cm.App.LogLevel] {
		return fmt.Errorf("invalid LOG_LEVEL: %s (must be debug,info,warn,or error)", cm.App.LogLevel)
	}
	if cm.Telemetry.Enabled && cm.Telemetry.CollectorURL == "" {
		return fmt.Errorf("OTEL_EXPORTER_OTLP_ENDPOINT is required when OTEL_ENABLED=true")
	}
	if cm.App.ReadHeaderTimeoutSec <= 0 || cm.App.ReadTimeoutSec <= 0 || cm.App.WriteTimeoutSec <= 0 || cm.App.IdleTimeoutSec <= 0 {
		return fmt.Errorf("server timeout settings must be positive")
	}
	if cm.App.ProvisionTimeoutSec <= 0 || cm.App.TestRunTimeoutSec <= 0 || cm.App.CleanupTimeoutSec <= 0 || cm.App.OperationQueueTimeoutSec <= 0 {
		return fmt.Errorf("operation timeout settings must be positive")
	}
	if cm.App.MaxConcurrentProvision <= 0 || cm.App.MaxConcurrentTestRuns <= 0 || cm.App.MaxConcurrentCleanup <= 0 {
		return fmt.Errorf("concurrency limits must be positive")
	}
	if cm.Janitor.Enabled {
		if cm.Janitor.IntervalSec <= 0 || cm.Janitor.OrphanTTLSec <= 0 {
			return fmt.Errorf("janitor interval and orphan ttl must be positive")
		}
		if cm.Janitor.Mode != "ownership_plus_dangling_prune" {
			return fmt.Errorf("invalid JANITOR_MODE: %s", cm.Janitor.Mode)
		}
	}
	if cm.WorkflowWorker.Enabled {
		if cm.Database.Type != "sqlite" {
			return fmt.Errorf("embedded workflow worker currently requires DB_TYPE=sqlite")
		}
		if cm.WorkflowWorker.EncryptionKey == "" {
			return fmt.Errorf("WORKFLOW_JOB_ENCRYPTION_KEY is required when the workflow worker is enabled")
		}
		if cm.WorkflowWorker.Concurrency <= 0 || cm.WorkflowWorker.ScenarioConcurrency <= 0 || cm.WorkflowWorker.LeaseSeconds <= 0 || cm.WorkflowWorker.HeartbeatSeconds <= 0 || cm.WorkflowWorker.MaxRecoveries <= 0 || cm.WorkflowWorker.EventRetentionDays <= 0 {
			return fmt.Errorf("workflow worker numeric settings must be positive")
		}
		if cm.WorkflowWorker.HeartbeatSeconds >= cm.WorkflowWorker.LeaseSeconds {
			return fmt.Errorf("WORKFLOW_JOB_HEARTBEAT_SECONDS must be less than WORKFLOW_JOB_LEASE_SECONDS")
		}
	}
	return nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvIntOrDefault(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func getEnvBoolOrDefault(key string, defaultValue bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return defaultValue
	}
	return parsed
}

package config

import (
	"fmt"
	"os"
)

type ConfigManager struct {
	App       AppConfig
	Database  DatabaseConfig
	Telemetry TelemetryConfig
}

func NewConfigManager() (*ConfigManager, error) {
	cm := &ConfigManager{}

	cm.App = AppConfig{
		Environment: getEnvOrDefault("APP_ENV", "development"),
		Port:        getEnvOrDefault("PORT", "8080"),
		LogLevel:    getEnvOrDefault("LOG_LEVEL", "info"),
		CORSOrigin:  getEnvOrDefault("CORS_ORIGIN", "http://localhost:3000"),
	}

	cm.Database = *LoadDatabaseConfig()

	cm.Telemetry = TelemetryConfig{
		Enabled:      getEnvOrDefault("OTEL_ENABLED", "false") == "true",
		ServiceName:  getEnvOrDefault("OTEL_SERVICE_NAME", "cots-runner"),
		CollectorURL: getEnvOrDefault("OTEL_EXPORTER_OTLP_ENDPOINT", ""),
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
	return nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

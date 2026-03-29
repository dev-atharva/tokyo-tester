package config

type AppConfig struct {
	Environment string `envconfig:"APP_ENV" default:"development"`
	Port        string `envconfig:"PORT" default:"8080"`
	LogLevel    string `envconfig:"LOG_LEVEL" default:"info"`
	CORSOrigin  string `envconfig:"CORS_ORIGIN" default:"http://localhost:3000"`
}

type TelemetryConfig struct {
	Enabled      bool   `envconfig:"OTEL_ENABLED" default:"false"`
	ServiceName  string `envconfig:"OTEL_SERVICE_NAME" default:"cots-runner"`
	CollectorURL string `envconfig:"OTEL_EXPORTER_OLTP_ENDPOINT"`
}

func (a *AppConfig) IsProduction() bool {
	return a.Environment == "production"
}

func (a *AppConfig) IsDevelopment() bool {
	return a.Environment == "development"
}

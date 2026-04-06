package config

type AppConfig struct {
	Environment              string `envconfig:"APP_ENV" default:"development"`
	Port                     string `envconfig:"PORT" default:"8080"`
	LogLevel                 string `envconfig:"LOG_LEVEL" default:"info"`
	CORSOrigin               string `envconfig:"CORS_ORIGIN" default:"http://localhost:3000"`
	ReadHeaderTimeoutSec     int    `envconfig:"READ_HEADER_TIMEOUT_SEC" default:"10"`
	ReadTimeoutSec           int    `envconfig:"READ_TIMEOUT_SEC" default:"30"`
	WriteTimeoutSec          int    `envconfig:"WRITE_TIMEOUT_SEC" default:"2100"`
	IdleTimeoutSec           int    `envconfig:"IDLE_TIMEOUT_SEC" default:"120"`
	ProvisionTimeoutSec      int    `envconfig:"PROVISION_TIMEOUT_SEC" default:"900"`
	TestRunTimeoutSec        int    `envconfig:"TEST_RUN_TIMEOUT_SEC" default:"1800"`
	CleanupTimeoutSec        int    `envconfig:"CLEANUP_TIMEOUT_SEC" default:"180"`
	OperationQueueTimeoutSec int    `envconfig:"OPERATION_QUEUE_TIMEOUT_SEC" default:"30"`
	MaxConcurrentProvision   int    `envconfig:"MAX_CONCURRENT_PROVISION" default:"2"`
	MaxConcurrentTestRuns    int    `envconfig:"MAX_CONCURRENT_TEST_RUNS" default:"4"`
	MaxConcurrentCleanup     int    `envconfig:"MAX_CONCURRENT_CLEANUP" default:"4"`
}

type TelemetryConfig struct {
	Enabled      bool   `envconfig:"OTEL_ENABLED" default:"false"`
	ServiceName  string `envconfig:"OTEL_SERVICE_NAME" default:"cots-runner"`
	CollectorURL string `envconfig:"OTEL_EXPORTER_OLTP_ENDPOINT"`
}

type JanitorConfig struct {
	Enabled      bool   `envconfig:"JANITOR_ENABLED" default:"false"`
	StartupSweep bool   `envconfig:"JANITOR_STARTUP_SWEEP" default:"true"`
	IntervalSec  int    `envconfig:"JANITOR_INTERVAL_SEC" default:"900"`
	OrphanTTLSec int    `envconfig:"JANITOR_ORPHAN_TTL_SEC" default:"900"`
	Mode         string `envconfig:"JANITOR_MODE" default:"ownership_plus_dangling_prune"`
	DryRun       bool   `envconfig:"JANITOR_DRY_RUN" default:"false"`
}

func (a *AppConfig) IsProduction() bool {
	return a.Environment == "production"
}

func (a *AppConfig) IsDevelopment() bool {
	return a.Environment == "development"
}

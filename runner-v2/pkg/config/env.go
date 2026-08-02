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
	TestRunTimeoutSec        int    `envconfig:"TEST_RUN_TIMEOUT_SEC" default:"0"`
	CleanupTimeoutSec        int    `envconfig:"CLEANUP_TIMEOUT_SEC" default:"180"`
	OperationQueueTimeoutSec int    `envconfig:"OPERATION_QUEUE_TIMEOUT_SEC" default:"30"`
	MaxConcurrentProvision   int    `envconfig:"MAX_CONCURRENT_PROVISION" default:"2"`
	MaxConcurrentTestRuns    int    `envconfig:"MAX_CONCURRENT_TEST_RUNS" default:"4"`
	MaxConcurrentCleanup     int    `envconfig:"MAX_CONCURRENT_CLEANUP" default:"4"`
	ContainerMemoryMB        int    `envconfig:"WORKFLOW_CONTAINER_MEMORY_MB" default:"1024"`
	ContainerCPUMilli        int    `envconfig:"WORKFLOW_CONTAINER_CPU_MILLI" default:"1000"`
	ContainerPIDs            int    `envconfig:"WORKFLOW_CONTAINER_PIDS" default:"256"`
	DisableTestRetries       bool   `envconfig:"DISABLE_TEST_RETRIES" default:"false"`
}

func (a *AppConfig) ContainerResources() ContainerResourceLimits {
	memoryMB := a.ContainerMemoryMB
	if memoryMB <= 0 {
		memoryMB = 1024
	}
	cpuMilli := a.ContainerCPUMilli
	if cpuMilli <= 0 {
		cpuMilli = 1000
	}
	pids := a.ContainerPIDs
	if pids <= 0 {
		pids = 256
	}
	return ContainerResourceLimits{
		MemoryBytes: int64(memoryMB) * 1024 * 1024,
		NanoCPUs:    int64(cpuMilli) * 1_000_000,
		PIDs:        int64(pids),
	}
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

type WorkflowWorkerConfig struct {
	Enabled                     bool   `envconfig:"WORKFLOW_WORKER_ENABLED" default:"true"`
	Concurrency                 int    `envconfig:"WORKFLOW_WORKER_CONCURRENCY" default:"2"`
	ScenarioConcurrency         int    `envconfig:"WORKFLOW_SCENARIO_CONCURRENCY" default:"1"`
	MaxQueuedGlobal             int    `envconfig:"WORKFLOW_MAX_QUEUED_GLOBAL" default:"100"`
	MaxQueuedPerUser            int    `envconfig:"WORKFLOW_MAX_QUEUED_PER_USER" default:"3"`
	MaxQueuedPerProject         int    `envconfig:"WORKFLOW_MAX_QUEUED_PER_PROJECT" default:"10"`
	SubmissionsPerMinuteUser    int    `envconfig:"WORKFLOW_SUBMISSIONS_PER_MINUTE_USER" default:"10"`
	SubmissionsPerMinuteProject int    `envconfig:"WORKFLOW_SUBMISSIONS_PER_MINUTE_PROJECT" default:"60"`
	MaxRunningPerUser           int    `envconfig:"WORKFLOW_MAX_RUNNING_PER_USER" default:"1"`
	MaxRunningPerProject        int    `envconfig:"WORKFLOW_MAX_RUNNING_PER_PROJECT" default:"2"`
	LeaseSeconds                int    `envconfig:"WORKFLOW_JOB_LEASE_SECONDS" default:"60"`
	HeartbeatSeconds            int    `envconfig:"WORKFLOW_JOB_HEARTBEAT_SECONDS" default:"15"`
	MaxRecoveries               int    `envconfig:"WORKFLOW_JOB_MAX_RECOVERIES" default:"3"`
	EventRetentionDays          int    `envconfig:"WORKFLOW_EVENT_RETENTION_DAYS" default:"30"`
	EncryptionKey               string `envconfig:"WORKFLOW_JOB_ENCRYPTION_KEY"`
}

func (a *AppConfig) IsProduction() bool {
	return a.Environment == "production"
}

func (a *AppConfig) IsDevelopment() bool {
	return a.Environment == "development"
}

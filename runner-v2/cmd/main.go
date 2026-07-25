package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/dev-atharva/cots/pkg/api"
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	mysqldb "github.com/dev-atharva/cots/pkg/db/mysql"
	"github.com/dev-atharva/cots/pkg/db/postgres"
	"github.com/dev-atharva/cots/pkg/dockerhealth"
	"github.com/dev-atharva/cots/pkg/janitor"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/sync"
	"github.com/dev-atharva/cots/pkg/telemetry"
	"github.com/joho/godotenv"
)

func main() {
	runMigrations := flag.Bool("migrate", false, "Run DB migrations on startup")
	flag.Parse()
	_ = godotenv.Load()

	cfg, err := config.NewConfigManager()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	log := logger.InitLogger(cfg.App.Environment, cfg.App.LogLevel)
	log.Info("starting COTS runner", "environment", cfg.App.Environment, "log_level", cfg.App.LogLevel, "port", cfg.App.Port)

	if cfg.WorkflowWorker.Enabled || cfg.Janitor.Enabled {
		dockerCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := dockerhealth.Validate(dockerCtx); err != nil {
			cancel()
			log.Error("Docker is required but not reachable at startup", "error", err)
			panic(fmt.Errorf("Docker is required for workflow execution and cleanup: %w", err))
		}
		cancel()
		log.Info("Docker daemon is reachable")
	}

	var tracerProvider *telemetry.TracerProvider
	if cfg.Telemetry.Enabled {
		tracerProvider, err = telemetry.InitTracer(cfg.Telemetry.ServiceName, cfg.Telemetry.CollectorURL)
		if err != nil {
			log.Error("failed to initialize tracing", "error", err)
		} else {
			defer func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := tracerProvider.Shutdown(ctx); err != nil {
					log.Error("failed to shutdown tracer", "error", err)
				}
			}()
			log.Info("Opentelemetry tracing enabled")
		}
	}

	log.Info("database configuration loaded", "db_type", cfg.Database.Type)

	var database db.Database
	switch cfg.Database.Type {
	case "postgres":
		database, err = postgres.NewClient(cfg.Database.URL)
	case "mysql":
		database, err = mysqldb.NewClient(cfg.Database.URL)
	}
	if err != nil {
		log.Error("failed to initialize database", "db_type", cfg.Database.Type, "error", err)
		os.Exit(1)
	}
	log.Info("database initialized", "db_type", cfg.Database.Type)

	if *runMigrations || cfg.WorkflowWorker.Enabled {
		migrator := db.NewMigrator(database, cfg.Database.Type)
		if err := migrator.RunMigrations(); err != nil {
			log.Error("database migrations failed", "error", err)
			os.Exit(1)
		}
		log.Info("database migrations completed")
	} else {
		log.Info("skipping migrations (run with -migrate to enable)")
	}

	syncService := sync.NewService(database)
	syncHandler := sync.NewHandler(syncService)
	log.Info("sync service initialized")
	defer func() {
		if err := database.Close(); err != nil {
			log.Error("error closing database", "error", err)
		}
	}()

	handler := api.NewHandler(database, cfg.App)
	if cfg.WorkflowWorker.Enabled || cfg.Janitor.Enabled {
		handler.SetReadinessCheck(dockerhealth.Validate)
	}
	appCtx, appCancel := context.WithCancel(context.Background())
	defer appCancel()
	var workflowService *api.WorkflowService
	if cfg.WorkflowWorker.Enabled {
		store, ok := database.(db.WorkflowJobStore)
		if !ok {
			log.Error("configured database does not support embedded workflow jobs")
			os.Exit(1)
		}
		workflowService, err = api.NewWorkflowService(handler, database, store, cfg.WorkflowWorker)
		if err != nil {
			log.Error("failed to initialize workflow worker", "error", err)
			os.Exit(1)
		}
		handler.SetWorkflowService(workflowService)
	}
	router := api.NewRouter(handler, syncHandler, cfg.Telemetry.Enabled)

	var janitorService *janitor.Service
	if cfg.Janitor.Enabled || cfg.WorkflowWorker.Enabled {
		janitorService, err = janitor.NewService(database, cfg.Janitor)
		if err != nil {
			if cfg.WorkflowWorker.Enabled {
				log.Error("failed to initialize workflow resource cleaner", "error", err)
				os.Exit(1)
			}
			log.Warn("failed to initialize janitor service", "error", err)
		} else {
			handler.SetSessionResourceCleaner(janitorService)
			defer func() {
				if err := janitorService.Close(); err != nil {
					log.Warn("failed to close janitor service", "error", err)
				}
			}()
			if cfg.Janitor.Enabled {
				go janitorService.Run(appCtx)
				log.Info("Docker janitor started",
					"startup_sweep", cfg.Janitor.StartupSweep,
					"interval_sec", cfg.Janitor.IntervalSec,
					"orphan_ttl_sec", cfg.Janitor.OrphanTTLSec,
					"mode", cfg.Janitor.Mode,
					"dry_run", cfg.Janitor.DryRun,
				)
			}
		}
	} else {
		log.Info("Docker janitor disabled")
	}
	if workflowService != nil {
		workflowService.Start(appCtx)
		log.Info("embedded workflow worker started", "concurrency", cfg.WorkflowWorker.Concurrency, "scenario_concurrency", cfg.WorkflowWorker.ScenarioConcurrency)
	}

	server := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.App.Port),
		Handler:           router,
		ReadHeaderTimeout: time.Duration(cfg.App.ReadHeaderTimeoutSec) * time.Second,
		ReadTimeout:       time.Duration(cfg.App.ReadTimeoutSec) * time.Second,
		WriteTimeout:      time.Duration(cfg.App.WriteTimeoutSec) * time.Second,
		IdleTimeout:       time.Duration(cfg.App.IdleTimeoutSec) * time.Second,
	}

	go func() {
		log.Info("starting the COTS API server", "port", cfg.App.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("failed to start the server", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Info("Shutting down the server gracefully")
	appCancel()
	if workflowService != nil {
		workflowService.Wait()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	log.Info("server stopped successfully")
}

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/dev-atharva/cots/pkg/api"
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/db/postgres"
	"github.com/dev-atharva/cots/pkg/db/sqlite"
	"github.com/dev-atharva/cots/pkg/sync"
)

func main() {
	// ------------------------------
	// Command-line flag to enable migrations
	// ------------------------------
	runMigrations := flag.Bool("migrate", false, "Run DB migrations on startup")
	flag.Parse()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbConfig := config.LoadDatabaseConfig()
	log.Printf("Database type: %s", dbConfig.Type)

	var database db.Database
	var syncHandler *sync.Handler

	if err := dbConfig.Validate(); err == nil {
		var err error

		switch dbConfig.Type {
		case "sqlite":
			dir := filepath.Dir(dbConfig.Path)
			if err := os.MkdirAll(dir, 0755); err != nil {
				log.Printf("Warning: Failed to create data directory : %v", err)
			}
			database, err = sqlite.NewClient(dbConfig.Path)
			if err != nil {
				log.Printf("Warning: Failed to initialize SQlite database : %v", err)
			} else {
				log.Printf("SQlite database initialized at : %s", dbConfig.Path)
			}

		case "postgres":
			database, err = postgres.NewClient(dbConfig.URL)
			if err != nil {
				log.Printf("Warning: Failed to initialize Postgres database: %v", err)
			} else {
				log.Printf("PostgresSQL database initialized")
			}
		}

		if database != nil {
			if *runMigrations {
				migrator := db.NewMigrator(database, dbConfig.Type)
				if err := migrator.RunMigrations(); err != nil {
					log.Printf("Warning: Failed to run migrations : %v", err)
				} else {
					log.Printf("Database migrations completed")
				}
			} else {
				log.Println("Skipping migrations (run with -migrate flag to enable)")
			}

			// Always initialize sync service & handler
			syncService := sync.NewService(database)
			syncHandler = sync.NewHandler(syncService)
			log.Printf("Sync service initialized")

			defer func() {
				if err := database.Close(); err != nil {
					log.Printf("Error closing database : %v", err)
				}
			}()
		}
	} else {
		log.Printf("Database not configured (skipping) : %v", err)
		log.Println("To enable database sync: ")
		log.Println(" For SQlite: export DB_TYPE=sqlite DB_PATH=./data/cots.db")
		log.Println(" For Postgres: export DB_TYPE=postgres DATABASE_URL=postgres://user:pass@host:5432/db")
	}

	handler := api.NewHandler()
	router := api.NewRouter(handler, syncHandler)

	server := &http.Server{
		Addr:    fmt.Sprintf(":%s", port),
		Handler: router,
	}

	go func() {
		log.Printf("Starting the COTS API on port : %s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start the server : %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down the server")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}

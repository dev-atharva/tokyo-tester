package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log"
	"sort"
)

//go:embed migrations/sqlite/*.sql
var sqliteMigrations embed.FS

// //go:embed migrations/postgres/*.sql
var postgresMigrations embed.FS

type Migrator struct {
	conn   *sql.DB
	dbType string
}

func NewMigrator(db Database, dbType string) *Migrator {
	var conn *sql.DB

	switch impl := db.(type) {
	case interface{ GetConnection() *sql.DB }:
		conn = impl.GetConnection()
	default:
		log.Fatal("Database implementation does not support migrations")
	}

	return &Migrator{
		conn:   conn,
		dbType: dbType,
	}
}

func (m *Migrator) RunMigrations() error {
	log.Printf("Running migrations for %s database...", m.dbType)

	var fs embed.FS
	var migrationPath string

	switch m.dbType {
	case "sqlite":
		fs = sqliteMigrations
		migrationPath = "migrations/sqlite"
	case "postgres":
		fs = postgresMigrations
		migrationPath = "migrations/postgres"
	default:
		return fmt.Errorf("unsupported database : %s", m.dbType)
	}

	entries, err := fs.ReadDir(migrationPath)
	if err != nil {
		return fmt.Errorf("failed to read migration directory: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		migrationFile := fmt.Sprintf("%s/%s", migrationPath, entry.Name())
		log.Printf("Applying migrations: %s", entry.Name())

		sqlBytes, err := fs.ReadFile(migrationFile)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", entry.Name(), err)
		}

		ctx := context.Background()
		if _, err := m.conn.ExecContext(ctx, string(sqlBytes)); err != nil {
			return fmt.Errorf("failed to execute the migration %s: %w", entry.Name(), err)
		}
		log.Printf("Applied migrations: %s", entry.Name())
	}
	log.Printf("All migrations applied successfully")
	return nil
}

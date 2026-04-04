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

//go:embed migrations/postgres/*.sql
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

	if err := m.ensureMigrationsTable(); err != nil {
		return fmt.Errorf("failed to ensure migrations table: %w", err)
	}

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
		applied, err := m.isMigrationApplied(entry.Name())
		if err != nil {
			return fmt.Errorf("failed to check migration %s: %w", entry.Name(), err)
		}
		if applied {
			log.Printf("Skipping already applied migration: %s", entry.Name())
			continue
		}
		shouldSkip, err := m.shouldSkipMigration(entry.Name())
		if err != nil {
			return fmt.Errorf("failed to inspect migration %s: %w", entry.Name(), err)
		}
		if shouldSkip {
			if err := m.recordMigration(entry.Name()); err != nil {
				return fmt.Errorf("failed to record skipped migration %s: %w", entry.Name(), err)
			}
			log.Printf("Skipping migration with already-present schema change: %s", entry.Name())
			continue
		}

		log.Printf("Applying migrations: %s", entry.Name())

		sqlBytes, err := fs.ReadFile(migrationFile)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", entry.Name(), err)
		}

		ctx := context.Background()
		tx, err := m.conn.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("failed to start transaction for migration %s: %w", entry.Name(), err)
		}

		if _, err := tx.ExecContext(ctx, string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to execute the migration %s: %w", entry.Name(), err)
		}

		if _, err := tx.ExecContext(ctx, m.insertMigrationQuery(), entry.Name()); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to record migration %s: %w", entry.Name(), err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %s: %w", entry.Name(), err)
		}
		log.Printf("Applied migrations: %s", entry.Name())
	}
	log.Printf("All migrations applied successfully")
	return nil
}

func (m *Migrator) ensureMigrationsTable() error {
	ctx := context.Background()
	_, err := m.conn.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name TEXT PRIMARY KEY,
			applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

func (m *Migrator) isMigrationApplied(name string) (bool, error) {
	ctx := context.Background()
	var exists string
	err := m.conn.QueryRowContext(ctx, m.selectMigrationQuery(), name).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (m *Migrator) shouldSkipMigration(name string) (bool, error) {
	switch name {
	case "002_add_session_version.sql":
		return m.columnExists("sessions", "version")
	case "004_project_scope.sql":
		return m.columnExists("workflows", "project_id")
	default:
		return false, nil
	}
}

func (m *Migrator) columnExists(tableName, columnName string) (bool, error) {
	ctx := context.Background()

	switch m.dbType {
	case "sqlite":
		rows, err := m.conn.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", tableName))
		if err != nil {
			return false, err
		}
		defer rows.Close()

		for rows.Next() {
			var (
				cid        int
				name       string
				columnType string
				notNull    int
				defaultVal sql.NullString
				pk         int
			)
			if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultVal, &pk); err != nil {
				return false, err
			}
			if name == columnName {
				return true, nil
			}
		}
		return false, rows.Err()
	case "postgres":
		var exists bool
		err := m.conn.QueryRowContext(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_name = $1 AND column_name = $2
			)
		`, tableName, columnName).Scan(&exists)
		return exists, err
	default:
		return false, fmt.Errorf("unsupported database type: %s", m.dbType)
	}
}

func (m *Migrator) recordMigration(name string) error {
	ctx := context.Background()
	_, err := m.conn.ExecContext(ctx, m.insertMigrationQuery(), name)
	return err
}

func (m *Migrator) selectMigrationQuery() string {
	if m.dbType == "postgres" {
		return `SELECT name FROM schema_migrations WHERE name = $1`
	}
	return `SELECT name FROM schema_migrations WHERE name = ?`
}

func (m *Migrator) insertMigrationQuery() string {
	if m.dbType == "postgres" {
		return `INSERT INTO schema_migrations (name, applied_at) VALUES ($1, CURRENT_TIMESTAMP)`
	}
	return `INSERT INTO schema_migrations (name, applied_at) VALUES (?, CURRENT_TIMESTAMP)`
}

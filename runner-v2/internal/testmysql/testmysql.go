package testmysql

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/db"
	mysqldb "github.com/dev-atharva/cots/pkg/db/mysql"
	"github.com/google/uuid"
)

var unsafeDatabaseName = regexp.MustCompile(`[^a-zA-Z0-9_]`)

// NewClient creates a unique migrated database on the shared test MySQL server.
// Tests run through `make test` receive MYSQL_TEST_ADMIN_DSN automatically.
func NewClient(t *testing.T, prefix string) *mysqldb.Client {
	t.Helper()

	adminDSN := os.Getenv("MYSQL_TEST_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("MYSQL_TEST_ADMIN_DSN is not set; run tests through make test")
	}

	databaseName := unsafeDatabaseName.ReplaceAllString(prefix, "_") + "_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	admin, err := sql.Open("mysql", adminDSN)
	if err != nil {
		t.Fatalf("open test MySQL administrator connection: %v", err)
	}
	if err := admin.PingContext(context.Background()); err != nil {
		_ = admin.Close()
		t.Fatalf("connect to test MySQL server: %v", err)
	}
	if _, err := admin.ExecContext(context.Background(), fmt.Sprintf("CREATE DATABASE `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci", databaseName)); err != nil {
		_ = admin.Close()
		t.Fatalf("create test MySQL database: %v", err)
	}

	t.Cleanup(func() {
		_, _ = admin.ExecContext(context.Background(), fmt.Sprintf("DROP DATABASE IF EXISTS `%s`", databaseName))
		_ = admin.Close()
	})

	client, err := mysqldb.NewClient(strings.TrimSuffix(adminDSN, "/mysql") + "/" + databaseName)
	if err != nil {
		t.Fatalf("open test MySQL database: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	if err := db.NewMigrator(client, "mysql").RunMigrations(); err != nil {
		t.Fatalf("migrate test MySQL database: %v", err)
	}
	return client
}

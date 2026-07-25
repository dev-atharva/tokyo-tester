package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/db"
	"github.com/google/uuid"
)

func newMySQLIntegrationClient(t *testing.T) *Client {
	t.Helper()
	adminDSN := os.Getenv("MYSQL_TEST_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("MYSQL_TEST_ADMIN_DSN is not set; run tests through make test")
	}
	databaseName := "mysql_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	admin, err := sql.Open("mysql", adminDSN)
	if err != nil {
		t.Fatalf("open test MySQL administrator connection: %v", err)
	}
	if _, err := admin.ExecContext(context.Background(), fmt.Sprintf("CREATE DATABASE `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci", databaseName)); err != nil {
		_ = admin.Close()
		t.Fatalf("create test MySQL database: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.ExecContext(context.Background(), fmt.Sprintf("DROP DATABASE IF EXISTS `%s`", databaseName))
		_ = admin.Close()
	})
	client, err := NewClient(strings.TrimSuffix(adminDSN, "/mysql") + "/" + databaseName)
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	if err := db.NewMigrator(client, "mysql").RunMigrations(); err != nil {
		t.Fatal(err)
	}
	return client
}

func TestNormalizeDSNSupportsURLAndGoDSN(t *testing.T) {
	urlDSN, err := NormalizeDSN("mysql://user:pass@localhost:3307/app?charset=utf8mb4")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(urlDSN, "user:pass@tcp(localhost:3307)/app?") ||
		!strings.Contains(urlDSN, "charset=utf8mb4") ||
		!strings.Contains(urlDSN, "multiStatements=true") ||
		!strings.Contains(urlDSN, "parseTime=true") {
		t.Fatalf("unexpected URL DSN: %s", urlDSN)
	}
	goDSN, err := NormalizeDSN("user:pass@tcp(localhost:3306)/app")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(goDSN, "user:pass@tcp(localhost:3306)/app?") ||
		!strings.Contains(goDSN, "multiStatements=true") ||
		!strings.Contains(goDSN, "parseTime=true") {
		t.Fatalf("unexpected Go DSN: %s", goDSN)
	}
}

package mysql

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/db"
	"github.com/testcontainers/testcontainers-go"
	mysqlmodule "github.com/testcontainers/testcontainers-go/modules/mysql"
)

func newMySQLIntegrationClient(t *testing.T) *Client {
	t.Helper()
	if os.Getenv("RUN_MYSQL_INTEGRATION") != "1" {
		t.Skip("set RUN_MYSQL_INTEGRATION=1 to run MySQL database integration tests")
	}
	testcontainers.SkipIfProviderIsNotHealthy(t)

	ctx := context.Background()
	container, err := mysqlmodule.Run(
		ctx,
		"mysql:8.0.36",
		mysqlmodule.WithDatabase("tokyo_tester"),
		mysqlmodule.WithUsername("tokyo"),
		mysqlmodule.WithPassword("tokyo"),
	)
	testcontainers.CleanupContainer(t, container)
	if err != nil {
		t.Fatalf("start mysql container: %v", err)
	}
	dsn, err := container.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("mysql connection string: %v", err)
	}
	client, err := NewClient(dsn)
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

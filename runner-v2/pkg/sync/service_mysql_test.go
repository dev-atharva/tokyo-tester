package sync

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
	mysqldb "github.com/dev-atharva/cots/pkg/db/mysql"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
	mysqlmodule "github.com/testcontainers/testcontainers-go/modules/mysql"
)

func TestProcessBatchWithMySQL(t *testing.T) {
	if os.Getenv("RUN_MYSQL_INTEGRATION") != "1" {
		t.Skip("set RUN_MYSQL_INTEGRATION=1 to run MySQL sync integration tests")
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
	client, err := mysqldb.NewClient(dsn)
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	if err := db.NewMigrator(client, "mysql").RunMigrations(); err != nil {
		t.Fatal(err)
	}

	service := NewService(client)
	now := time.Now().UTC().Truncate(time.Second)
	workflowPayload := types.WorkflowData{
		ID: "wf-mysql", UserID: "user-1", ProjectID: "project-1", Name: "MySQL Workflow",
		NodesConfig: rawJSON(t, []any{}), EdgesConfig: rawJSON(t, []any{}), Metadata: rawJSON(t, map[string]any{}),
		Version: 1, CreatedAt: now, UpdatedAt: now, ClientID: "client-1",
	}
	change := newSyncChange(t, "workflow", workflowPayload.ID, "insert", workflowPayload, now)
	change.ClientVersion = 0
	response, err := service.ProcessBatch(ctx, &types.SyncBatchRequest{
		ClientID: "client-1", UserID: "user-1", ProjectID: "project-1", TimeStamp: now,
		Changes: []types.SyncChange{change},
	})
	if err != nil || !response.Success {
		t.Fatalf("ProcessBatch failed: response=%+v error=%v", response, err)
	}
	stored, err := client.GetWorkflow(ctx, workflowPayload.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.ProjectID != workflowPayload.ProjectID || stored.Name != workflowPayload.Name {
		t.Fatalf("unexpected workflow stored in mysql: %+v", stored)
	}
}

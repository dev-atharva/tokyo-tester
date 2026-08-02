package config

import "testing"

func TestDisableTestRetriesEnvironmentSwitch(t *testing.T) {
	t.Setenv("DB_TYPE", "mysql")
	t.Setenv("DATABASE_URL", "tokyo:password@tcp(localhost:3306)/tokyo_runner")
	t.Setenv("WORKFLOW_WORKER_ENABLED", "false")
	t.Setenv("DISABLE_TEST_RETRIES", "true")

	manager, err := NewConfigManager()
	if err != nil {
		t.Fatal(err)
	}
	if !manager.App.DisableTestRetries {
		t.Fatal("DISABLE_TEST_RETRIES=true was not loaded")
	}
}

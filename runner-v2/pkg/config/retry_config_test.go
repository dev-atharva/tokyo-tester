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

func TestChromiumSandboxCanOnlyBeDisabledOutsideProduction(t *testing.T) {
	t.Setenv("DB_TYPE", "mysql")
	t.Setenv("DATABASE_URL", "tokyo:password@tcp(localhost:3306)/tokyo_runner")
	t.Setenv("WORKFLOW_WORKER_ENABLED", "false")
	t.Setenv("APP_ENV", "production")
	t.Setenv("BROWSER_CHROMIUM_SANDBOX", "false")
	if _, err := NewConfigManager(); err == nil {
		t.Fatal("production accepted a disabled Chromium sandbox")
	}
	t.Setenv("APP_ENV", "development")
	manager, err := NewConfigManager()
	if err != nil {
		t.Fatal(err)
	}
	if manager.App.BrowserChromiumSandbox {
		t.Fatal("development override was not loaded")
	}
}

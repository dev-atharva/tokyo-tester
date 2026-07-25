package config

import "testing"

func TestDatabaseConfigDefaultsToMySQL(t *testing.T) {
	t.Setenv("DB_TYPE", "")
	t.Setenv("DATABASE_URL", "tokyo:password@tcp(localhost:3306)/tokyo_runner")

	config := LoadDatabaseConfig()
	if config.Type != "mysql" {
		t.Fatalf("expected mysql default, got %q", config.Type)
	}
	if err := config.Validate(); err != nil {
		t.Fatalf("expected default MySQL config to validate: %v", err)
	}
}

func TestDatabaseConfigRejectsRemovedBackends(t *testing.T) {
	config := &DatabaseConfig{Type: "sqlite", URL: "unused"}
	if err := config.Validate(); err == nil {
		t.Fatal("expected removed database backend to be rejected")
	}
}

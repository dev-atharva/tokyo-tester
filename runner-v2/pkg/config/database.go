package config

import (
	"fmt"
	"os"
)

type DatabaseConfig struct {
	Type string
	URL  string
}

func LoadDatabaseConfig() *DatabaseConfig {
	dbType := os.Getenv("DB_TYPE")
	if dbType == "" {
		dbType = "mysql"
	}

	dbUrl := os.Getenv("DATABASE_URL")
	return &DatabaseConfig{
		Type: dbType,
		URL:  dbUrl,
	}
}

func (c *DatabaseConfig) Validate() error {
	switch c.Type {
	case "postgres":
		if c.URL == "" {
			return fmt.Errorf("DATABASE_URL must be set for postgres")
		}
	case "mysql":
		if c.URL == "" {
			return fmt.Errorf("DATABASE_URL must be set for mysql")
		}
	default:
		return fmt.Errorf("unsupported database type: %s (must be 'mysql' or 'postgres')", c.Type)
	}
	return nil
}

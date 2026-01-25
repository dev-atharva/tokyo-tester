package config

import (
	"fmt"
	"os"
)

type DatabaseConfig struct {
	Type string
	Path string
	URL  string
}

func LoadDatabaseConfig() *DatabaseConfig {
	dbType := os.Getenv("DB_TYPE")
	if dbType == "" {
		dbType = "sqlite"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/cots.db"
	}

	dbUrl := os.Getenv("DATABASE_URL")
	return &DatabaseConfig{
		Type: dbType,
		Path: dbPath,
		URL:  dbUrl,
	}
}

func (c *DatabaseConfig) Validate() error {
	switch c.Type {
	case "sqlite":
		if c.Path == "" {
			return fmt.Errorf("DB_PATH must be set for sqlite")
		}
	case "postgres":
		if c.URL == "" {
			return fmt.Errorf("DATABASE_URL must be set for postgres")
		}
	default:
		return fmt.Errorf("unsupported database type : %s (must be 'sqlite' or 'postgres')", c.Type)
	}
	return nil
}

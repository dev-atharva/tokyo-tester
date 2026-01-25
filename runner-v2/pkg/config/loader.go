package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Utlity function to laod from yaml file
func loadFromYaml(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file , %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to load thge yaml file , %w", err)
	}

	if err := validateConfig(&cfg); err != nil {
		return nil, fmt.Errorf("invalid configuration is created, %w", err)
	}
	return &cfg, nil
}

// Basic validation
func validateConfig(cfg *Config) error {
	serviceNames := make(map[string]bool)
	for _, service := range cfg.Services {
		if service.Name == "" {
			return fmt.Errorf("service name is empty")
		}
		if serviceNames[service.Name] {
			return fmt.Errorf("dupliacte service name , %s", service.Name)
		}
		serviceNames[service.Name] = true

		if service.Type == "" {
			return fmt.Errorf("service %s: type cannot be empty", service.Type)
		}
		if service.Type == "generic" && service.Image == "" {
			return fmt.Errorf("service %s: is generic and cannot have an empty image", service.Name)
		}
	}

	testNames := make(map[string]bool)
	for _, test := range cfg.Tests {
		if test.Name == "" {
			return fmt.Errorf("test name cannot be empty")
		}
		if testNames[test.Name] {
			return fmt.Errorf("dupliacte test name , %s", test.Name)
		}
		testNames[test.Name] = true
	}
	return nil
}

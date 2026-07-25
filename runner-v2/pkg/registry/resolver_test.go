package registry

import (
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
)

func TestResolveImageNamePreservesNestedRepositoryPath(t *testing.T) {
	tests := []struct {
		name     string
		registry string
		image    string
		want     string
	}{
		{
			name:     "relative nested repository",
			registry: "registry.example.com:5000",
			image:    "team/platform/payments/api:v1",
			want:     "registry.example.com:5000/team/platform/payments/api:v1",
		},
		{
			name:     "already qualified nested repository",
			registry: "ghcr.io",
			image:    "ghcr.io/acme/platform/payments/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			want:     "ghcr.io/acme/platform/payments/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		},
		{
			name:     "localhost registry",
			registry: "localhost:5000",
			image:    "engineering/api:dev",
			want:     "localhost:5000/engineering/api:dev",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ResolveImageNameChecked(tt.image, &config.RegistryConfig{URL: tt.registry})
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Fatalf("ResolveImageName() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestResolveImageNameRejectsUnsafeOrMismatchedRegistry(t *testing.T) {
	tests := []struct {
		name     string
		registry string
		image    string
	}{
		{name: "protocol", registry: "https://ghcr.io", image: "acme/api:v1"},
		{name: "path in registry", registry: "ghcr.io/acme", image: "api:v1"},
		{name: "registry mismatch", registry: "ghcr.io", image: "registry.example.com/acme/api:v1"},
		{name: "invalid image", registry: "ghcr.io", image: "acme/UPPERCASE:v1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := ResolveImageNameChecked(tt.image, &config.RegistryConfig{URL: tt.registry}); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

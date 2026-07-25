package registry

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/docker/docker/api/types/image"
	dockerregistry "github.com/docker/docker/api/types/registry"
)

type recordingImagePuller struct {
	image   string
	options image.PullOptions
	stream  string
	err     error
}

func (p *recordingImagePuller) ImagePull(_ context.Context, imageName string, options image.PullOptions) (io.ReadCloser, error) {
	p.image = imageName
	p.options = options
	if p.err != nil {
		return nil, p.err
	}
	return io.NopCloser(strings.NewReader(p.stream)), nil
}

func TestPullImagePassesCredentialsOnThePullRequest(t *testing.T) {
	puller := &recordingImagePuller{stream: "{\"status\":\"Pull complete\"}\n"}
	reg := &config.RegistryConfig{
		URL:      "registry.example.com:5000",
		AuthType: "basic",
		Username: "runner-user",
		Password: "pull-only-secret",
	}

	resolved, err := PullImage(context.Background(), puller, "team/platform/api:v1", reg)
	if err != nil {
		t.Fatal(err)
	}
	if resolved != "registry.example.com:5000/team/platform/api:v1" || puller.image != resolved {
		t.Fatalf("pulled image = %q, resolved = %q", puller.image, resolved)
	}

	payload, err := base64.URLEncoding.DecodeString(puller.options.RegistryAuth)
	if err != nil {
		t.Fatal(err)
	}
	var auth dockerregistry.AuthConfig
	if err := json.Unmarshal(payload, &auth); err != nil {
		t.Fatal(err)
	}
	if auth.ServerAddress != reg.URL || auth.Username != reg.Username || auth.Password != reg.Password {
		t.Fatalf("unexpected pull auth: server=%q username=%q", auth.ServerAddress, auth.Username)
	}
}

func TestPullImageFailsClosedAndRedactsCredentials(t *testing.T) {
	reg := &config.RegistryConfig{
		URL:      "registry.example.com",
		AuthType: "basic",
		Username: "runner-user",
		Password: "do-not-log-this",
	}
	puller := &recordingImagePuller{
		stream: `{"errorDetail":{"message":"denied for do-not-log-this"},"error":"denied for do-not-log-this"}` + "\n",
	}

	_, err := PullImage(context.Background(), puller, "private/api:v1", reg)
	if err == nil {
		t.Fatal("expected registry pull to fail")
	}
	if strings.Contains(err.Error(), reg.Password) {
		t.Fatalf("registry error leaked the password: %v", err)
	}
}

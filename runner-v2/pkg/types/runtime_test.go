package types

import "testing"

func TestAddressableHost(t *testing.T) {
	for input, want := range map[string]string{
		"localhost": "127.0.0.1", "127.0.0.1": "127.0.0.1", "0.0.0.0": "127.0.0.1",
		"::1": "127.0.0.1", "[::1]": "127.0.0.1", "::": "127.0.0.1", "docker.example": "docker.example",
	} {
		if got := AddressableHost(input); got != want {
			t.Errorf("AddressableHost(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestServiceRuntimeEndpoint(t *testing.T) {
	runtime := &ServiceRuntime{Name: "api", Host: "localhost", MappedPorts: map[string]string{"8080": "49152"}}
	got, err := runtime.Endpoint("8080")
	if err != nil || got != "127.0.0.1:49152" {
		t.Fatalf("Endpoint() = (%q, %v)", got, err)
	}
	if _, err := runtime.Endpoint("80"); err == nil {
		t.Fatal("expected missing port error")
	}
}

func TestNormalizeRuntimeAddresses(t *testing.T) {
	address, err := NormalizeHostPort("[::1]:9092")
	if err != nil || address != "127.0.0.1:9092" {
		t.Fatalf("NormalizeHostPort() = (%q, %v)", address, err)
	}
	rawURL, err := NormalizeURLHost("amqp://guest:guest@[::1]:5672/")
	if err != nil || rawURL != "amqp://guest:guest@127.0.0.1:5672/" {
		t.Fatalf("NormalizeURLHost() = (%q, %v)", rawURL, err)
	}
}

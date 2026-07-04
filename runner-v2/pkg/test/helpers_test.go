package test

import (
	"encoding/json"
	"testing"
)

func TestLookupConfigValueAliasesAndConflicts(t *testing.T) {
	tests := []struct {
		name    string
		config  map[string]any
		want    any
		wantErr bool
	}{
		{name: "canonical", config: map[string]any{"expected_count": 2}, want: 2},
		{name: "camel alias", config: map[string]any{"expectedCount": 3}, want: 3},
		{name: "equivalent duplicates", config: map[string]any{"expected_count": 4, "expectedCount": float64(4)}, want: 4},
		{name: "conflicting duplicates", config: map[string]any{"expected_count": 4, "expectedCount": 5}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, found, err := lookupConfigValue(tt.config, "expected_count")
			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if !found || got != tt.want {
				t.Fatalf("got (%v, %v), want (%v, true)", got, found, tt.want)
			}
		})
	}
	if _, found, err := lookupConfigValue(map[string]any{"expected_count": nil}, "expected_count"); err != nil || found {
		t.Fatalf("nil value should be treated as absent, got found=%v err=%v", found, err)
	}
}

func TestConfigValueCoercion(t *testing.T) {
	for name, value := range map[string]any{
		"int": int(2), "int32": int32(2), "int64": int64(2), "float": float64(2),
		"json number": json.Number("2"), "string": "2", "decimal string": "2.0",
	} {
		t.Run(name, func(t *testing.T) {
			got, err := getIntOrDefault(map[string]any{"expectedCount": value}, "expected_count", 1)
			if err != nil || got != 2 {
				t.Fatalf("got (%d, %v), want (2, nil)", got, err)
			}
		})
	}

	for name, value := range map[string]any{
		"bool": true, "string": "true", "numeric string": "1", "json number": json.Number("1"), "number": float64(1),
	} {
		t.Run("bool "+name, func(t *testing.T) {
			got, err := getBoolOrDefault(map[string]any{"expectedExists": value}, "expected_exists", false)
			if err != nil || !got {
				t.Fatalf("got (%v, %v), want (true, nil)", got, err)
			}
		})
	}

	if _, err := getIntOrDefault(map[string]any{"expectedCount": 1.5}, "expected_count", 1); err == nil {
		t.Fatal("expected fractional integer to fail")
	}
	if _, err := getBoolOrDefault(map[string]any{"expectedExists": 2}, "expected_exists", false); err == nil {
		t.Fatal("expected non-binary boolean to fail")
	}
}

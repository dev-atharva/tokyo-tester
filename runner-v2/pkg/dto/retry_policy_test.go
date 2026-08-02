package dto

import "testing"

func TestRetryPolicyValidationAndTranslation(t *testing.T) {
	for _, test := range []struct {
		name    string
		dto     TestDTO
		wantErr bool
	}{
		{name: "omitted defaults", dto: TestDTO{Name: "get", Type: "http"}},
		{name: "explicit transient", dto: TestDTO{Name: "get", Type: "http", RetryPolicy: &RetryPolicyDTO{Mode: "transient"}}},
		{name: "never", dto: TestDTO{Name: "get", Type: "http", RetryPolicy: &RetryPolicyDTO{Mode: "never"}}},
		{name: "never cannot confirm", dto: TestDTO{Name: "post", Type: "http", RetryPolicy: &RetryPolicyDTO{Mode: "never", IdempotencyConfirmed: true}}, wantErr: true},
		{name: "delay cannot confirm", dto: TestDTO{Name: "wait", Type: "delay", RetryPolicy: &RetryPolicyDTO{Mode: "transient", IdempotencyConfirmed: true}}, wantErr: true},
		{name: "invalid mode", dto: TestDTO{Name: "get", Type: "http", RetryPolicy: &RetryPolicyDTO{Mode: "always"}}, wantErr: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := test.dto.ValidateRetryPolicy()
			if (err != nil) != test.wantErr {
				t.Fatalf("validation error=%v, wantErr=%v", err, test.wantErr)
			}
			if err == nil && test.dto.ToConfig().RetryPolicy.EffectiveMode() == "" {
				t.Fatal("translated retry policy has no effective mode")
			}
		})
	}
}

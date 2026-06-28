package workflowrun

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func TestPayloadCipherRoundTrip(t *testing.T) {
	key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
	cipher, err := NewPayloadCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	payload := []byte(`{"token":"secret"}`)
	encrypted, nonce, err := cipher.Encrypt(payload)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encrypted, []byte("secret")) {
		t.Fatal("ciphertext contains plaintext secret")
	}
	decrypted, err := cipher.Decrypt(encrypted, nonce)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decrypted, payload) {
		t.Fatalf("decrypted payload = %q, want %q", decrypted, payload)
	}
}

func TestPayloadCipherRejectsInvalidKeyLength(t *testing.T) {
	_, err := NewPayloadCipher(base64.StdEncoding.EncodeToString([]byte("short")))
	if err == nil {
		t.Fatal("expected invalid key length error")
	}
}

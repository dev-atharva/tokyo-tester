package workflowrun

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
)

type PayloadCipher struct {
	aead cipher.AEAD
}

func NewPayloadCipher(encodedKey string) (*PayloadCipher, error) {
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("decode workflow encryption key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("workflow encryption key must decode to exactly 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &PayloadCipher{aead: aead}, nil
}

func (c *PayloadCipher) Encrypt(plaintext []byte) (ciphertext, nonce []byte, err error) {
	nonce = make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	return c.aead.Seal(nil, nonce, plaintext, nil), nonce, nil
}

func (c *PayloadCipher) Decrypt(ciphertext, nonce []byte) ([]byte, error) {
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt workflow payload: %w", err)
	}
	return plaintext, nil
}

func HashPayload(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

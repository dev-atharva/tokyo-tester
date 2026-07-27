package mcpserver

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const validationReceiptTTL = 15 * time.Minute

type validationReceiptClaims struct {
	BundleDigest string `json:"bundleDigest"`
	ExpiresAt    int64  `json:"expiresAt"`
}

func (s *Server) issueValidationReceipt(bundle any, now time.Time) (string, error) {
	digest, err := bundleDigest(bundle)
	if err != nil {
		return "", err
	}
	claims := validationReceiptClaims{BundleDigest: digest, ExpiresAt: now.Add(validationReceiptTTL).Unix()}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(s.internalSecret))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (s *Server) verifyValidationReceipt(receipt string, bundle any, now time.Time) error {
	parts := strings.Split(receipt, ".")
	if len(parts) != 2 {
		return fmt.Errorf("validationReceipt is malformed; validate the workflow again")
	}
	providedSignature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("validationReceipt is malformed; validate the workflow again")
	}
	mac := hmac.New(sha256.New, []byte(s.internalSecret))
	_, _ = mac.Write([]byte(parts[0]))
	if !hmac.Equal(providedSignature, mac.Sum(nil)) {
		return fmt.Errorf("validationReceipt is invalid; validate the workflow again")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("validationReceipt is malformed; validate the workflow again")
	}
	var claims validationReceiptClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return fmt.Errorf("validationReceipt is malformed; validate the workflow again")
	}
	if now.Unix() >= claims.ExpiresAt {
		return fmt.Errorf("validationReceipt has expired; validate the workflow again")
	}
	digest, err := bundleDigest(bundle)
	if err != nil || !hmac.Equal([]byte(claims.BundleDigest), []byte(digest)) {
		return fmt.Errorf("validationReceipt does not match this bundle; validate the workflow again")
	}
	return nil
}

func bundleDigest(bundle any) (string, error) {
	payload, err := json.Marshal(bundle)
	if err != nil {
		return "", fmt.Errorf("encode workflow bundle: %w", err)
	}
	digest := sha256.Sum256(payload)
	return base64.RawURLEncoding.EncodeToString(digest[:]), nil
}

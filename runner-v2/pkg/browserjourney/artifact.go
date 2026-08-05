package browserjourney

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	maxManifestBytes   = int64(256 << 10)
	maxScreenshotBytes = int64(4 << 20)
	maxTraceBytes      = int64(25 << 20)
	maxTotalBytes      = int64(32 << 20)
)

type ArtifactSink interface {
	Store(context.Context, ArtifactContext, string, string, io.Reader, int64) (ArtifactReference, error)
}

type FileArtifactSink struct {
	Root      string
	Retention time.Duration
	Metadata  ArtifactMetadataStore
}

type ArtifactRecord struct {
	ArtifactReference
	ProjectID     string
	WorkflowRunID string
	ScenarioRunID string
	StorageKey    string
}

type ArtifactMetadataStore interface {
	CreateJourneyArtifact(context.Context, ArtifactRecord) error
}

type ArtifactCatalog interface {
	ArtifactMetadataStore
	GetJourneyArtifact(context.Context, string, string, string) (ArtifactRecord, error)
	DeleteExpiredJourneyArtifacts(context.Context, time.Time) ([]ArtifactRecord, error)
}

func (s *FileArtifactSink) OpenAuthorized(ctx context.Context, artifactID, projectID, workflowRunID string) (ArtifactRecord, *os.File, error) {
	catalog, ok := s.Metadata.(ArtifactCatalog)
	if !ok {
		return ArtifactRecord{}, nil, fmt.Errorf("artifact catalog is unavailable")
	}
	record, err := catalog.GetJourneyArtifact(ctx, artifactID, projectID, workflowRunID)
	if err != nil {
		return ArtifactRecord{}, nil, err
	}
	if time.Now().UTC().After(record.ExpiresAt) {
		return ArtifactRecord{}, nil, os.ErrNotExist
	}
	path, err := s.resolveStorageKey(record.StorageKey)
	if err != nil {
		return ArtifactRecord{}, nil, err
	}
	file, err := os.Open(path)
	if err != nil {
		return ArtifactRecord{}, nil, err
	}
	return record, file, nil
}

func (s *FileArtifactSink) PruneExpired(ctx context.Context, cutoff time.Time) error {
	catalog, ok := s.Metadata.(ArtifactCatalog)
	if !ok {
		return nil
	}
	records, err := catalog.DeleteExpiredJourneyArtifacts(ctx, cutoff)
	if err != nil {
		return err
	}
	for _, record := range records {
		path, resolveErr := s.resolveStorageKey(record.StorageKey)
		if resolveErr == nil {
			_ = os.Remove(path)
		}
	}
	return nil
}

func (s *FileArtifactSink) resolveStorageKey(key string) (string, error) {
	root, err := filepath.Abs(s.Root)
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Join(root, filepath.Clean(key)))
	if err != nil {
		return "", err
	}
	if path != root && !strings.HasPrefix(path, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("artifact storage key escapes its root")
	}
	return path, nil
}

func (s *FileArtifactSink) Store(ctx context.Context, scope ArtifactContext, kind, contentType string, source io.Reader, limit int64) (ArtifactReference, error) {
	if s == nil || strings.TrimSpace(s.Root) == "" {
		return ArtifactReference{}, fmt.Errorf("artifact directory is not configured")
	}
	if limit <= 0 {
		return ArtifactReference{}, fmt.Errorf("artifact limit must be positive")
	}
	id := uuid.NewString()
	scopeHash := sha256.Sum256([]byte(scope.ProjectID + "\x00" + scope.WorkflowRunID + "\x00" + scope.ScenarioRunID))
	scopeKey := hex.EncodeToString(scopeHash[:])
	storageKey := filepath.Join(scopeKey[:2], scopeKey, id)
	finalPath := filepath.Join(s.Root, storageKey)
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o700); err != nil {
		return ArtifactReference{}, err
	}
	temporary, err := os.CreateTemp(filepath.Dir(finalPath), ".artifact-*")
	if err != nil {
		return ArtifactReference{}, err
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		_ = temporary.Close()
		if !committed {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return ArtifactReference{}, err
	}
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(temporary, hash), io.LimitReader(source, limit+1))
	if err != nil {
		return ArtifactReference{}, err
	}
	if written > limit {
		return ArtifactReference{}, fmt.Errorf("%s artifact exceeds %d bytes", kind, limit)
	}
	if err := temporary.Sync(); err != nil {
		return ArtifactReference{}, err
	}
	if err := temporary.Close(); err != nil {
		return ArtifactReference{}, err
	}
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		return ArtifactReference{}, err
	}
	committed = true
	now := time.Now().UTC()
	retention := s.Retention
	if retention <= 0 {
		retention = 30 * 24 * time.Hour
	}
	reference := ArtifactReference{ArtifactID: id, Kind: kind, ContentType: contentType, SizeBytes: written, SHA256: hex.EncodeToString(hash.Sum(nil)), CreatedAt: now, ExpiresAt: now.Add(retention)}
	if s.Metadata != nil {
		record := ArtifactRecord{ArtifactReference: reference, ProjectID: scope.ProjectID, WorkflowRunID: scope.WorkflowRunID, ScenarioRunID: scope.ScenarioRunID, StorageKey: storageKey}
		if err := s.Metadata.CreateJourneyArtifact(ctx, record); err != nil {
			_ = os.Remove(finalPath)
			return ArtifactReference{}, err
		}
	}
	return reference, nil
}

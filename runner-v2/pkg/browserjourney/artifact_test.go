package browserjourney

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"testing"
	"time"
)

type memoryArtifactCatalog struct{ records map[string]ArtifactRecord }

func (m *memoryArtifactCatalog) CreateJourneyArtifact(_ context.Context, record ArtifactRecord) error {
	if m.records == nil {
		m.records = map[string]ArtifactRecord{}
	}
	m.records[record.ArtifactID] = record
	return nil
}
func (m *memoryArtifactCatalog) GetJourneyArtifact(_ context.Context, id, projectID, workflowRunID string) (ArtifactRecord, error) {
	record, ok := m.records[id]
	if !ok || record.ProjectID != projectID || record.WorkflowRunID != workflowRunID {
		return ArtifactRecord{}, fmt.Errorf("not found")
	}
	return record, nil
}
func (m *memoryArtifactCatalog) DeleteExpiredJourneyArtifacts(_ context.Context, cutoff time.Time) ([]ArtifactRecord, error) {
	var deleted []ArtifactRecord
	for id, record := range m.records {
		if !record.ExpiresAt.After(cutoff) {
			deleted = append(deleted, record)
			delete(m.records, id)
		}
	}
	return deleted, nil
}

func TestFileArtifactSinkStoresAtomicallyAndAuthorizesByProjectAndRun(t *testing.T) {
	catalog := &memoryArtifactCatalog{}
	sink := &FileArtifactSink{Root: t.TempDir(), Retention: time.Hour, Metadata: catalog}
	scope := ArtifactContext{ProjectID: "project-a", WorkflowRunID: "run-a", ScenarioRunID: "scenario-run-a"}
	content := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, []byte("image")...)
	reference, err := sink.Store(context.Background(), scope, "screenshot", "image/png", bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatal(err)
	}
	if reference.SizeBytes != int64(len(content)) || reference.SHA256 == "" {
		t.Fatalf("reference = %+v", reference)
	}
	_, file, err := sink.OpenAuthorized(context.Background(), reference.ArtifactID, "project-a", "run-a")
	if err != nil {
		t.Fatal(err)
	}
	loaded, _ := io.ReadAll(file)
	_ = file.Close()
	if !bytes.Equal(loaded, content) {
		t.Fatalf("content = %x", loaded)
	}
	if _, _, err := sink.OpenAuthorized(context.Background(), reference.ArtifactID, "project-b", "run-a"); err == nil {
		t.Fatal("cross-project artifact access succeeded")
	}
}

func TestFileArtifactSinkRejectsOversizedContentWithoutMetadata(t *testing.T) {
	catalog := &memoryArtifactCatalog{}
	sink := &FileArtifactSink{Root: t.TempDir(), Metadata: catalog}
	if _, err := sink.Store(context.Background(), ArtifactContext{ProjectID: "p", WorkflowRunID: "r", ScenarioRunID: "s"}, "screenshot", "image/png", bytes.NewReader([]byte("too large")), 2); err == nil {
		t.Fatal("oversized artifact was stored")
	}
	if len(catalog.records) != 0 {
		t.Fatalf("metadata was created: %+v", catalog.records)
	}
}

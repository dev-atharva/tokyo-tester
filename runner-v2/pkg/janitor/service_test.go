package janitor

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/docker/docker/api/types/build"
	containerTypes "github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	imageTypes "github.com/docker/docker/api/types/image"
	networkTypes "github.com/docker/docker/api/types/network"
	volumeTypes "github.com/docker/docker/api/types/volume"
)

type fakeStore struct {
	sessions        map[string]*db.Session
	backendSessions map[string]*db.Session
	err             error
}

func (f *fakeStore) GetSession(ctx context.Context, id string) (*db.Session, error) {
	if f.err != nil {
		return nil, f.err
	}
	if sess, ok := f.sessions[id]; ok {
		return sess, nil
	}
	return nil, errors.New("session not found")
}

func (f *fakeStore) GetSessionByBackendSessionID(ctx context.Context, backendSessionID string) (*db.Session, error) {
	if f.err != nil {
		return nil, f.err
	}
	if sess, ok := f.backendSessions[backendSessionID]; ok {
		return sess, nil
	}
	return nil, errors.New("session not found")
}

type fakeDocker struct {
	containers        []containerTypes.Summary
	networks          []networkTypes.Summary
	removedContainers []string
	removedNetworks   []string
	imagePruneCalls   int
	volumePruneCalls  int
	cachePruneCalls   int
	imagePruneFilter  filters.Args
	volumePruneFilter filters.Args
	cachePruneOptions build.CachePruneOptions
}

func (f *fakeDocker) ContainerList(ctx context.Context, options containerTypes.ListOptions) ([]containerTypes.Summary, error) {
	return f.containers, nil
}

func (f *fakeDocker) ContainerRemove(ctx context.Context, containerID string, options containerTypes.RemoveOptions) error {
	f.removedContainers = append(f.removedContainers, containerID)
	return nil
}

func (f *fakeDocker) NetworkList(ctx context.Context, options networkTypes.ListOptions) ([]networkTypes.Summary, error) {
	return f.networks, nil
}

func (f *fakeDocker) NetworkRemove(ctx context.Context, networkID string) error {
	f.removedNetworks = append(f.removedNetworks, networkID)
	return nil
}

func (f *fakeDocker) ImagesPrune(ctx context.Context, pruneFilters filters.Args) (imageTypes.PruneReport, error) {
	f.imagePruneCalls++
	f.imagePruneFilter = pruneFilters
	return imageTypes.PruneReport{SpaceReclaimed: 100}, nil
}

func (f *fakeDocker) VolumesPrune(ctx context.Context, pruneFilters filters.Args) (volumeTypes.PruneReport, error) {
	f.volumePruneCalls++
	f.volumePruneFilter = pruneFilters
	return volumeTypes.PruneReport{SpaceReclaimed: 200}, nil
}

func (f *fakeDocker) BuildCachePrune(ctx context.Context, opts build.CachePruneOptions) (*build.CachePruneReport, error) {
	f.cachePruneCalls++
	f.cachePruneOptions = opts
	return &build.CachePruneReport{SpaceReclaimed: 300}, nil
}

func (f *fakeDocker) Close() error {
	return nil
}

func TestCleanupSessionResourcesRemovesContainersBeforeNetworks(t *testing.T) {
	docker := &fakeDocker{
		containers: []containerTypes.Summary{{ID: "container-recovery"}},
		networks:   []networkTypes.Summary{{ID: "network-recovery"}},
	}
	service := &Service{cfg: config.JanitorConfig{}, docker: docker}

	if err := service.CleanupSessionResources(context.Background(), "scenario-run-1"); err != nil {
		t.Fatal(err)
	}
	if len(docker.removedContainers) != 1 || docker.removedContainers[0] != "container-recovery" {
		t.Fatalf("unexpected removed containers: %v", docker.removedContainers)
	}
	if len(docker.removedNetworks) != 1 || docker.removedNetworks[0] != "network-recovery" {
		t.Fatalf("unexpected removed networks: %v", docker.removedNetworks)
	}
}

func TestCleanupSessionResourcesRejectsDryRunRecovery(t *testing.T) {
	service := &Service{cfg: config.JanitorConfig{DryRun: true}, docker: &fakeDocker{}}
	if err := service.CleanupSessionResources(context.Background(), "scenario-run-1"); err == nil {
		t.Fatal("expected dry-run recovery cleanup to fail")
	}
}

func TestSweepPreservesActiveLeasedResources(t *testing.T) {
	now := time.Date(2026, 4, 6, 12, 0, 0, 0, time.UTC)
	leaseExpires := now.Add(2 * time.Minute)
	heartbeat := now.Add(-30 * time.Second)

	store := &fakeStore{
		sessions: map[string]*db.Session{
			"persisted-1": {
				ID:             "persisted-1",
				Status:         "running",
				HeartbeatAt:    &heartbeat,
				LeaseExpiresAt: &leaseExpires,
				UpdatedAt:      now.Add(-30 * time.Second),
			},
		},
	}
	docker := &fakeDocker{
		containers: []containerTypes.Summary{{
			ID:      "container-1",
			Created: now.Add(-5 * time.Minute).Unix(),
			Labels: map[string]string{
				provider.LabelManaged:      "true",
				provider.LabelResourceType: provider.ResourceTypeContainer,
				provider.LabelSessionID:    "persisted-1",
			},
		}},
		networks: []networkTypes.Summary{{
			ID:      "network-1",
			Name:    "network-1",
			Created: now.Add(-5 * time.Minute),
			Labels: map[string]string{
				provider.LabelManaged:      "true",
				provider.LabelResourceType: provider.ResourceTypeNetwork,
				provider.LabelSessionID:    "persisted-1",
			},
			Containers: map[string]networkTypes.EndpointResource{
				"container-1": {},
			},
		}},
	}

	service := &Service{
		cfg:    config.JanitorConfig{Enabled: true, StartupSweep: true, IntervalSec: 60, OrphanTTLSec: 300, Mode: ModeOwnershipPlusDanglingPrune},
		store:  store,
		docker: docker,
		now:    func() time.Time { return now },
	}

	if err := service.Sweep(context.Background()); err != nil {
		t.Fatalf("sweep returned error: %v", err)
	}
	if len(docker.removedContainers) != 0 {
		t.Fatalf("expected active container to be preserved, removed=%v", docker.removedContainers)
	}
	if len(docker.removedNetworks) != 0 {
		t.Fatalf("expected active network to be preserved, removed=%v", docker.removedNetworks)
	}
}

func TestSweepRemovesExpiredCompletedResources(t *testing.T) {
	now := time.Date(2026, 4, 6, 12, 0, 0, 0, time.UTC)
	completedAt := now.Add(-20 * time.Minute)

	store := &fakeStore{
		sessions: map[string]*db.Session{
			"persisted-2": {
				ID:          "persisted-2",
				Status:      "completed",
				CompletedAt: &completedAt,
				UpdatedAt:   completedAt,
			},
		},
	}
	docker := &fakeDocker{
		containers: []containerTypes.Summary{{
			ID:      "container-2",
			Created: now.Add(-25 * time.Minute).Unix(),
			Labels: map[string]string{
				provider.LabelManaged:      "true",
				provider.LabelResourceType: provider.ResourceTypeContainer,
				provider.LabelSessionID:    "persisted-2",
			},
		}},
		networks: []networkTypes.Summary{{
			ID:      "network-2",
			Name:    "network-2",
			Created: now.Add(-25 * time.Minute),
			Labels: map[string]string{
				provider.LabelManaged:      "true",
				provider.LabelResourceType: provider.ResourceTypeNetwork,
				provider.LabelSessionID:    "persisted-2",
			},
			Containers: map[string]networkTypes.EndpointResource{
				"container-2": {},
			},
		}},
	}

	service := &Service{
		cfg:    config.JanitorConfig{Enabled: true, StartupSweep: true, IntervalSec: 60, OrphanTTLSec: 300, Mode: ModeOwnershipPlusDanglingPrune},
		store:  store,
		docker: docker,
		now:    func() time.Time { return now },
	}

	if err := service.Sweep(context.Background()); err != nil {
		t.Fatalf("sweep returned error: %v", err)
	}
	if len(docker.removedContainers) != 1 || docker.removedContainers[0] != "container-2" {
		t.Fatalf("expected expired container to be removed, got %v", docker.removedContainers)
	}
	if len(docker.removedNetworks) != 1 || docker.removedNetworks[0] != "network-2" {
		t.Fatalf("expected expired network to be removed, got %v", docker.removedNetworks)
	}
}

func TestSweepRemovesUnknownManagedResourcesAfterTTL(t *testing.T) {
	now := time.Date(2026, 4, 6, 12, 0, 0, 0, time.UTC)

	docker := &fakeDocker{
		containers: []containerTypes.Summary{{
			ID:      "container-3",
			Created: now.Add(-30 * time.Minute).Unix(),
			Labels: map[string]string{
				provider.LabelManaged:      "true",
				provider.LabelResourceType: provider.ResourceTypeContainer,
				provider.LabelSessionID:    "missing-session",
			},
		}},
		networks: []networkTypes.Summary{{
			ID:      "network-3",
			Name:    "network-3",
			Created: now.Add(-30 * time.Minute),
			Labels: map[string]string{
				provider.LabelManaged:      "true",
				provider.LabelResourceType: provider.ResourceTypeNetwork,
				provider.LabelSessionID:    "missing-session",
			},
			Containers: map[string]networkTypes.EndpointResource{
				"container-3": {},
			},
		}},
	}

	service := &Service{
		cfg:    config.JanitorConfig{Enabled: true, StartupSweep: true, IntervalSec: 60, OrphanTTLSec: 300, Mode: ModeOwnershipPlusDanglingPrune},
		store:  &fakeStore{sessions: map[string]*db.Session{}},
		docker: docker,
		now:    func() time.Time { return now },
	}

	if err := service.Sweep(context.Background()); err != nil {
		t.Fatalf("sweep returned error: %v", err)
	}
	if len(docker.removedContainers) != 1 || len(docker.removedNetworks) != 1 {
		t.Fatalf("expected unknown managed resources to be removed, containers=%v networks=%v", docker.removedContainers, docker.removedNetworks)
	}
}

func TestSweepPrunesDanglingArtifactsOnlyInConfiguredMode(t *testing.T) {
	now := time.Date(2026, 4, 6, 12, 0, 0, 0, time.UTC)
	docker := &fakeDocker{}
	service := &Service{
		cfg:    config.JanitorConfig{Enabled: true, StartupSweep: true, IntervalSec: 60, OrphanTTLSec: 300, Mode: ModeOwnershipPlusDanglingPrune},
		store:  &fakeStore{sessions: map[string]*db.Session{}},
		docker: docker,
		now:    func() time.Time { return now },
	}

	if err := service.Sweep(context.Background()); err != nil {
		t.Fatalf("sweep returned error: %v", err)
	}
	if docker.imagePruneCalls != 1 || docker.volumePruneCalls != 1 || docker.cachePruneCalls != 1 {
		t.Fatalf("expected dangling prune calls, got images=%d volumes=%d cache=%d", docker.imagePruneCalls, docker.volumePruneCalls, docker.cachePruneCalls)
	}
	if got := docker.imagePruneFilter.Get("dangling"); len(got) != 1 || got[0] != "true" {
		t.Fatalf("expected dangling image prune filter, got %v", got)
	}
	if docker.cachePruneOptions.All {
		t.Fatal("expected build cache prune to avoid pruning all cache records")
	}
}

func TestRunExecutesStartupAndPeriodicSweeps(t *testing.T) {
	docker := &fakeDocker{}
	service := &Service{
		cfg:    config.JanitorConfig{Enabled: true, StartupSweep: true, IntervalSec: 1, OrphanTTLSec: 300, Mode: ModeOwnershipPlusDanglingPrune},
		store:  &fakeStore{sessions: map[string]*db.Session{}},
		docker: docker,
		now:    time.Now,
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		service.Run(ctx)
		close(done)
	}()

	time.Sleep(1200 * time.Millisecond)
	cancel()
	<-done

	if docker.imagePruneCalls < 2 {
		t.Fatalf("expected startup and periodic sweep, got %d prune calls", docker.imagePruneCalls)
	}
}

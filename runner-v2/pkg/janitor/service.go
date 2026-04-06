package janitor

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/docker/docker/api/types/build"
	containerTypes "github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	imageTypes "github.com/docker/docker/api/types/image"
	networkTypes "github.com/docker/docker/api/types/network"
	volumeTypes "github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
)

const ModeOwnershipPlusDanglingPrune = "ownership_plus_dangling_prune"

type sessionStore interface {
	GetSession(ctx context.Context, id string) (*db.Session, error)
	GetSessionByBackendSessionID(ctx context.Context, backendSessionID string) (*db.Session, error)
}

type dockerAPI interface {
	ContainerList(ctx context.Context, options containerTypes.ListOptions) ([]containerTypes.Summary, error)
	ContainerRemove(ctx context.Context, containerID string, options containerTypes.RemoveOptions) error
	NetworkList(ctx context.Context, options networkTypes.ListOptions) ([]networkTypes.Summary, error)
	NetworkRemove(ctx context.Context, networkID string) error
	ImagesPrune(ctx context.Context, pruneFilters filters.Args) (imageTypes.PruneReport, error)
	VolumesPrune(ctx context.Context, pruneFilters filters.Args) (volumeTypes.PruneReport, error)
	BuildCachePrune(ctx context.Context, opts build.CachePruneOptions) (*build.CachePruneReport, error)
	Close() error
}

type Service struct {
	cfg    config.JanitorConfig
	store  sessionStore
	docker dockerAPI
	now    func() time.Time
}

type sweepStats struct {
	managedContainers int
	managedNetworks   int
	containersRemoved int
	networksRemoved   int
	imagesReclaimed   uint64
	volumesReclaimed  uint64
	cacheReclaimed    uint64
}

type containerDecision struct {
	remove bool
	reason string
}

type networkDecision struct {
	remove bool
	reason string
}

type sessionLookupResult struct {
	session *db.Session
	found   bool
}

func NewService(database db.Database, cfg config.JanitorConfig) (*Service, error) {
	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client for janitor: %w", err)
	}

	return &Service{
		cfg:    cfg,
		store:  database,
		docker: dockerClient,
		now: func() time.Time {
			return time.Now().UTC()
		},
	}, nil
}

func (s *Service) Close() error {
	if s == nil || s.docker == nil {
		return nil
	}
	return s.docker.Close()
}

func (s *Service) Run(ctx context.Context) {
	if s == nil || !s.cfg.Enabled {
		return
	}

	if s.cfg.StartupSweep {
		if err := s.Sweep(ctx); err != nil && ctx.Err() == nil {
			logger.WarnContext(ctx, "janitor startup sweep failed", "error", err)
		}
	}

	ticker := time.NewTicker(time.Duration(s.cfg.IntervalSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.Sweep(ctx); err != nil && ctx.Err() == nil {
				logger.WarnContext(ctx, "janitor periodic sweep failed", "error", err)
			}
		}
	}
}

func (s *Service) Sweep(ctx context.Context) error {
	if s == nil || s.docker == nil {
		return nil
	}

	now := s.now()
	logger.InfoContext(ctx, "janitor sweep started", "mode", s.cfg.Mode, "dry_run", s.cfg.DryRun)

	managedContainers, err := s.docker.ContainerList(ctx, containerTypes.ListOptions{
		All: true,
		Filters: filters.NewArgs(
			filters.Arg("label", provider.LabelManaged+"=true"),
			filters.Arg("label", provider.LabelResourceType+"="+provider.ResourceTypeContainer),
		),
	})
	if err != nil {
		return fmt.Errorf("list managed containers: %w", err)
	}

	managedNetworks, err := s.docker.NetworkList(ctx, networkTypes.ListOptions{
		Filters: filters.NewArgs(
			filters.Arg("label", provider.LabelManaged+"=true"),
			filters.Arg("label", provider.LabelResourceType+"="+provider.ResourceTypeNetwork),
		),
	})
	if err != nil {
		return fmt.Errorf("list managed networks: %w", err)
	}

	stats := sweepStats{
		managedContainers: len(managedContainers),
		managedNetworks:   len(managedNetworks),
	}
	lookupCache := make(map[string]sessionLookupResult)
	logOnly := s.store == nil
	containerDecisions := make(map[string]containerDecision, len(managedContainers))

	for _, container := range managedContainers {
		decision, dbAvailable, decisionErr := s.classifyContainer(ctx, container, now, lookupCache)
		if decisionErr != nil {
			return decisionErr
		}
		if !dbAvailable {
			logOnly = true
		}
		containerDecisions[container.ID] = decision
	}

	networkDecisions := make(map[string]networkDecision, len(managedNetworks))
	for _, network := range managedNetworks {
		decision, dbAvailable, decisionErr := s.classifyNetwork(ctx, network, now, lookupCache, containerDecisions)
		if decisionErr != nil {
			return decisionErr
		}
		if !dbAvailable {
			logOnly = true
		}
		networkDecisions[network.ID] = decision
	}

	if logOnly {
		logger.WarnContext(ctx, "janitor running in log-only mode because the database is unavailable")
	}

	for _, container := range managedContainers {
		decision := containerDecisions[container.ID]
		if !decision.remove {
			continue
		}
		logger.InfoContext(ctx, "janitor flagged managed container", "container_id", container.ID, "reason", decision.reason, "dry_run", s.cfg.DryRun || logOnly)
		if s.cfg.DryRun || logOnly {
			continue
		}
		if err := s.docker.ContainerRemove(ctx, container.ID, containerTypes.RemoveOptions{Force: true, RemoveVolumes: true}); err != nil {
			logger.WarnContext(ctx, "failed to remove orphaned container", "container_id", container.ID, "error", err)
			continue
		}
		stats.containersRemoved++
	}

	for _, network := range managedNetworks {
		decision := networkDecisions[network.ID]
		if !decision.remove {
			continue
		}
		logger.InfoContext(ctx, "janitor flagged managed network", "network_id", network.ID, "network_name", network.Name, "reason", decision.reason, "dry_run", s.cfg.DryRun || logOnly)
		if s.cfg.DryRun || logOnly {
			continue
		}
		if err := s.docker.NetworkRemove(ctx, network.ID); err != nil {
			logger.WarnContext(ctx, "failed to remove orphaned network", "network_id", network.ID, "error", err)
			continue
		}
		stats.networksRemoved++
	}

	if !logOnly && !s.cfg.DryRun && s.cfg.Mode == ModeOwnershipPlusDanglingPrune {
		imageReport, err := s.docker.ImagesPrune(ctx, filters.NewArgs(filters.Arg("dangling", "true")))
		if err != nil {
			logger.WarnContext(ctx, "failed to prune dangling images", "error", err)
		} else {
			stats.imagesReclaimed = imageReport.SpaceReclaimed
		}

		volumeReport, err := s.docker.VolumesPrune(ctx, filters.NewArgs(filters.Arg("dangling", "true")))
		if err != nil {
			logger.WarnContext(ctx, "failed to prune dangling volumes", "error", err)
		} else {
			stats.volumesReclaimed = volumeReport.SpaceReclaimed
		}

		cacheReport, err := s.docker.BuildCachePrune(ctx, build.CachePruneOptions{All: false})
		if err != nil {
			logger.WarnContext(ctx, "failed to prune dangling build cache", "error", err)
		} else if cacheReport != nil {
			stats.cacheReclaimed = cacheReport.SpaceReclaimed
		}
	}

	logger.InfoContext(ctx, "janitor sweep completed",
		"managed_containers", stats.managedContainers,
		"managed_networks", stats.managedNetworks,
		"containers_removed", stats.containersRemoved,
		"networks_removed", stats.networksRemoved,
		"images_reclaimed_bytes", stats.imagesReclaimed,
		"volumes_reclaimed_bytes", stats.volumesReclaimed,
		"build_cache_reclaimed_bytes", stats.cacheReclaimed,
		"log_only", logOnly,
	)

	return nil
}

func (s *Service) classifyContainer(ctx context.Context, container containerTypes.Summary, now time.Time, lookupCache map[string]sessionLookupResult) (containerDecision, bool, error) {
	sessionRecord, found, dbAvailable, err := s.lookupSession(ctx, container.Labels, lookupCache)
	if err != nil {
		return containerDecision{}, dbAvailable, err
	}
	if !dbAvailable {
		return containerDecision{}, false, nil
	}
	if found {
		if s.sessionProtected(sessionRecord, now) {
			return containerDecision{}, true, nil
		}
		if s.sessionExpired(sessionRecord, now) {
			return containerDecision{remove: true, reason: "expired persisted session"}, true, nil
		}
		return containerDecision{}, true, nil
	}

	createdAt := time.Unix(container.Created, 0).UTC()
	if now.Sub(createdAt) >= time.Duration(s.cfg.OrphanTTLSec)*time.Second {
		return containerDecision{remove: true, reason: "unknown managed container past orphan ttl"}, true, nil
	}

	return containerDecision{}, true, nil
}

func (s *Service) classifyNetwork(ctx context.Context, network networkTypes.Summary, now time.Time, lookupCache map[string]sessionLookupResult, containerDecisions map[string]containerDecision) (networkDecision, bool, error) {
	for containerID := range network.Containers {
		decision, exists := containerDecisions[containerID]
		if !exists || !decision.remove {
			return networkDecision{}, true, nil
		}
	}

	sessionRecord, found, dbAvailable, err := s.lookupSession(ctx, network.Labels, lookupCache)
	if err != nil {
		return networkDecision{}, dbAvailable, err
	}
	if !dbAvailable {
		return networkDecision{}, false, nil
	}
	if found {
		if s.sessionProtected(sessionRecord, now) {
			return networkDecision{}, true, nil
		}
		if s.sessionExpired(sessionRecord, now) {
			return networkDecision{remove: true, reason: "expired persisted session"}, true, nil
		}
		return networkDecision{}, true, nil
	}

	if now.Sub(network.Created.UTC()) >= time.Duration(s.cfg.OrphanTTLSec)*time.Second {
		return networkDecision{remove: true, reason: "unknown managed network past orphan ttl"}, true, nil
	}

	return networkDecision{}, true, nil
}

func (s *Service) lookupSession(ctx context.Context, labels map[string]string, cache map[string]sessionLookupResult) (*db.Session, bool, bool, error) {
	if s.store == nil {
		return nil, false, false, nil
	}

	if sessionID := strings.TrimSpace(labels[provider.LabelSessionID]); sessionID != "" {
		cacheKey := "session:" + sessionID
		if cached, ok := cache[cacheKey]; ok {
			return cached.session, cached.found, true, nil
		}
		sess, err := s.store.GetSession(ctx, sessionID)
		if err == nil {
			cache[cacheKey] = sessionLookupResult{session: sess, found: true}
			return sess, true, true, nil
		}
		if !isNotFoundError(err) {
			return nil, false, false, fmt.Errorf("lookup session %s: %w", sessionID, err)
		}
		cache[cacheKey] = sessionLookupResult{}
	}

	if backendSessionID := strings.TrimSpace(labels[provider.LabelBackendSessionID]); backendSessionID != "" {
		cacheKey := "backend:" + backendSessionID
		if cached, ok := cache[cacheKey]; ok {
			return cached.session, cached.found, true, nil
		}
		sess, err := s.store.GetSessionByBackendSessionID(ctx, backendSessionID)
		if err == nil {
			cache[cacheKey] = sessionLookupResult{session: sess, found: true}
			return sess, true, true, nil
		}
		if !isNotFoundError(err) {
			return nil, false, false, fmt.Errorf("lookup backend session %s: %w", backendSessionID, err)
		}
		cache[cacheKey] = sessionLookupResult{}
	}

	return nil, false, true, nil
}

func (s *Service) sessionProtected(sessionRecord *db.Session, now time.Time) bool {
	if sessionRecord == nil {
		return false
	}
	if sessionRecord.LeaseExpiresAt != nil && sessionRecord.LeaseExpiresAt.After(now) {
		return true
	}
	if sessionRecord.Status == "running" && sessionRecord.HeartbeatAt != nil {
		return now.Sub(*sessionRecord.HeartbeatAt) < time.Duration(s.cfg.OrphanTTLSec)*time.Second
	}
	return false
}

func (s *Service) sessionExpired(sessionRecord *db.Session, now time.Time) bool {
	if sessionRecord == nil {
		return false
	}
	if sessionRecord.LeaseExpiresAt != nil && sessionRecord.LeaseExpiresAt.After(now) {
		return false
	}

	referenceTime := sessionRecord.UpdatedAt
	if sessionRecord.CompletedAt != nil {
		referenceTime = *sessionRecord.CompletedAt
	} else if sessionRecord.HeartbeatAt != nil {
		referenceTime = *sessionRecord.HeartbeatAt
	} else if sessionRecord.StartedAt != nil {
		referenceTime = *sessionRecord.StartedAt
	}

	return now.Sub(referenceTime.UTC()) >= time.Duration(s.cfg.OrphanTTLSec)*time.Second
}

func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "not found")
}

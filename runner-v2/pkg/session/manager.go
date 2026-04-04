package session

import (
	"context"
	"fmt"
	"sync"

	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/google/uuid"
)

// Represents running session with containers
type Session struct {
	ID           string
	Orchestrator *orchestrator.Orchestrator
	Context      context.Context
	Cancel       context.CancelFunc
	Execution    *ExecutionContext
	TestResults  map[string]any
	resultsMu    sync.RWMutex
}

type ExecutionContext struct {
	WorkflowID    string
	WorkflowRunID string
	ScenarioID    string
	ScenarioName  string
}

type Manager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
	}
}

// Create new session with unique id
func (m *Manager) Create(orch *orchestrator.Orchestrator, execution *ExecutionContext) string {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessionID := uuid.New().String()
	ctx, cancel := context.WithCancel(context.Background())
	ctx = provider.WithSessionID(ctx, sessionID)

	m.sessions[sessionID] = &Session{
		ID:           sessionID,
		Orchestrator: orch,
		Context:      ctx,
		Cancel:       cancel,
		Execution:    execution,
		TestResults:  make(map[string]any),
	}

	return sessionID
}

// Stores the test result for later interpolation
func (s *Session) StoreTestResult(testName string, result any) {
	s.resultsMu.Lock()
	defer s.resultsMu.Unlock()
	s.TestResults[testName] = result
}

// Retrives the stored test result
func (s *Session) GetTestResult(testName string) (any, bool) {
	s.resultsMu.Lock()
	defer s.resultsMu.Unlock()

	result, ok := s.TestResults[testName]
	return result, ok
}

// Get session by id
func (m *Manager) Get(sessionID string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, ok := m.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("sesion not found : %s", sessionID)
	}
	return session, nil
}

// Remove the session and clean up resources
func (m *Manager) Delete(sessionId string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, ok := m.sessions[sessionId]
	if !ok {
		return fmt.Errorf("session not found : %s", sessionId)
	}

	session.Cancel()
	if err := session.Orchestrator.CleanUp(context.Background()); err != nil {
		return fmt.Errorf("failed to cleanup the session : %w", err)
	}
	delete(m.sessions, sessionId)
	return nil
}

// Get all active sessions
func (m *Manager) List() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	return ids
}

// Number of active sessions
func (m *Manager) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.sessions)
}

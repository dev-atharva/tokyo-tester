package errors

import "net/http"

type ErrorCode string

const (
	ErrValidation     ErrorCode = "VALIDATION_ERROR"
	ErrInvalidRequest ErrorCode = "INVALID_REQUEST"
	ErrMissingField   ErrorCode = "MISSING_FIELD"

	ErrServiceProvision ErrorCode = "SERVICE_PROVISION_ERROR"
	ErrServiceNotFound  ErrorCode = "SERVICE_NOT_FOUND"
	ErrServiceCleanup   ErrorCode = "SERVICE_CLEANUP_ERROR"

	ErrTestExecution ErrorCode = "TEST_EXECUTION_ERROR"
	ErrTestNotFound  ErrorCode = "TEST_NOT_FOUND"
	ErrTestTimeout   ErrorCode = "TEST_TIMEOUT"

	ErrSessionNotFound ErrorCode = "SESSION_NOT_FOUND"
	ErrSessionExpired  ErrorCode = "SESSION_EXPIRED"

	ErrDatabaseConnection ErrorCode = "DATABASE_CONNECTION_ERROR"
	ErrDatabaseQuery      ErrorCode = "DATABASE_QUERY_ERROR"
	ErrDatabaseMigration  ErrorCode = "DATABASE_MIGRATION_ERROR"

	ErrDependencyCycle   ErrorCode = "DEPENDENCY_CYCLE_ERROR"
	ErrDepenedncyMissing ErrorCode = "DEPENDENCY_MISSING"

	ErrContainerStart ErrorCode = "CONTAINER_START_ERROR"
	ErrContainerStop  ErrorCode = "CONTAINER_STOP_ERROR"
	ErrNetworkCreate  ErrorCode = "NETWORK_CREATE_ERROR"
	ErrRegistryAuth   ErrorCode = "REGISTRY_AUTH_ERROR"
	ErrImagePull      ErrorCode = "IMAGE_PULL_ERROR"

	ErrConfiguration ErrorCode = "CONFIGURATION_ERROR"
	ErrEnvVarMissing ErrorCode = "ENV_VAR_MISSING"

	ErrSyncBatch ErrorCode = "SYNC_BATCH_ERROR"
	ErrSyncPull  ErrorCode = "SYNC_PULL_ERROR"
	ErrSyncClear ErrorCode = "SYNC_CLEAR_ERROR"

	ErrInternal       ErrorCode = "INTERNAL_ERROR"
	ErrNotImplemented ErrorCode = "NOT_IMPLEMENTED"
	ErrTimeout        ErrorCode = "TIMEOUT"
)

func (e ErrorCode) HTTPStatusCode() int {
	switch e {
	case ErrValidation, ErrInvalidRequest, ErrMissingField:
		return http.StatusBadRequest
	case ErrSessionNotFound, ErrServiceNotFound, ErrTestNotFound:
		return http.StatusNotFound
	case ErrTestTimeout, ErrTimeout:
		return http.StatusRequestTimeout
	case ErrDependencyCycle, ErrDepenedncyMissing:
		return http.StatusBadRequest
	case ErrServiceProvision, ErrContainerStart, ErrImagePull:
		return http.StatusInternalServerError
	case ErrDatabaseConnection, ErrDatabaseQuery:
		return http.StatusServiceUnavailable
	default:
		return 500
	}
}

func (e ErrorCode) String() string {
	return string(e)
}

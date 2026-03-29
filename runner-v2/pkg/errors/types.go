package errors

import "fmt"

type AppError struct {
	Code       ErrorCode         `json:"code"`
	Message    string            `json:"message"`
	Details    map[string]string `json:"details,omitempty"`
	Underlying error
}

func (e *AppError) Error() string {
	if e.Underlying != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Underlying)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Underlying
}

func New(code ErrorCode, message string) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
	}
}

func Wrap(err error, code ErrorCode, message string) *AppError {
	return &AppError{
		Code:       code,
		Message:    message,
		Underlying: err,
	}
}

func (e *AppError) WithDetails(details map[string]string) *AppError {
	e.Details = details
	return e
}

func (e *AppError) WithDetail(key, value string) *AppError {
	if e.Details == nil {
		e.Details = make(map[string]string)
	}
	e.Details[key] = value
	return e
}

func ValidationError(message string, fieldErrors map[string]string) *AppError {
	return &AppError{
		Code:    ErrValidation,
		Message: message,
		Details: fieldErrors,
	}
}

func ServiceError(serviceName string, err error) *AppError {
	return Wrap(err, ErrServiceProvision, "service provisioning failed").WithDetail("service", serviceName)
}

func TestError(testName string, err error) *AppError {
	return Wrap(err, ErrTestExecution, "test execution failed").WithDetail("test", testName)
}

func DatabaseError(operation string, err error) *AppError {
	return Wrap(err, ErrDatabaseQuery, "database operation failed").WithDetail("operation", operation)
}

func IsAppError(err error) bool {
	_, ok := err.(*AppError)
	return ok
}

func GetCode(err error) ErrorCode {
	if appErr, ok := err.(*AppError); ok {
		return appErr.Code
	}
	return ErrInternal
}

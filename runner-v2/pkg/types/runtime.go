package types

// ServiceRuntime holds runtime information about the running service
type ServiceRuntime struct {
	Name        string
	ContainerID string
	Host        string
	MappedPorts map[string]string // contrainer port -> host port
	EnvVars     map[string]string
}

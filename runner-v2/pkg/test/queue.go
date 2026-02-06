package test

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/segmentio/kafka-go"
)

type QueueExecutor struct{}

func (e *QueueExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	serviceName, ok := testCfg.Config["service"].(string)
	if !ok {
		return fmt.Errorf("queue test requires 'service' in the config")
	}

	operation, ok := testCfg.Config["operation"].(string)
	if !ok {
		return fmt.Errorf("queue test requires 'operation' in the config")
	}

	runtime, ok := registry.Get(serviceName)
	if !ok {
		return fmt.Errorf("service not found : %s", serviceName)
	}
	brokerType := e.inferBrokerType(serviceName, testCfg.Config)

	switch brokerType {
	case "kafka":
		return e.executeKafka(ctx, testCfg, runtime, operation)
	default:
		return fmt.Errorf("unsupported broker type : %s (expected 'kafka')", brokerType)
	}
}

func (e *QueueExecutor) inferBrokerType(serviceName string, cfg map[string]any) string {
	if brokerType, ok := cfg["broker_type"].(string); ok {
		return brokerType
	}
	lowerName := strings.ToLower(serviceName)
	if strings.Contains(lowerName, "kafka") {
		return "kafka"
	}
	if strings.Contains(lowerName, "rabbitmq") || strings.Contains(lowerName, "rabbit") {
		return "rabbitmq"
	}
	if strings.Contains(lowerName, "nats") {
		return "nats"
	}
	return "kafka"
}

func (e *QueueExecutor) executeKafka(ctx context.Context, testCfg config.TestConfig, runtime *types.ServiceRuntime, operation string) error {
	brokerStr, ok := runtime.EnvVars["KAFKA_BROKERS"]
	if !ok {
		return fmt.Errorf("KAFKA_BROKERS not found in the service runtime.")
	}

	brokers := strings.Split(brokerStr, ",")
	if len(brokers) == 0 {
		return fmt.Errorf("no kafka brokers configured")
	}

	switch operation {
	case "produce":
		return e.kafkaProduce(ctx, brokers, testCfg)
	case "consume":
		return e.kafkaConsume(ctx, brokers, testCfg)
	case "produce_and_consume":
		return e.kafkaProduceAndConsume(ctx, brokers, testCfg)
	case "check_type":
		return e.kafkaCheckTopic(ctx, brokers, testCfg)
	case "list_topics":
		return e.kafkaListTopics(ctx, brokers, testCfg)
	default:
		return fmt.Errorf("unsupported kafka operation: %s", operation)
	}
}

func (e *QueueExecutor) kafkaProduce(ctx context.Context, brokers []string, testCfg config.TestConfig) error {
	topic, ok := testCfg.Config["topic"].(string)
	if !ok {
		return fmt.Errorf("produce operation requires 'topic' in config")
	}

	message, ok := testCfg.Config["message"].(string)
	if !ok {
		return fmt.Errorf("produce operation requires 'message' in config")
	}

	key := getStringOrDefault(testCfg.Config, "key", "")
	partition := getIntOrDefault(testCfg.Config, "partition", -1) // -1 means it auto assigns the partition

	writer := &kafka.Writer{
		Addr:     kafka.TCP(brokers...),
		Topic:    topic,
		Balancer: &kafka.LeastBytes{},
	}
	defer writer.Close()

	msg := kafka.Message{
		Key:   []byte(key),
		Value: fmt.Appendf(nil, "%v", message),
	}
	if partition >= 0 {
		msg.Partition = partition
	}
	writeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := writer.WriteMessages(writeCtx, msg); err != nil {
		return fmt.Errorf("failed to produce message : %w", err)
	}
	return nil
}

func (e *QueueExecutor) kafkaConsume(ctx context.Context, brokers []string, testCfg config.TestConfig) error {
	topic, ok := testCfg.Config["topic"].(string)
	if !ok {
		return fmt.Errorf("consume operation requires 'topic' in the config")
	}

	timeout := getIntOrDefault(testCfg.Config, "timeout", 10)
	partition := getIntOrDefault(testCfg.Config, "partition", 0)
	fromBeginning := getBoolOrDefault(testCfg.Config, "from_beginning", false)
	expectedCount := getIntOrDefault(testCfg.Config, "expected_count", 1)

	startOffset := kafka.LastOffset
	if fromBeginning {
		startOffset = kafka.FirstOffset
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     brokers,
		Topic:       topic,
		Partition:   partition,
		StartOffset: startOffset,
		MaxWait:     time.Duration(timeout) * time.Second,
	})
	defer reader.Close()

	readCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	messesRead := 0
	for messesRead < expectedCount {
		msg, err := reader.ReadMessage(readCtx)
		if err != nil {
			if err == context.DeadlineExceeded {
				break
			}

			return fmt.Errorf("failed to consume message : %w", err)
		}
		messesRead++

		if expectedMessage, ok := testCfg.Config["expected_message"]; ok {
			expectedStr := fmt.Sprintf("%v", expectedMessage)
			actualStr := string(msg.Value)
			if expectedStr != actualStr {
				return fmt.Errorf("expected message %q , got %q", expectedStr, actualStr)
			}
		}
	}
	//This condition can be removed in the future if strict checking is not needed.
	if expectedCount > 0 && messesRead != expectedCount {
		return fmt.Errorf("expected %d messages, got %d", expectedCount, messesRead)
	}

	if messesRead == 0 && expectedCount > 0 {
		return fmt.Errorf("no messages found in topic %s", topic)
	}
	return nil
}

func (e *QueueExecutor) kafkaProduceAndConsume(ctx context.Context, brokers []string, testCfg config.TestConfig) error {
	topic, ok := testCfg.Config["topic"].(string)
	if !ok {
		return fmt.Errorf("produce_and_consume operation requires 'topic' in the config")
	}

	message, ok := testCfg.Config["message"]
	if !ok {
		return fmt.Errorf("produce_and_consume operation reqiures 'message' in the topic")
	}

	key := getStringOrDefault(testCfg.Config, "key", "")
	timeout := getIntOrDefault(testCfg.Config, "timeout", 10)
	partition := getIntOrDefault(testCfg.Config, "partition", 0)

	writer := &kafka.Writer{
		Addr:     kafka.TCP(brokers...),
		Topic:    topic,
		Balancer: &kafka.LeastBytes{},
	}

	defer writer.Close()

	msg := kafka.Message{
		Key:       []byte(key),
		Value:     fmt.Appendf(nil, "%v", message),
		Partition: partition,
	}

	writerCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := writer.WriteMessages(writerCtx, msg); err != nil {
		return fmt.Errorf("failed to produce message : %w", err)
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     brokers,
		Topic:       topic,
		Partition:   partition,
		StartOffset: kafka.LastOffset - 1, // Read the last message
		MaxWait:     time.Duration(timeout) * time.Second,
	})

	defer reader.Close()

	readCtx, cancel2 := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel2()

	consumedMsg, err := reader.ReadMessage(readCtx)
	if err != nil {
		return fmt.Errorf("failed to consume message: %w", err)
	}

	expectedStr := fmt.Sprintf("%v", message)
	actualStr := string(consumedMsg.Value)
	if actualStr != expectedStr {
		return fmt.Errorf("produced message %q but consumed %q", expectedStr, actualStr)
	}

	return nil
}

func (e *QueueExecutor) kafkaCheckTopic(ctx context.Context, brokers []string, testCfg config.TestConfig) error {
	topic, ok := testCfg.Config["topic"].(string)
	if !ok {
		return fmt.Errorf("check_topic operation requires 'topic' in the config")
	}
	expectedExists := getBoolOrDefault(testCfg.Config, "expected_exists", true)

	conn, err := kafka.DialContext(ctx, "tcp", brokers[0])
	if err != nil {
		return fmt.Errorf("failed to connect kafka : %w", err)
	}
	defer conn.Close()

	partitions, err := conn.ReadPartitions()
	if err != nil {
		return fmt.Errorf("failed to read partitions : %w", err)
	}

	topicExists := false
	for _, p := range partitions {
		if p.Topic == topic {
			topicExists = true
			break
		}
	}

	if topicExists != expectedExists {
		return fmt.Errorf("expected topic %s exists=%v got exists=%v", topic, expectedExists, topicExists)
	}
	return nil
}

func (e *QueueExecutor) kafkaListTopics(ctx context.Context, brokers []string, _ config.TestConfig) error {
	conn, err := kafka.DialContext(ctx, "tcp", brokers[0])
	if err != nil {
		return fmt.Errorf("failed to connect to kafka: %w", err)
	}
	defer conn.Close()

	partitions, err := conn.ReadPartitions()
	if err != nil {
		return fmt.Errorf("failed to read partitions: %w", err)
	}

	topics := make(map[string]bool)

	for _, p := range partitions {
		topics[p.Topic] = true
	}

	fmt.Printf(" Kafka topic (%d):\n", len(topics))
	for topic := range topics {
		fmt.Printf("  - %s\n", topic)
	}
	return nil
}

func getBoolOrDefault(cfg map[string]any, key string, defaultValue bool) bool {
	if val, ok := cfg[key].(bool); ok {
		return val
	}
	return defaultValue
}

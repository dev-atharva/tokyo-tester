package test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/types"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/segmentio/kafka-go"
)

type QueueExecutor struct{}

type rabbitMQManagementQueue struct {
	Name string `json:"name"`
}

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
	case "rabbitmq":
		return e.executeRabbitMQ(ctx, testCfg, runtime, operation)
	default:
		return fmt.Errorf("unsupported broker type : %s (expected 'kafka' or 'rabbitmq')", brokerType)
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
		return fmt.Errorf("KAFKA_BROKERS not found in the service runtime")
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
	case "check_type", "check_topic":
		return e.kafkaCheckTopic(ctx, brokers, testCfg)
	case "list_topics":
		return e.kafkaListTopics(ctx, brokers, testCfg)
	default:
		return fmt.Errorf("unsupported kafka operation: %s", operation)
	}
}

func (e *QueueExecutor) executeRabbitMQ(ctx context.Context, testCfg config.TestConfig, runtime *types.ServiceRuntime, operation string) error {
	amqpURL := runtime.EnvVars["RABBITMQ_AMQP_URL"]
	if amqpURL == "" {
		return fmt.Errorf("RABBITMQ_AMQP_URL not found in the service runtime")
	}

	conn, err := amqp.Dial(amqpURL)
	if err != nil {
		return fmt.Errorf("failed to connect to rabbitmq: %w", err)
	}
	defer conn.Close()

	channel, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open rabbitmq channel: %w", err)
	}
	defer channel.Close()

	switch operation {
	case "produce":
		return e.rabbitMQProduce(ctx, channel, testCfg)
	case "consume":
		return e.rabbitMQConsume(ctx, channel, testCfg)
	case "produce_and_consume":
		return e.rabbitMQProduceAndConsume(ctx, channel, testCfg)
	case "check_type", "check_topic":
		return e.rabbitMQCheckTopic(ctx, runtime, testCfg)
	case "list_topics":
		return e.rabbitMQListTopics(ctx, runtime, testCfg)
	default:
		return fmt.Errorf("unsupported rabbitmq operation: %s", operation)
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
	partition := getIntOrDefault(testCfg.Config, "partition", -1)

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

	messagesRead := 0
	for messagesRead < expectedCount {
		msg, err := reader.ReadMessage(readCtx)
		if err != nil {
			if err == context.DeadlineExceeded {
				break
			}

			return fmt.Errorf("failed to consume message : %w", err)
		}
		messagesRead++

		if expectedMessage, ok := testCfg.Config["expected_message"]; ok {
			expectedStr := fmt.Sprintf("%v", expectedMessage)
			actualStr := string(msg.Value)
			if expectedStr != actualStr {
				return fmt.Errorf("expected message %q , got %q", expectedStr, actualStr)
			}
		}
	}

	if expectedCount > 0 && messagesRead != expectedCount {
		return fmt.Errorf("expected %d messages, got %d", expectedCount, messagesRead)
	}

	if messagesRead == 0 && expectedCount > 0 {
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
		StartOffset: kafka.LastOffset - 1,
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

func (e *QueueExecutor) rabbitMQProduce(ctx context.Context, channel *amqp.Channel, testCfg config.TestConfig) error {
	queueName, ok := testCfg.Config["topic"].(string)
	if !ok || strings.TrimSpace(queueName) == "" {
		return fmt.Errorf("produce operation requires 'topic' in config")
	}

	message, ok := testCfg.Config["message"]
	if !ok {
		return fmt.Errorf("produce operation requires 'message' in config")
	}

	if err := e.rabbitMQDeclareQueue(channel, queueName, false); err != nil {
		return err
	}

	return channel.PublishWithContext(ctx, "", queueName, false, false, amqp.Publishing{
		ContentType: "text/plain",
		Body:        fmt.Appendf(nil, "%v", message),
		MessageId:   getStringOrDefault(testCfg.Config, "key", ""),
	})
}

func (e *QueueExecutor) rabbitMQConsume(ctx context.Context, channel *amqp.Channel, testCfg config.TestConfig) error {
	queueName, ok := testCfg.Config["topic"].(string)
	if !ok || strings.TrimSpace(queueName) == "" {
		return fmt.Errorf("consume operation requires 'topic' in the config")
	}

	if err := e.rabbitMQDeclareQueue(channel, queueName, true); err != nil {
		return err
	}

	timeout := time.Duration(getIntOrDefault(testCfg.Config, "timeout", 10)) * time.Second
	expectedCount := getIntOrDefault(testCfg.Config, "expected_count", 1)
	expectedMessage, hasExpectedMessage := testCfg.Config["expected_message"]

	deadline := time.Now().Add(timeout)
	messagesRead := 0
	for messagesRead < expectedCount {
		if err := ctx.Err(); err != nil {
			return err
		}

		msg, ok, err := channel.Get(queueName, false)
		if err != nil {
			return fmt.Errorf("failed to consume message: %w", err)
		}
		if !ok {
			if time.Now().After(deadline) {
				break
			}
			time.Sleep(200 * time.Millisecond)
			continue
		}

		if hasExpectedMessage {
			expectedStr := fmt.Sprintf("%v", expectedMessage)
			actualStr := string(msg.Body)
			if expectedStr != actualStr {
				_ = msg.Nack(false, true)
				return fmt.Errorf("expected message %q , got %q", expectedStr, actualStr)
			}
		}

		if err := msg.Ack(false); err != nil {
			return fmt.Errorf("failed to ack rabbitmq message: %w", err)
		}
		messagesRead++
	}

	if expectedCount > 0 && messagesRead != expectedCount {
		return fmt.Errorf("expected %d messages, got %d", expectedCount, messagesRead)
	}

	if messagesRead == 0 && expectedCount > 0 {
		return fmt.Errorf("no messages found in queue %s", queueName)
	}
	return nil
}

func (e *QueueExecutor) rabbitMQProduceAndConsume(ctx context.Context, channel *amqp.Channel, testCfg config.TestConfig) error {
	queueName, ok := testCfg.Config["topic"].(string)
	if !ok || strings.TrimSpace(queueName) == "" {
		return fmt.Errorf("produce_and_consume operation requires 'topic' in the config")
	}

	message, ok := testCfg.Config["message"]
	if !ok {
		return fmt.Errorf("produce_and_consume operation requires 'message' in the config")
	}

	if err := e.rabbitMQDeclareQueue(channel, queueName, false); err != nil {
		return err
	}

	if err := channel.PublishWithContext(ctx, "", queueName, false, false, amqp.Publishing{
		ContentType: "text/plain",
		Body:        fmt.Appendf(nil, "%v", message),
		MessageId:   getStringOrDefault(testCfg.Config, "key", ""),
	}); err != nil {
		return fmt.Errorf("failed to produce message: %w", err)
	}

	consumeCfg := config.TestConfig{
		Name:      testCfg.Name,
		Type:      testCfg.Type,
		DependsOn: testCfg.DependsOn,
		Config: map[string]any{
			"topic":            queueName,
			"timeout":          getIntOrDefault(testCfg.Config, "timeout", 10),
			"expected_count":   1,
			"expected_message": message,
		},
	}
	return e.rabbitMQConsume(ctx, channel, consumeCfg)
}

func (e *QueueExecutor) rabbitMQCheckTopic(ctx context.Context, runtime *types.ServiceRuntime, testCfg config.TestConfig) error {
	queueName, ok := testCfg.Config["topic"].(string)
	if !ok || strings.TrimSpace(queueName) == "" {
		return fmt.Errorf("check_topic operation requires 'topic' in the config")
	}

	queues, err := e.rabbitMQManagementQueues(ctx, runtime)
	if err != nil {
		return err
	}

	expectedExists := getBoolOrDefault(testCfg.Config, "expected_exists", true)
	actualExists := false
	for _, queue := range queues {
		if queue.Name == queueName {
			actualExists = true
			break
		}
	}

	if actualExists != expectedExists {
		return fmt.Errorf("expected queue %s exists=%v got exists=%v", queueName, expectedExists, actualExists)
	}
	return nil
}

func (e *QueueExecutor) rabbitMQListTopics(ctx context.Context, runtime *types.ServiceRuntime, _ config.TestConfig) error {
	queues, err := e.rabbitMQManagementQueues(ctx, runtime)
	if err != nil {
		return err
	}

	fmt.Printf(" RabbitMQ queues (%d):\n", len(queues))
	for _, queue := range queues {
		fmt.Printf("  - %s\n", queue.Name)
	}
	return nil
}

func (e *QueueExecutor) rabbitMQDeclareQueue(channel *amqp.Channel, queueName string, passive bool) error {
	if passive {
		if _, err := channel.QueueDeclarePassive(queueName, false, false, false, false, nil); err != nil {
			return fmt.Errorf("failed to inspect rabbitmq queue %s: %w", queueName, err)
		}
		return nil
	}

	if _, err := channel.QueueDeclare(queueName, false, false, false, false, nil); err != nil {
		return fmt.Errorf("failed to declare rabbitmq queue %s: %w", queueName, err)
	}
	return nil
}

func (e *QueueExecutor) rabbitMQManagementQueues(ctx context.Context, runtime *types.ServiceRuntime) ([]rabbitMQManagementQueue, error) {
	httpURL := runtime.EnvVars["RABBITMQ_HTTP_URL"]
	if httpURL == "" {
		return nil, fmt.Errorf("RABBITMQ_HTTP_URL not found in the service runtime")
	}

	parsed, err := url.Parse(httpURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse rabbitmq http url: %w", err)
	}

	username := ""
	password := ""
	if parsed.User != nil {
		username = parsed.User.Username()
		password, _ = parsed.User.Password()
	}
	parsed.User = nil

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(parsed.String(), "/")+"/api/queues", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create rabbitmq management request: %w", err)
	}
	if username != "" {
		req.SetBasicAuth(username, password)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query rabbitmq management api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("rabbitmq management api returned status %d", resp.StatusCode)
	}

	var queues []rabbitMQManagementQueue
	if err := json.NewDecoder(resp.Body).Decode(&queues); err != nil {
		return nil, fmt.Errorf("failed to decode rabbitmq management response: %w", err)
	}
	return queues, nil
}

func getBoolOrDefault(cfg map[string]any, key string, defaultValue bool) bool {
	if val, ok := cfg[key].(bool); ok {
		return val
	}
	return defaultValue
}

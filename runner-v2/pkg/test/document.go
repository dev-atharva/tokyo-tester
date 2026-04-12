package test

import (
	"context"
	"fmt"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type DocumentExecutor struct{}

func (e *DocumentExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	serviceName, ok := testCfg.Config["service"].(string)
	if !ok || serviceName == "" {
		return fmt.Errorf("document test requires 'service' in the configuration")
	}

	databaseName, ok := testCfg.Config["database"].(string)
	if !ok || databaseName == "" {
		return fmt.Errorf("document test requires 'database' in the configuration")
	}

	collectionName, ok := testCfg.Config["collection"].(string)
	if !ok || collectionName == "" {
		return fmt.Errorf("document test requires 'collection' in the configuration")
	}

	operation, ok := testCfg.Config["operation"].(string)
	if !ok || operation == "" {
		return fmt.Errorf("document test requires 'operation' in the configuration")
	}

	runtime, ok := registry.Get(serviceName)
	if !ok {
		return fmt.Errorf("service not found : %s", serviceName)
	}

	mongoURI := runtime.EnvVars["MONGODB_URI"]
	if mongoURI == "" {
		return fmt.Errorf("MONGODB_URI not found in the service runtime")
	}

	client, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		return fmt.Errorf("failed to connect to mongodb: %w", err)
	}
	defer func() {
		_ = client.Disconnect(ctx)
	}()

	if err := client.Ping(ctx, nil); err != nil {
		return fmt.Errorf("failed to ping mongodb: %w", err)
	}

	collection := client.Database(databaseName).Collection(collectionName)

	switch operation {
	case "insert_one":
		return e.insertOne(ctx, collection, testCfg.Config)
	case "find_one":
		return e.findOne(ctx, collection, testCfg.Config)
	case "find_many":
		return e.findMany(ctx, collection, testCfg.Config)
	case "update_one":
		return e.updateOne(ctx, collection, testCfg.Config)
	case "delete_one":
		return e.deleteOne(ctx, collection, testCfg.Config)
	case "count_documents":
		return e.countDocuments(ctx, collection, testCfg.Config)
	case "exists":
		return e.exists(ctx, collection, testCfg.Config)
	default:
		return fmt.Errorf("unsupported document operation: %s", operation)
	}
}

func (e *DocumentExecutor) insertOne(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	document, ok := toDocumentMap(cfg["document"])
	if !ok {
		return fmt.Errorf("insert_one requires 'document' object")
	}

	_, err := collection.InsertOne(ctx, document)
	if err != nil {
		return fmt.Errorf("insert_one failed: %w", err)
	}
	return nil
}

func (e *DocumentExecutor) findOne(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	filter, ok := toDocumentMap(cfg["filter"])
	if !ok {
		return fmt.Errorf("find_one requires 'filter' object")
	}

	var actual bson.M
	if err := collection.FindOne(ctx, filter).Decode(&actual); err != nil {
		return fmt.Errorf("find_one failed: %w", err)
	}

	expected, ok := toDocumentMap(cfg["expected_document"])
	if !ok {
		return fmt.Errorf("find_one requires 'expected_document' object")
	}

	if !matchesPartialDocument(actual, expected) {
		return fmt.Errorf("find_one result did not match expected document")
	}
	return nil
}

func (e *DocumentExecutor) findMany(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	filter, ok := toDocumentMap(cfg["filter"])
	if !ok {
		return fmt.Errorf("find_many requires 'filter' object")
	}

	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return fmt.Errorf("find_many failed: %w", err)
	}
	defer cursor.Close(ctx)

	var actual []bson.M
	if err := cursor.All(ctx, &actual); err != nil {
		return fmt.Errorf("failed to decode find_many results: %w", err)
	}

	expectedDocs, ok := toDocumentList(cfg["expected_documents"])
	if !ok {
		return fmt.Errorf("find_many requires 'expected_documents' array")
	}

	for _, expected := range expectedDocs {
		found := false
		for _, candidate := range actual {
			if matchesPartialDocument(candidate, expected) {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("expected document not found in find_many results")
		}
	}
	return nil
}

func (e *DocumentExecutor) updateOne(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	filter, ok := toDocumentMap(cfg["filter"])
	if !ok {
		return fmt.Errorf("update_one requires 'filter' object")
	}
	update, ok := toDocumentMap(cfg["update"])
	if !ok {
		return fmt.Errorf("update_one requires 'update' object")
	}

	result, err := collection.UpdateOne(ctx, filter, update)
	if err != nil {
		return fmt.Errorf("update_one failed: %w", err)
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("update_one matched no documents")
	}
	return nil
}

func (e *DocumentExecutor) deleteOne(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	filter, ok := toDocumentMap(cfg["filter"])
	if !ok {
		return fmt.Errorf("delete_one requires 'filter' object")
	}

	result, err := collection.DeleteOne(ctx, filter)
	if err != nil {
		return fmt.Errorf("delete_one failed: %w", err)
	}
	if result.DeletedCount == 0 {
		return fmt.Errorf("delete_one deleted no documents")
	}
	return nil
}

func (e *DocumentExecutor) countDocuments(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	filter, ok := toDocumentMap(cfg["filter"])
	if !ok {
		return fmt.Errorf("count_documents requires 'filter' object")
	}

	count, err := collection.CountDocuments(ctx, filter)
	if err != nil {
		return fmt.Errorf("count_documents failed: %w", err)
	}

	expectedCount, ok := getExpectedCount(cfg["expected_count"])
	if !ok {
		return fmt.Errorf("count_documents requires 'expected_count'")
	}
	if count != expectedCount {
		return fmt.Errorf("expected %d documents, got %d", expectedCount, count)
	}
	return nil
}

func (e *DocumentExecutor) exists(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	filter, ok := toDocumentMap(cfg["filter"])
	if !ok {
		return fmt.Errorf("exists requires 'filter' object")
	}

	count, err := collection.CountDocuments(ctx, filter)
	if err != nil {
		return fmt.Errorf("exists failed: %w", err)
	}

	expectedExists := getBoolOrDefault(cfg, "expected_exists", true)
	actualExists := count > 0
	if actualExists != expectedExists {
		return fmt.Errorf("expected exists=%v, got exists=%v", expectedExists, actualExists)
	}
	return nil
}

func toDocumentMap(value any) (map[string]any, bool) {
	switch v := value.(type) {
	case map[string]any:
		return v, true
	case bson.M:
		return map[string]any(v), true
	default:
		return nil, false
	}
}

func toDocumentList(value any) ([]map[string]any, bool) {
	rawList, ok := value.([]any)
	if ok {
		out := make([]map[string]any, 0, len(rawList))
		for _, item := range rawList {
			doc, ok := toDocumentMap(item)
			if !ok {
				return nil, false
			}
			out = append(out, doc)
		}
		return out, true
	}

	switch v := value.(type) {
	case []map[string]any:
		return v, true
	default:
		return nil, false
	}
}

func getExpectedCount(value any) (int64, bool) {
	switch v := value.(type) {
	case int:
		return int64(v), true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case float64:
		return int64(v), true
	default:
		return 0, false
	}
}

func matchesPartialDocument(actual map[string]any, expected map[string]any) bool {
	for key, expectedValue := range expected {
		actualValue, ok := actual[key]
		if !ok {
			return false
		}

		expectedDoc, expectedIsDoc := toDocumentMap(expectedValue)
		actualDoc, actualIsDoc := toDocumentMap(actualValue)
		if expectedIsDoc && actualIsDoc {
			if !matchesPartialDocument(actualDoc, expectedDoc) {
				return false
			}
			continue
		}

		if !compareValues(actualValue, expectedValue) {
			return false
		}
	}
	return true
}

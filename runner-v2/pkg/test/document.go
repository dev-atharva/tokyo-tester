package test

import (
	"context"
	"fmt"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/types"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type DocumentExecutor struct{}

func (e *DocumentExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	serviceName, ok := testCfg.Config["service"].(string)
	if !ok || serviceName == "" {
		return ConfigurationFailure(fmt.Errorf("document test requires 'service' in the configuration"))
	}

	databaseName, ok := testCfg.Config["database"].(string)
	if !ok || databaseName == "" {
		return ConfigurationFailure(fmt.Errorf("document test requires 'database' in the configuration"))
	}

	collectionName, ok := testCfg.Config["collection"].(string)
	if !ok || collectionName == "" {
		return ConfigurationFailure(fmt.Errorf("document test requires 'collection' in the configuration"))
	}

	operation, ok := testCfg.Config["operation"].(string)
	if !ok || operation == "" {
		return ConfigurationFailure(fmt.Errorf("document test requires 'operation' in the configuration"))
	}

	runtime, ok := registry.Get(serviceName)
	if !ok {
		return ConfigurationFailure(fmt.Errorf("service not found : %s", serviceName))
	}

	mongoURI := runtime.EnvVars["MONGODB_URI"]
	if mongoURI == "" {
		return ConfigurationFailure(fmt.Errorf("MONGODB_URI not found in the service runtime"))
	}
	mongoURI, err := types.NormalizeURLHost(mongoURI)
	if err != nil {
		return ConfigurationFailure(fmt.Errorf("invalid MONGODB_URI: %w", err))
	}

	client, err := mongo.Connect(options.Client().ApplyURI(mongoURI))
	if err != nil {
		return SetupFailure(fmt.Errorf("failed to connect to mongodb: %w", err))
	}
	defer func() {
		_ = client.Disconnect(ctx)
	}()

	if err := client.Ping(ctx, nil); err != nil {
		return SetupFailure(fmt.Errorf("failed to ping mongodb: %w", err))
	}

	collection := client.Database(databaseName).Collection(collectionName)

	switch operation {
	case "insert_one":
		return OperationFailure(PhaseDispatch, e.insertOne(ctx, collection, testCfg.Config))
	case "find_one":
		return OperationFailure(PhaseDispatch, e.findOne(ctx, collection, testCfg.Config))
	case "find_many":
		return OperationFailure(PhaseDispatch, e.findMany(ctx, collection, testCfg.Config))
	case "update_one":
		return OperationFailure(PhaseDispatch, e.updateOne(ctx, collection, testCfg.Config))
	case "delete_one":
		return OperationFailure(PhaseDispatch, e.deleteOne(ctx, collection, testCfg.Config))
	case "count_documents":
		return OperationFailure(PhaseDispatch, e.countDocuments(ctx, collection, testCfg.Config))
	case "exists":
		return OperationFailure(PhaseDispatch, e.exists(ctx, collection, testCfg.Config))
	default:
		return ConfigurationFailure(fmt.Errorf("unsupported document operation: %s", operation))
	}
}

func (e *DocumentExecutor) insertOne(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	document, ok := toDocumentMap(cfg["document"])
	if !ok {
		return ConfigurationFailure(fmt.Errorf("insert_one requires 'document' object"))
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
		return ConfigurationFailure(fmt.Errorf("find_one requires 'filter' object"))
	}

	var actual bson.M
	if err := collection.FindOne(ctx, filter).Decode(&actual); err != nil {
		return fmt.Errorf("find_one failed: %w", err)
	}

	expectedValue, found, err := lookupConfigValue(cfg, "expected_document")
	if err != nil {
		return ConfigurationFailure(err)
	}
	expected, ok := toDocumentMap(expectedValue)
	if !found || !ok {
		return ConfigurationFailure(fmt.Errorf("find_one requires 'expected_document' object"))
	}

	if !matchesPartialDocument(actual, expected) {
		return AssertionFailure(fmt.Errorf("find_one result did not match expected document"))
	}
	return nil
}

func (e *DocumentExecutor) findMany(ctx context.Context, collection *mongo.Collection, cfg map[string]any) error {
	filter, ok := toDocumentMap(cfg["filter"])
	if !ok {
		return ConfigurationFailure(fmt.Errorf("find_many requires 'filter' object"))
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

	expectedValue, found, err := lookupConfigValue(cfg, "expected_documents")
	if err != nil {
		return ConfigurationFailure(err)
	}
	expectedDocs, ok := toDocumentList(expectedValue)
	if !found || !ok {
		return ConfigurationFailure(fmt.Errorf("find_many requires 'expected_documents' array"))
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
			return AssertionFailure(fmt.Errorf("expected document not found in find_many results"))
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
		return AssertionFailure(fmt.Errorf("update_one matched no documents"))
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
		return AssertionFailure(fmt.Errorf("delete_one deleted no documents"))
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

	expectedCount, found, err := getInt64Config(cfg, "expected_count")
	if err != nil {
		return err
	}
	if !found {
		return ConfigurationFailure(fmt.Errorf("count_documents requires 'expected_count'"))
	}
	if count != expectedCount {
		return AssertionFailure(fmt.Errorf("expected %d documents, got %d", expectedCount, count))
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

	expectedExists, err := getBoolOrDefault(cfg, "expected_exists", true)
	if err != nil {
		return err
	}
	actualExists := count > 0
	if actualExists != expectedExists {
		return AssertionFailure(fmt.Errorf("expected exists=%v, got exists=%v", expectedExists, actualExists))
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

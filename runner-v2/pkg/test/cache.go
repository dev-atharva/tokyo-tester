package test

import (
	"context"
	"fmt"
	"time"

	"github.com/bradfitz/gomemcache/memcache"
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/redis/go-redis/v9"
)

type CacheExecutor struct{}

func (e *CacheExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	serviceName, ok := testCfg.Config["service"].(string)
	if !ok {
		return fmt.Errorf("cache test requires 'service' in config")
	}

	operation, ok := testCfg.Config["operation"].(string)
	if !ok {
		return fmt.Errorf("cache test requires 'operation' in config")
	}

	runtime, ok := registry.Get(serviceName)
	if !ok {
		return fmt.Errorf("service not found : %s", serviceName)
	}

	cacheType := getStringOrDefault(testCfg.Config, "cache_type", "")
	if cacheType == "" {
		cacheType = e.inferCacheType(runtime.EnvVars, serviceName)
	}

	switch cacheType {
	case "redis":
		return e.executeRedis(ctx, testCfg, runtime, operation)
	case "memcached":
		return e.executeMemcached(ctx, testCfg, runtime, operation)
	default:
		return fmt.Errorf("unsupported cache type : %s (expected 'redis' or 'memcached')", cacheType)
	}
}

func (e *CacheExecutor) inferCacheType(_ map[string]string, serviceName string) string {
	if len(serviceName) >= 5 && serviceName[:5] == "redis" {
		return "redis"
	}
	if len(serviceName) >= 9 && serviceName[:9] == "memcached" {
		return "memcached"
	}
	//Defaulting to redis
	return "redis"
}

func (e *CacheExecutor) executeRedis(ctx context.Context, testCfg config.TestConfig, runtime *types.ServiceRuntime, operation string) error {
	port, ok := runtime.MappedPorts["6379"]
	if !ok {
		return fmt.Errorf("redis port 6379 not mapped")
	}

	addr := fmt.Sprintf("%s:%s", runtime.Host, port)
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     getStringOrDefault(testCfg.Config, "password", ""),
		DB:           getIntOrDefault(testCfg.Config, "db", 0),
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})
	defer client.Close()

	if err := client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to radius: %w", err)
	}

	switch operation {
	case "ping":
		return e.redisOp(ctx, client, testCfg)
	case "set":
		return e.redisSet(ctx, client, testCfg)
	case "get":
		return e.redisGet(ctx, client, testCfg)
	case "exists":
		return e.redisExists(ctx, client, testCfg)
	case "delete", "del":
		return e.redisDelete(ctx, client, testCfg)
	default:
		return fmt.Errorf("unsupported redis operation: %s", operation)
	}
}

func (e *CacheExecutor) redisOp(ctx context.Context, client *redis.Client, _ config.TestConfig) error {
	return client.Ping(ctx).Err()
}

func (e *CacheExecutor) redisSet(ctx context.Context, client *redis.Client, testCfg config.TestConfig) error {
	key, ok := testCfg.Config["key"].(string)
	if !ok {
		return fmt.Errorf("set operation requires 'key' in the config")
	}
	value, ok := testCfg.Config["value"]
	if !ok {
		return fmt.Errorf("set operation requires 'value' in the config")
	}
	ttl := time.Duration(0)
	if ttlSec, ok := testCfg.Config["ttl"].(int); ok {
		ttl = time.Duration(ttlSec) * time.Second
	}
	valueStr := fmt.Sprintf("%v", value)
	return client.Set(ctx, key, valueStr, ttl).Err()
}

func (e *CacheExecutor) redisGet(ctx context.Context, client *redis.Client, testCfg config.TestConfig) error {
	key, ok := testCfg.Config["key"].(string)
	if !ok {
		return fmt.Errorf("get opertion requires 'key' in the config")
	}

	result, err := client.Get(ctx, key).Result()
	if err == redis.Nil {
		if expectedValue, ok := testCfg.Config["expected_value"]; ok && expectedValue != nil {
			return fmt.Errorf("key %s does not exist , expected: %v", key, expectedValue)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("get operation failed : %w", err)
	}

	if expectedValue, ok := testCfg.Config["expected_value"]; ok {
		expectedStr := fmt.Sprintf("%v", expectedValue)
		if result != expectedStr {
			return fmt.Errorf("expected value %q, got %q", expectedStr, result)
		}
	}
	return nil
}

func (e *CacheExecutor) redisExists(ctx context.Context, client *redis.Client, testCfg config.TestConfig) error {
	key, ok := testCfg.Config["key"].(string)
	if !ok {
		return fmt.Errorf("exists operation requires 'key' in the config")
	}

	count, err := client.Exists(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("exists operation failed : %w", err)
	}

	if expectedExists, ok := testCfg.Config["expected_exists"].(bool); ok {
		exists := count > 0
		if exists != expectedExists {
			return fmt.Errorf("expected exists=%v, got exists=%v", expectedExists, exists)
		}
	}
	return nil
}

func (e *CacheExecutor) redisDelete(ctx context.Context, client *redis.Client, testCfg config.TestConfig) error {
	key, ok := testCfg.Config["key"].(string)
	if !ok {
		return fmt.Errorf("delete operation requires 'key' in config")
	}
	return client.Del(ctx, key).Err()
}

func (e *CacheExecutor) executeMemcached(_ context.Context, testCfg config.TestConfig, runtime *types.ServiceRuntime, operation string) error {
	port, ok := runtime.MappedPorts["11211"]
	if !ok {
		return fmt.Errorf("memcached port 11211 not mapped")
	}

	addr := fmt.Sprintf("%s:%s", runtime.Host, port)
	client := memcache.New(addr)
	client.Timeout = 3 * time.Second

	if err := client.Ping(); err != nil {
		return fmt.Errorf("failed to connect to memcached: %w", err)
	}

	switch operation {
	case "ping":
		return nil
	case "set":
		return e.memCachedSet(client, testCfg)
	case "get":
		return e.memCachedGet(client, testCfg)
	case "delete", "del":
		return e.memCachedDelete(client, testCfg)
	default:
		return fmt.Errorf("unsupported memcached operation: %s", operation)
	}
}

func (e *CacheExecutor) memCachedSet(client *memcache.Client, testCfg config.TestConfig) error {
	key, ok := testCfg.Config["key"].(string)
	if !ok {
		return fmt.Errorf("set operation requires 'key' in config")
	}

	value, ok := testCfg.Config["value"]
	if !ok {
		return fmt.Errorf("set opertaion requires 'value' in config")
	}

	expiration := int32(0)
	if ttlSec, ok := testCfg.Config["ttl"].(int); ok {
		expiration = int32(ttlSec)
	}

	valueStr := fmt.Sprintf("%v", value)
	item := &memcache.Item{
		Key:        key,
		Value:      []byte(valueStr),
		Expiration: expiration,
	}

	return client.Set(item)
}

func (e *CacheExecutor) memCachedGet(client *memcache.Client, testCfg config.TestConfig) error {
	key, ok := testCfg.Config["key"].(string)
	if !ok {
		return fmt.Errorf("get operation 'key' in config")
	}

	item, err := client.Get(key)
	if err == memcache.ErrCacheMiss {
		if expectedValue, ok := testCfg.Config["expected_value"]; ok && expectedValue != nil {
			return fmt.Errorf("key %s does not exist, expected : %v", key, expectedValue)
		}
		return nil
	}

	if err != nil {
		return fmt.Errorf("get operation failed: %w", err)
	}

	if expectedValue, ok := testCfg.Config["expected_value"]; ok {
		expectedStr := fmt.Sprintf("%v", expectedValue)
		if string(item.Value) != expectedStr {
			return fmt.Errorf("expected value %q, got %q", expectedStr, string(item.Value))
		}
	}
	return nil
}

func (e *CacheExecutor) memCachedDelete(client *memcache.Client, testCfg config.TestConfig) error {
	key, ok := testCfg.Config["key"].(string)
	if !ok {
		return fmt.Errorf("delete operation requires 'key' in config")
	}

	err := client.Delete(key)
	if err == memcache.ErrCacheMiss {
		return nil
	}
	return err
}

func getIntOrDefault(cfg map[string]any, key string, defaultValue int) int {
	if val, ok := cfg[key].(int); ok {
		return val
	}

	if val, ok := cfg[key].(float64); ok {
		return int(val)
	}
	return defaultValue
}

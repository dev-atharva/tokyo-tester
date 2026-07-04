package test

import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"
	"unicode"
)

func lookupConfigValue(cfg map[string]any, key string) (any, bool, error) {
	canonical, hasCanonical := cfg[key]
	aliasKey := snakeToLowerCamel(key)
	alias, hasAlias := cfg[aliasKey]
	hasCanonical = hasCanonical && canonical != nil
	hasAlias = hasAlias && alias != nil

	if hasCanonical && hasAlias && !equivalentConfigValues(canonical, alias) {
		return nil, false, fmt.Errorf("conflicting values for %q and %q", key, aliasKey)
	}
	if hasCanonical {
		return canonical, true, nil
	}
	if hasAlias {
		return alias, true, nil
	}
	return nil, false, nil
}

func snakeToLowerCamel(key string) string {
	var result strings.Builder
	upperNext := false
	for _, r := range key {
		if r == '_' {
			upperNext = true
			continue
		}
		if upperNext {
			result.WriteRune(unicode.ToUpper(r))
			upperNext = false
			continue
		}
		result.WriteRune(r)
	}
	return result.String()
}

func equivalentConfigValues(left, right any) bool {
	if reflect.DeepEqual(left, right) {
		return true
	}
	leftNumber, leftOK := numberAsFloat64(left)
	rightNumber, rightOK := numberAsFloat64(right)
	if leftOK && rightOK {
		return leftNumber == rightNumber
	}
	leftBool, leftOK := boolValue(left)
	rightBool, rightOK := boolValue(right)
	return leftOK && rightOK && leftBool == rightBool
}

func getStringOrDefault(cfg map[string]any, key, defaultValue string) (string, error) {
	value, found, err := lookupConfigValue(cfg, key)
	if err != nil || !found {
		return defaultValue, err
	}
	switch typed := value.(type) {
	case string:
		return typed, nil
	case json.Number:
		return typed.String(), nil
	case int:
		return strconv.Itoa(typed), nil
	case int32:
		return strconv.FormatInt(int64(typed), 10), nil
	case int64:
		return strconv.FormatInt(typed, 10), nil
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32), nil
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), nil
	default:
		return defaultValue, fmt.Errorf("%s must be a string or number, got %T", key, value)
	}
}

func getIntOrDefault(cfg map[string]any, key string, defaultValue int) (int, error) {
	value, found, err := lookupConfigValue(cfg, key)
	if err != nil || !found {
		return defaultValue, err
	}
	parsed, ok := int64Value(value)
	if !ok || int64(int(parsed)) != parsed {
		return defaultValue, fmt.Errorf("%s must be an integer, got %v (%T)", key, value, value)
	}
	return int(parsed), nil
}

func getInt64Config(cfg map[string]any, key string) (int64, bool, error) {
	value, found, err := lookupConfigValue(cfg, key)
	if err != nil || !found {
		return 0, found, err
	}
	parsed, ok := int64Value(value)
	if !ok {
		return 0, true, fmt.Errorf("%s must be an integer, got %v (%T)", key, value, value)
	}
	return parsed, true, nil
}

func getBoolOrDefault(cfg map[string]any, key string, defaultValue bool) (bool, error) {
	value, found, err := lookupConfigValue(cfg, key)
	if err != nil || !found {
		return defaultValue, err
	}
	parsed, ok := boolValue(value)
	if !ok {
		return defaultValue, fmt.Errorf("%s must be a boolean, got %v (%T)", key, value, value)
	}
	return parsed, nil
}

func getStringMap(cfg map[string]any, key string) (map[string]string, bool, error) {
	value, found, err := lookupConfigValue(cfg, key)
	if err != nil || !found {
		return nil, found, err
	}
	switch typed := value.(type) {
	case map[string]string:
		return typed, true, nil
	case map[string]any:
		result := make(map[string]string, len(typed))
		for mapKey, mapValue := range typed {
			stringValue, ok := mapValue.(string)
			if !ok {
				return nil, true, fmt.Errorf("%s.%s must be a string, got %T", key, mapKey, mapValue)
			}
			result[mapKey] = stringValue
		}
		return result, true, nil
	default:
		return nil, true, fmt.Errorf("%s must be an object with string values, got %T", key, value)
	}
}

func int64Value(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int32:
		return int64(typed), true
	case int64:
		return typed, true
	case float32:
		return integralFloat64(float64(typed))
	case float64:
		return integralFloat64(typed)
	case json.Number:
		return parseIntegerString(typed.String())
	case string:
		return parseIntegerString(strings.TrimSpace(typed))
	default:
		return 0, false
	}
}

func parseIntegerString(value string) (int64, bool) {
	if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
		return parsed, true
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, false
	}
	return integralFloat64(parsed)
}

func integralFloat64(value float64) (int64, bool) {
	if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value || value < math.MinInt64 || value >= -float64(math.MinInt64) {
		return 0, false
	}
	return int64(value), true
}

func boolValue(value any) (bool, bool) {
	switch typed := value.(type) {
	case bool:
		return typed, true
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
		return parsed, err == nil
	case json.Number:
		return numericBool(typed.String())
	case int:
		return numericBool(strconv.Itoa(typed))
	case int32:
		return numericBool(strconv.FormatInt(int64(typed), 10))
	case int64:
		return numericBool(strconv.FormatInt(typed, 10))
	case float32:
		return numericBool(strconv.FormatFloat(float64(typed), 'f', -1, 32))
	case float64:
		return numericBool(strconv.FormatFloat(typed, 'f', -1, 64))
	default:
		return false, false
	}
}

func numericBool(value string) (bool, bool) {
	switch value {
	case "0":
		return false, true
	case "1":
		return true, true
	default:
		return false, false
	}
}

func numberAsFloat64(value any) (float64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	case int:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case float32:
		return float64(typed), true
	case float64:
		return typed, true
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

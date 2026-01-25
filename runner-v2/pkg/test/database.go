package test

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/types"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
)

// Execute the database test
type DatabaseExecutor struct{}

// Runs the database test
func (e *DatabaseExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	query, ok := testCfg.Config["query"].(string)
	if !ok {
		return fmt.Errorf("database test requires 'query' in the configuration")
	}
	serviceName, ok := testCfg.Config["service"].(string)
	if !ok {
		return fmt.Errorf("database test requires 'service' in the configuration")
	}

	driver, ok := testCfg.Config["driver"].(string)
	if !ok {
		return fmt.Errorf("database test requires 'driver' in the configuration")
	}

	runtime, ok := registry.Get(serviceName)
	if !ok {
		return fmt.Errorf("service not found : %s", serviceName)
	}

	connStr, err := e.buildConnectionString(driver, runtime, testCfg.Config)
	if err != nil {
		return fmt.Errorf("failed to build the connection string")
	}

	db, err := sql.Open(driver, connStr)
	if err != nil {
		return fmt.Errorf("failed to connect to teh database : %w", err)
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping the database : %w", err)
	}

	//Exexute the query
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	if expectedResult, ok := testCfg.Config["expected_result"]; ok {
		return e.validateResult(rows, expectedResult)
	}
	return nil
}

func (e *DatabaseExecutor) buildConnectionString(driver string, runtime *types.ServiceRuntime, cfg map[string]any) (string, error) {
	switch driver {
	case "mysql", "mariadb":
		database := getStringOrDefault(cfg, "database", "testdb")
		user := getStringOrDefault(cfg, "user", "root")
		password := getStringOrDefault(cfg, "password", "root")
		port, ok := runtime.MappedPorts["3306"]
		if !ok {
			return "", fmt.Errorf("mysql port 3306 not exposed")
		}
		// user:password@tcp(host:port)/dbname?params
		return fmt.Sprintf(
			"%s:%s@tcp(%s:%s)/%s?parseTime=true&multiStatements=true",
			user,
			password,
			runtime.Host,
			port,
			database,
		), nil

	case "postgres":
		database := getStringOrDefault(cfg, "database", "testdb")
		user := getStringOrDefault(cfg, "user", "postgres")
		password := getStringOrDefault(cfg, "password", "postgres")
		port := runtime.MappedPorts["5432"]
		return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable", runtime.Host, port, user, password, database), nil
	default:
		return "", fmt.Errorf("unsuopported driver: %s", driver)
	}
}

func (e *DatabaseExecutor) validateResult(rows *sql.Rows, expected any) error {
	normalized, err := normalizeExpected(expected)
	if err != nil {
		return err
	}
	switch v := normalized.(type) {
	case bool:
		return e.validateRowsExit(rows, v)
	case map[string]any:
		return e.validateStructured(rows, v)
	case []any:
		return e.validateValueList(rows, v)
	case string, int, int64, float64:
		return e.validateSingleValue(rows, v)
	default:
		return fmt.Errorf("unsupported expected_result type: %T", normalized)
	}
}

func (e *DatabaseExecutor) validateRowsExit(rows *sql.Rows, expected bool) error {
	hasRows := rows.Next()
	if expected && !hasRows {
		return fmt.Errorf("expected results but got none")
	}
	if !expected && hasRows {
		return fmt.Errorf("expected no results but got rows")
	}
	return nil
}

func (e *DatabaseExecutor) validateSingleValue(rows *sql.Rows, expected any) error {
	cols, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("failed to get columns %w", err)
	}
	for rows.Next() {
		values := make([]any, len(cols))
		valuePtrs := make([]any, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return fmt.Errorf("failed to scan row: %w", err)
		}

		for _, val := range values {
			if compareValues(val, expected) {
				return nil
			}
		}
	}
	return fmt.Errorf("expected value %v not found in results", expected)
}

func (e *DatabaseExecutor) validateValueList(rows *sql.Rows, expected []any) error {
	cols, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("failed to get columns : %w", err)
	}

	var allValues []any
	for rows.Next() {
		values := make([]any, len(cols))
		valuePtrs := make([]any, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return fmt.Errorf("failed to scan row: %w", err)
		}
		allValues = append(allValues, values...)
	}

	for _, expectedVal := range expected {
		found := false
		for _, actualVal := range allValues {
			if compareValues(actualVal, expectedVal) {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("expected value %v not found in results", expectedVal)
		}
	}
	return nil
}

func (e *DatabaseExecutor) validateStructured(rows *sql.Rows, rules map[string]any) error {
	cols, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("failed to get columns: %w", err)
	}

	var allRows []map[string]any
	for rows.Next() {
		values := make([]any, len(cols))
		valuePtrs := make([]any, len(cols))

		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return fmt.Errorf("failed to scan row : %w", err)
		}
		rowMap := make(map[string]any)
		for i, col := range cols {
			rowMap[col] = values[i]
		}
		allRows = append(allRows, rowMap)
	}

	if minRows, ok := rules["min_rows"].(float64); ok {
		if len(allRows) < int(minRows) {
			return fmt.Errorf("expected at least %d rows , got %d", int(minRows), len(allRows))
		}
	}
	if maxRows, ok := rules["max_rows"].(float64); ok {
		if len(allRows) > int(maxRows) {
			return fmt.Errorf("expected at most %d rows, got %d", int(maxRows), len(allRows))
		}
	}

	if columns, ok := rules["columns"].(map[string]any); ok {
		for colName, colRules := range columns {
			if err := e.validateColumn(allRows, colName, colRules); err != nil {
				return fmt.Errorf("column %s validation failed: %w", colName, err)
			}
		}
	}
	return nil
}

func (e *DatabaseExecutor) validateColumn(rows []map[string]any, colName string, rules any) error {
	rulesMap, ok := rules.(map[string]any)
	if !ok {
		return fmt.Errorf("invalid column rules format")
	}

	columnExists := false
	for _, row := range rows {
		if _, exists := row[colName]; exists {
			columnExists = true
			break
		}
	}
	if !columnExists {
		return fmt.Errorf("column not found in results")
	}

	if expectedValue, ok := rulesMap["value"]; ok {
		found := false
		for _, row := range rows {
			if val, exists := row[colName]; exists && compareValues(val, expectedValue) {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("expected value %v not found", expectedValue)
		}
	}

	if inList, ok := rulesMap["in"].([]any); ok {
		for _, row := range rows {
			if val, exists := row[colName]; exists {
				found := false
				for _, allowedVal := range inList {
					if compareValues(val, allowedVal) {
						found = true
						break
					}
				}
				if !found {
					return fmt.Errorf("value %v no in allowed list", val)
				}
			}
		}
	}

	if contains, ok := rulesMap["contains"].(string); ok {
		found := false
		for _, row := range rows {
			if val, exists := row[colName]; exists {
				if strVal, ok := convertToString(val); ok {
					if len(strVal) > 0 && len(contains) > 0 {
						for i := 0; i <= len(strVal)-len(contains); i++ {
							if strVal[i:i+len(contains)] == contains {
								found = true
								break
							}
						}
					}
				}
				if found {
					break
				}
			}
		}
		if !found {
			return fmt.Errorf("substring %q not found in any value", contains)
		}
	}
	return nil
}

func normalizeExpected(expected any) (any, error) {
	m, ok := expected.(map[string]any)
	if !ok {
		return expected, nil
	}

	mode, ok := m["mode"].(string)
	if !ok {
		return nil, fmt.Errorf("expected_result missing mode")
	}
	switch mode {
	case "rows":
		v, ok := m["value"].(bool)
		if !ok {
			return nil, fmt.Errorf("rows mode expects boolean value")
		}
		return v, nil
	case "single":
		return m["value"], nil
	case "list":
		v, ok := m["value"].([]any)
		if !ok {
			return nil, fmt.Errorf("list mode expects list of values")
		}
		return v, nil
	case "structured":
		rules := make(map[string]any)
		for k, v := range m {
			if k != "mode" {
				rules[k] = v
			}
		}
		return rules, nil
	default:
		return nil, fmt.Errorf("unknown expected_result mode: %s", mode)
	}
}

func compareValues(actual, expected any) bool {
	if actualBytes, ok := actual.([]byte); ok {
		actual = string(actualBytes)
	}

	if actual == expected {
		return true
	}

	actualStr, actualIsStr := convertToString(actual)
	expectedStr, expectedIsStr := convertToString(expected)
	if actualIsStr && expectedIsStr {
		return actualStr == expectedStr
	}

	actualNum, actualIsNum := convertToFloat64(actual)
	expectedNum, expectedIsNum := convertToFloat64(expected)
	if actualIsNum && expectedIsNum {
		return actualNum == expectedNum
	}
	return false
}

func convertToString(val any) (string, bool) {
	switch v := val.(type) {
	case string:
		return v, true
	case []byte:
		return string(v), true
	case fmt.Stringer:
		return v.String(), true
	default:
		return "", false
	}
}

func convertToFloat64(val any) (float64, bool) {
	switch v := val.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	default:
		return 0, false
	}
}

func getStringOrDefault(cfg map[string]any, key, defaultValue string) string {
	if val, ok := cfg[key].(string); ok {
		return val
	}
	return defaultValue
}

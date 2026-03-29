package db

import (
	"context"
	"database/sql"
	"regexp"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
)

const SlowQueryThreshold = 100

type LoggedDB struct {
	*sql.DB
	dbType string
}

func NewLoggedDB(db *sql.DB, dbType string) *LoggedDB {
	return &LoggedDB{
		DB:     db,
		dbType: dbType,
	}
}

func (l *LoggedDB) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	start := time.Now()

	ctx, span := telemetry.StartSpan(ctx, "db.exec", telemetry.QueryAttr(sanitizeQuery(query)), telemetry.DBTypeAttr(l.dbType))
	defer span.End()

	result, err := l.DB.ExecContext(ctx, query, args...)
	duration := time.Since(start)

	var rowsAffetcted int64
	if result != nil {
		rowsAffetcted, _ = result.RowsAffected()
	}
	logQuery(ctx, "exec", query, duration, rowsAffetcted, err, l.dbType)

	telemetry.AddSpanAttributes(ctx, attribute.Int64("db.rows_affected", rowsAffetcted), attribute.Int64("db.duration_ms", int64(duration.Milliseconds())))

	if err != nil {
		telemetry.RecordError(ctx, err)
	}
	return result, err
}

func (l *LoggedDB) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	start := time.Now()

	ctx, span := telemetry.StartSpan(ctx, "db.query", telemetry.QueryAttr(sanitizeQuery(query)), telemetry.DBTypeAttr(l.dbType))
	defer span.End()

	rows, err := l.DB.QueryContext(ctx, query, args...)
	duration := time.Since(start)

	logQuery(ctx, "query", query, duration, -1, err, l.dbType)

	telemetry.AddSpanAttributes(ctx, attribute.Int64("db.attribute_ms", duration.Milliseconds()))

	if err != nil {
		telemetry.RecordError(ctx, err)
	}
	return rows, err
}

func (l *LoggedDB) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	start := time.Now()

	ctx, span := telemetry.StartSpan(ctx, "db.query_row", telemetry.QueryAttr(sanitizeQuery(query)), telemetry.DBTypeAttr(l.dbType))
	defer span.End()

	row := l.DB.QueryRowContext(ctx, query, args...)
	duration := time.Since(start)

	logQuery(ctx, "query_row", query, duration, -1, nil, l.dbType)

	telemetry.AddSpanAttributes(ctx, attribute.Int64("db.duration_ms", int64(duration.Milliseconds())))

	return row
}

func (l *LoggedDB) BeginTx(ctx context.Context, opts *sql.TxOptions) (*sql.Tx, error) {
	start := time.Now()

	tx, err := l.DB.BeginTx(ctx, opts)
	duration := time.Since(start)

	logger.Debug("db transaction started", "db_type", l.dbType, "duration_ms", duration.Milliseconds(), "error", err)

	return tx, err
}

func logQuery(_ context.Context, operation, query string, duration time.Duration, rowsAffected int64, err error, dbType string) {
	durationMs := duration.Milliseconds()
	sanitized := sanitizeQuery(query)

	logArgs := []any{
		"operation", operation,
		"query", sanitized,
		"duration_ms", durationMs,
		"db_type", dbType,
	}

	if rowsAffected >= 0 {
		logArgs = append(logArgs, "rows_affected", rowsAffected)
	}

	if err != nil {
		logArgs = append(logArgs, "error", err)
		logger.Error("db query failed", logArgs...)
		return
	}

	if durationMs > SlowQueryThreshold {
		logger.Warn("slow query detected", logArgs...)
		return
	}

	logger.Debug("db query executed", logArgs...)
}

func sanitizeQuery(query string) string {
	re := regexp.MustCompile(`\s+`)
	sanitized := re.ReplaceAllString(query, " ")
	sanitized = strings.TrimSpace(sanitized)

	if len(sanitized) > 500 {
		sanitized = sanitized[:500] + "..."
	}

	return sanitized
}

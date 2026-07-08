# Service graph and readiness

Model only services and infrastructure proven by repository evidence or user answers.

## Nodes

- Use `generic` for application services and set `image`.
- Use provider nodes for PostgreSQL, MySQL, MariaDB, Redis, Memcached, MongoDB, RabbitMQ, and Kafka.
- Preserve the workflow bundle contract field name `waitStratergy`.
- Use stable ids and human labels; tests target sanitized labels from validation.

## Edges

- `calls`: service-to-service API or RPC dependency.
- `reads` / `writes`: data dependency direction.
- `publishes` / `consumes`: message broker direction.
- `none`: architecture-only relationship with no startup ordering.

## Readiness

- `source_requires_target`: source must wait for target before starting.
- `target_requires_source`: target must wait for source before starting.
- Runtime references such as `${db.host}` require a readiness path from the referencing service to the referenced service.
- Avoid cycles by making architecture-only edges `none` when they do not represent startup order.

## Secrets

Never inline registry credentials, authorization headers, cookies, private keys, or production passwords. Use test-safe defaults only when the repo already uses them for local/dev execution.

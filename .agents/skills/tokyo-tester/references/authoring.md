# Workflow authoring reference

## Bundle shape

Use schema version 2 and kind `cots.workflow-bundle`. A bundle contains one workflow graph and at least one scenario. Retrieve the live detailed contract with `tokyo_get_capabilities`; the published JSON Schema is `contracts/workflow-bundle-v2.schema.json` in the Tokyo Tester repository.

## Graph modeling

- Give every node a stable unique id and a human-readable label.
- Use `generic` for the user's application image; it requires `image`.
- Use provider types for infrastructure: PostgreSQL, MySQL, MariaDB, Redis, Memcached, MongoDB, RabbitMQ, or Kafka.
- Reference another service at runtime with `${service_name.host}` or `${service_name.env.KEY}` only when the readiness graph makes that service reachable.
- Use `source_requires_target` when the source must wait for the target, `target_requires_source` for the reverse, and `none` for architecture-only relationships.

## Test design

- HTTP: exercise a container port and assert status plus a stable response fragment.
- Database/document/cache/queue: pair an application action with a direct infrastructure assertion when proving integration behavior.
- Shell: reserve for checks that cannot be expressed through a specialized test type.
- Delay: use only for an externally asynchronous transition; prefer readiness and deterministic polling where available.
- Put every test id exactly once in `testOrder`. Use `dependsOnTestIds` for actual data or control dependencies.

## Repair loop

Validation errors contain a code, JSON pointer, message, and suggestion. Edit only the pointed portion unless the error reveals a mistaken service model. Runtime diagnostics are redacted; correlate scenario and test names with repository logs and configuration before changing expectations.

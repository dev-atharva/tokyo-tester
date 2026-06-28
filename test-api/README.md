# Tokyo Tester fixture application

This image contains several deterministic application roles used by the sample workflow bundles.

## Roles

- No `APP_ROLE`: the backward-compatible PostgreSQL user API on port `8081`.
- `payment-api`: payment orchestration HTTP API on port `8080`.
- `settlement-worker`: RabbitMQ consumer that settles payments and emits Kafka events.
- `fault-lab`: deterministic status and delay endpoints used by the resilience bundle.
- `crash-on-start`: exits with code 42 to test provisioning diagnostics.

Build both supported image tags from the repository root:

```bash
make test-api-build
```

Then import either [`test-payment-platform.json`](../test-payment-platform.json) or
[`test-payment-resilience.json`](../test-payment-resilience.json) in the Tokyo Tester UI.

The passing fixture provisions up to ten containers and can require 4–6 GB of Docker memory.
The first run also downloads PostgreSQL, MySQL, MariaDB, Redis, Memcached, MongoDB, RabbitMQ,
Kafka, and the fixture image. Run the complete automated matrix explicitly with:

```bash
make test-complex-e2e
```

Unit tests and type checking remain lightweight:

```bash
cd test-api
bun run typecheck
bun test
```

All credentials in the bundles are deterministic fixture-only values and must not be reused
outside local testing.

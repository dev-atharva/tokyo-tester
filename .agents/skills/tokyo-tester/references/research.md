# Multi-repo research checklist

Use this checklist before authoring a workflow. Keep notes compact; do not send raw files or secrets to Tokyo Tester MCP.

## Repository discovery

- Identify all repos that make up the application cluster.
- Map each repo to service names, deployables, worker roles, and shared libraries.
- Record unknown ownership or missing repos as open questions.

## Evidence to collect per service

- Build: Dockerfile, Compose service, image tag, build context, command, entrypoint.
- Runtime: container port, health/readiness endpoint or log, required env/config, feature flags.
- Dependencies: database DSNs, cache hosts, broker URLs, service URLs, object/document stores.
- Data: migrations, seed scripts, schemas, collections, queues, topics, exchanges, indexes.
- API: routes, OpenAPI specs, RPC contracts, GraphQL schemas, message handlers.
- Tests: existing integration/e2e tests, fixtures, expected statuses, stable response fragments.

## Provenance notes

For each service, keep a short provenance line:

```text
service_name: repo path; build evidence; runtime evidence; dependency evidence; test evidence; gaps
```

If a required endpoint, topic, schema, credential, or assertion is not evidenced, ask the user a targeted question instead of inventing it.

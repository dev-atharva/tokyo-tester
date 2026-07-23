# Kubernetes DinD deployment runbook (parked)

> This topology is not supported by the Docker stabilization release. It is retained only as historical reference. Do not deploy it where privileged DinD is unavailable. Kubernetes re-entry will use native, namespace-scoped execution after the Docker release gates pass.

This runbook deploys Tokyo Tester to Kubernetes with the current Docker/Testcontainers runner architecture. The runner Pod includes a privileged Docker-in-Docker sidecar and talks to it through a shared Unix socket at `/var/run/docker.sock`.

Use this as the transitional Kubernetes deployment. Do not mix native Kubernetes provisioning into this first rollout.

References:

- Testcontainers Go documents Docker-in-Docker patterns for containerized runners: <https://golang.testcontainers.org/system_requirements/ci/dind_patterns/>
- Testcontainers Go supports `DOCKER_HOST`, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`, `TESTCONTAINERS_HOST_OVERRIDE`, and `TESTCONTAINERS_RYUK_DISABLED`: <https://golang.testcontainers.org/features/configuration/>
- Kubernetes Restricted Pod Security does not allow privileged containers: <https://kubernetes.io/docs/concepts/security/pod-security-standards/>
- Public routing can use Ingress or LoadBalancer Services: <https://kubernetes.io/docs/concepts/services-networking/ingress/>

## Deployment shape

The manifests live in [`k8s/dind`](../k8s/dind).

- `tokyo-ui`: 1-replica Deployment, ClusterIP Service on port `3000`, PVC at `/app/data`
- `tokyo-mcp`: 1-replica Deployment, ClusterIP Service on port `8090`
- `tokyo-runner`: 1-replica Deployment, private ClusterIP Service on port `8080`, PVC at `/app/data`
- `docker:27-dind`: privileged sidecar inside the runner Pod
- `docker-run`: `emptyDir` shared at `/var/run` so runner can use the DinD Unix socket
- `docker-graph`: `emptyDir` mounted at `/var/lib/docker` for ephemeral inner Docker state

Runner stays at one replica because the embedded SQLite worker and PVC are single-writer, and each runner Pod would own a separate DinD daemon.

## Build and push images

Use a pinned tag, usually the Git SHA:

```bash
export REGISTRY=ghcr.io/your-org
export IMAGE_TAG=$(git rev-parse --short HEAD)

docker build -t "$REGISTRY/tokyo-runner:$IMAGE_TAG" --target runner ./runner-v2
docker build -t "$REGISTRY/tokyo-mcp:$IMAGE_TAG" --target mcp ./runner-v2
docker build -t "$REGISTRY/tokyo-ui:$IMAGE_TAG" ./ui-v2

docker push "$REGISTRY/tokyo-runner:$IMAGE_TAG"
docker push "$REGISTRY/tokyo-mcp:$IMAGE_TAG"
docker push "$REGISTRY/tokyo-ui:$IMAGE_TAG"
```

The Makefile also has shortcuts:

```bash
make k8s-build-images IMAGE_REGISTRY=ghcr.io/your-org IMAGE_TAG="$IMAGE_TAG"
make k8s-push-images IMAGE_REGISTRY=ghcr.io/your-org IMAGE_TAG="$IMAGE_TAG"
```

## Configure manifests

Create the namespace and secrets:

```bash
kubectl apply -f k8s/dind/namespace.yaml
kubectl -n tokyo-tester create secret generic tokyo-secrets \
  --from-literal=auth-secret="$(openssl rand -hex 32)" \
  --from-literal=workflow-job-encryption-key="$(openssl rand -base64 32)"
```

Then edit:

- [`k8s/dind/configmap.yaml`](../k8s/dind/configmap.yaml): set `public-origin` to `https://<domain>`
- [`k8s/dind/ingress.yaml`](../k8s/dind/ingress.yaml): set the host to `<domain>`
- [`k8s/dind/kustomization.yaml`](../k8s/dind/kustomization.yaml): set image registry and tag values
- PVC storage classes and sizes if your cluster needs explicit `storageClassName`

The namespace is labeled with `pod-security.kubernetes.io/enforce: privileged` because DinD requires a privileged container. Keep this namespace dedicated to Tokyo Tester runner infrastructure.

## Deploy

Render first, then apply:

```bash
make k8s-render
kubectl apply -k k8s/dind
```

The provided Ingress routes:

- `https://<domain>/mcp` to `tokyo-mcp:8090`
- `https://<domain>/` to `tokyo-ui:3000`

The runner Service is ClusterIP only and should not be exposed through your load balancer.

## Runner and DinD behavior

The runner waits until `docker info` succeeds, then starts with `exec /app/cots -migrate`. If DinD is missing, blocked by Pod Security, or unhealthy, the runner never accepts workflows.

Important runner environment:

```dotenv
DOCKER_HOST=unix:///var/run/docker.sock
TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1
TESTCONTAINERS_RYUK_DISABLED=true
JANITOR_ENABLED=true
WORKFLOW_WORKER_ENABLED=true
WORKFLOW_WORKER_CONCURRENCY=1
WORKFLOW_SCENARIO_CONCURRENCY=1
```

`TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1` is intentional: containers in one Kubernetes Pod share the same network namespace, so ports published by the inner Docker daemon are reachable from the runner container through localhost.

Ryuk is disabled because DinD storage is isolated to the runner Pod and Tokyo Tester has its own janitor. Keep janitor enabled.

## Registry and workflow images

Kubernetes `imagePullSecrets` only help kubelet pull the Tokyo Tester application images. They do not automatically authenticate the inner Docker daemon used by DinD.

For workflow service images, use one of these approaches:

- keep workflow images in a registry DinD can pull without credentials
- bake required public fixture images into a custom DinD image for staging
- mount a Docker config secret into the runner/DinD Pod and configure `DOCKER_CONFIG`
- add an explicit, audited `docker login` step to the runner startup wrapper

Do not send registry credentials, source files, or large manifests through MCP tools.

## Network policy

[`k8s/dind/networkpolicy.example.yaml`](../k8s/dind/networkpolicy.example.yaml) is not included in the default kustomization because ingress controller labels vary by cluster. The committed example only makes the runner private to the UI, which is the portable part.

Use it as a starting point, then add cluster-specific UI and MCP ingress rules:

- allow public or load-balancer ingress only to UI and MCP
- allow UI to call runner
- allow MCP to call UI
- deny public access to runner

## Smoke test

1. Deploy namespace, secrets, PVCs, Deployments, Services, and routing.
2. Check runner logs for `waiting for DinD`, then Docker startup success.
3. Verify health:

```bash
kubectl -n tokyo-tester rollout status deploy/tokyo-runner
kubectl -n tokyo-tester rollout status deploy/tokyo-ui
kubectl -n tokyo-tester rollout status deploy/tokyo-mcp
kubectl -n tokyo-tester port-forward svc/tokyo-runner 8080:8080
curl -fsS http://localhost:8080/health
curl -fsS https://<domain>/api/health
curl -fsS https://<domain>/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"ping"}'
```

4. Open `https://<domain>/setup`, create the first admin, and log in.
5. Import a small workflow whose images DinD can pull.
6. Run one HTTP workflow and one workflow with a predefined dependency such as Postgres or Redis.
7. Confirm scenario results stream into the UI and the results modal shows every scenario.
8. Restart UI, MCP, and runner Pods one at a time and repeat a small workflow run.
9. In staging, break DinD or remove privileged permission and confirm the runner fails startup instead of accepting workflows.

## Troubleshooting

- Runner stays in startup wait: inspect `kubectl -n tokyo-tester logs deploy/tokyo-runner -c dind` and confirm the namespace permits privileged Pods.
- Workflow images fail to pull: authenticate the inner DinD daemon or publish the workflow images where it can pull them.
- UI can load but workflows do not run: verify UI can reach `http://tokyo-runner:8080` from inside the namespace.
- MCP connects but cannot operate: verify `TOKYO_TESTER_APP_URL=http://tokyo-ui:3000` and token authentication from the UI.
- Results appear incomplete: check runner logs and SSE connectivity; the UI now reconciles stored execution snapshots when realtime events lag.
- Disk pressure grows: lower workflow concurrency, increase node/PVC capacity, or restart the runner Pod after runs complete to clear ephemeral DinD graph data.

## Future native Kubernetes provisioning

Track native Kubernetes provisioning as a separate architecture change. The future runner should add a provisioning backend abstraction:

- Docker backend: current Testcontainers behavior
- Kubernetes backend: creates Pods, Services, ConfigMaps, Secrets, Jobs, and cleanup records

Expected future behavior:

- workflow services become Kubernetes workloads
- service ports become ClusterIP Services
- tests run from the runner or per-scenario Kubernetes Jobs
- logs come from Kubernetes Pod logs
- cleanup deletes resources by workflow/session labels
- no DinD, no Docker socket, and no privileged runner Pod

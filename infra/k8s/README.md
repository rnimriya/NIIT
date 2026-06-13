# Kubernetes / Helm

A single reusable chart (`neet-service`) renders each backend service and the web
app from a per-service values file in `helm/values/`.

## Deploy

```bash
kubectl create namespace neet
kubectl -n neet apply -f helm/secrets.example.yaml   # after filling real values

# Stateful deps (managed in prod via Terraform: RDS, MSK/Redpanda, ClickHouse,
# ElastiCache). For a quick cluster test you can run them in-cluster via Helm
# charts (bitnami/postgresql, redpanda, etc.) — not included here.

for svc in auth ai tests prediction study payments notifications analytics web; do
  helm upgrade --install "$svc" ./neet-service -n neet -f "helm/values/$svc.yaml"
done
```

## Validate locally (no cluster)

```bash
helm lint ./neet-service
helm template auth ./neet-service -f helm/values/auth.yaml
```

CI runs `helm lint` + `helm template` for every values file on each push.

Notes:
- Each backend exposes `/healthz` (liveness) and `/readyz` (readiness); the web
  app uses `/`.
- Secrets come from the `neet-secrets` Secret via `envFrom`; non-secret config
  (in-cluster service URLs, broker addresses) is set per service under `env`.
- Production ingress/cert-manager and the in-cluster DNS for managed deps
  (`redpanda`, `clickhouse`, RDS endpoint) are environment-specific and wired
  through the Secret + values.

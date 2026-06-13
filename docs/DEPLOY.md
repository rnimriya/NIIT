# Deploy Runbook

How to take this repo from "green in CI" to "running on AWS EKS". Everything
below is the real, file-accurate path; the one thing it can't do for you is run
against your AWS account.

```
Terraform (cloud infra) ─▶ EKS + RDS + Redis + MSK + ECR
GHCR images (release.yml) ─▶ ghcr.io/<owner>/neet-ai/<svc>:<tag>
Helm (neet-service chart) ─▶ Deployments + Services + HPAs, fed by neet-secrets
```

## 0. Prerequisites

- AWS account + `aws` CLI configured; `terraform` ≥ 1.6; `kubectl`; `helm` ≥ 3.
- Images published: push a tag (`git tag v0.1.0 && git push origin v0.1.0`) →
  the **Release** workflow publishes all 9 images to GHCR.

## 1. Provision cloud infrastructure

```bash
cd infra/terraform
terraform init      # configure an S3 backend for shared state
terraform apply     # ~15–20 min (EKS is the long pole)
terraform output    # note: eks_cluster_name, rds_endpoint, redis_endpoint, msk_cluster_arn
```

RDS uses an AWS-managed master password (Secrets Manager). Fetch it:

```bash
aws secretsmanager list-secrets --query "SecretList[?contains(Name,'rds')].Name"
aws secretsmanager get-secret-value --secret-id <name> --query SecretString --output text
```

## 2. Connect kubectl to the cluster

```bash
aws eks update-kubeconfig --name "$(terraform output -raw eks_cluster_name)" \
  --region "$(terraform output -raw region)"
kubectl get nodes
```

## 3. Stateful dependencies the services expect

The Helm values address Kafka as `redpanda:9092` and ClickHouse as
`clickhouse:8123` (the compose service names). For the **first** cloud deploy,
run those two in-cluster so the names resolve unchanged; RDS + Redis come from
Terraform:

```bash
kubectl create namespace neet

# Redpanda (Kafka API) — Bitnami chart, service name "redpanda"
helm repo add redpanda https://charts.redpanda.com && helm repo update
helm upgrade --install redpanda redpanda/redpanda -n neet \
  --set statefulset.replicas=1 --set fullnameOverride=redpanda

# ClickHouse — Bitnami chart, service name "clickhouse"
helm repo add bitnami https://charts.bitnami.com/bitnami
helm upgrade --install clickhouse bitnami/clickhouse -n neet \
  --set fullnameOverride=clickhouse --set auth.password=<choose>
```

> **Production upgrade (documented follow-up, not wired yet):** swap to the
> Terraform-provisioned **MSK Serverless** and a managed **ClickHouse Cloud**.
> MSK uses IAM SASL — the `@neet/events` `EventBus` currently connects with plain
> brokers, so MSK requires adding SASL/OAUTHBEARER (aws-msk-iam) config there
> first. Until then, in-cluster Redpanda is the supported path.

## 4. Image pull secret (private GHCR)

```bash
kubectl create secret docker-registry ghcr-pull -n neet \
  --docker-server=ghcr.io --docker-username=<gh-user> \
  --docker-password=<gh-PAT-with-read:packages>
```

(Or make the GHCR packages public and skip this.)

## 5. App secrets

```bash
cp infra/k8s/helm/secrets.example.yaml /tmp/neet-secrets.yaml
# Fill: DATABASE_URL (postgres://neet:<rds-pass>@<rds_endpoint>:5432/neet),
#       JWT_DEV_SECRET, ANTHROPIC_API_KEY, STRIPE_*, RESEND_API_KEY,
#       CLICKHOUSE_PASSWORD (match step 3).
kubectl apply -n neet -f /tmp/neet-secrets.yaml
```

## 6. Deploy the services

```bash
TAG=v0.1.0
for svc in auth ai tests prediction study payments notifications analytics web; do
  helm upgrade --install "$svc" infra/k8s/helm/neet-service -n neet \
    -f "infra/k8s/helm/values/$svc.yaml" \
    --set "image.tag=$TAG" \
    --set "imagePullSecrets[0].name=ghcr-pull"
done
kubectl -n neet get pods
```

Deploy `auth` first — it runs the DB migrations on boot; the other services'
readiness probes hold traffic until they're up.

## 7. Verify

```bash
kubectl -n neet rollout status deploy/auth
kubectl -n neet port-forward svc/auth 4002:4002 &
curl -s localhost:4002/readyz          # {"status":"ready","db":true}
```

For a public entry point, add an Ingress (ALB ingress controller or
nginx-ingress) routing `/` → `web` and `/api/*` → the gateway of your choice.
The web image bakes `NEXT_PUBLIC_*` at build time, so for a real domain rebuild
`web` with those args (see `apps/web/Dockerfile`) or front the APIs behind one
host.

## 8. Rollback

```bash
helm -n neet rollback <svc>            # previous revision
# DB migrations are expand–contract, so the prior image works against the new schema.
```

## What's verified vs not

- **Verified in CI:** all images build & publish; Terraform `validate`/`fmt`;
  Helm `lint`/`template`; the full app loop (HTTP + Kafka + ClickHouse smokes).
- **Not exercised here:** `terraform apply` to a live account and `helm upgrade`
  to a live cluster (needs your AWS credentials). The steps above are the
  file-accurate path to do so.

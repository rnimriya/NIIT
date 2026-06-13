# Terraform — AWS infrastructure

Provisions the platform's cloud footprint in `ap-south-1` (Mumbai):

| File | Resource |
|---|---|
| `vpc.tf` | VPC across 3 AZs, public/private subnets, single NAT |
| `eks.tf` | EKS cluster + managed node group (IRSA enabled) |
| `rds.tf` | Multi-AZ PostgreSQL 16 (encrypted, RDS-managed master password) |
| `elasticache.tf` | Redis replication group (failover, encryption) |
| `msk.tf` | MSK Serverless (Kafka, IAM SASL) |
| `ecr.tf` | One ECR repo per service (scan on push, keep last 20) |

## Usage

```bash
cd infra/terraform
terraform init                         # configure an S3 backend for real use
terraform plan
terraform apply
```

Outputs include the EKS cluster name/endpoint, RDS + Redis endpoints, the MSK
ARN, and the ECR repo URLs — feed these into the Helm `neet-secrets` Secret and
values (see `../k8s`).

## Validate (no cloud credentials)

```bash
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

CI runs exactly these on every push. This config has been `validate`-d and
`fmt`-checked, but not `apply`-d to a live account in this repo.

> Remote state: uncomment the `backend "s3"` block in `versions.tf` and pass
> `-backend-config` at init. State is **not** committed.

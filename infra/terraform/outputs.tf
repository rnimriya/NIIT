output "region" {
  value = var.aws_region
}

output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "msk_cluster_arn" {
  value = aws_msk_serverless_cluster.kafka.arn
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

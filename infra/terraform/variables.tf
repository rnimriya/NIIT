variable "aws_region" {
  description = "AWS region (NEET is India-centric → Mumbai by default)"
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  type    = string
  default = "neet-ai"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "cluster_version" {
  type    = string
  default = "1.30"
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.large"]
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 10
}

variable "node_desired_size" {
  type    = number
  default = 3
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t3.micro"
}

variable "services" {
  description = "Services that get an ECR repository"
  type        = list(string)
  default = [
    "ai",
    "auth",
    "tests",
    "prediction",
    "study",
    "payments",
    "notifications",
    "analytics",
    "web",
  ]
}

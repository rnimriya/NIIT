terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # Production: store state remotely. Configure on init, e.g.:
  #   terraform init -backend-config=backend.hcl
  # backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project
      Env       = var.environment
      ManagedBy = "terraform"
    }
  }
}

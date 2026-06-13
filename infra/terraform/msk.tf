resource "aws_security_group" "msk" {
  name        = "${var.project}-msk"
  description = "Kafka access from within the VPC"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "Kafka (IAM SASL) from VPC"
    from_port   = 9098
    to_port     = 9098
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Serverless MSK keeps the event bus operationally simple at launch; the
# architecture's upgrade path is provisioned MSK with tuned partitions.
resource "aws_msk_serverless_cluster" "kafka" {
  cluster_name = "${var.project}-kafka"

  vpc_config {
    subnet_ids         = module.vpc.private_subnets
    security_group_ids = [aws_security_group.msk.id]
  }

  client_authentication {
    sasl {
      iam {
        enabled = true
      }
    }
  }
}

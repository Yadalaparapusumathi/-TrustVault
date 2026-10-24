terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state in S3 with native locking. deploy.sh creates the bucket and passes the settings via
  # -backend-config, because the state holds generated secrets and must never live on a laptop only.
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "trustvault"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront-scoped resources (WAF web ACL, ACM certificate) must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "trustvault"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

variable "aws_region" {
  description = "Region for everything except the CloudFront-scoped WAF/certificate."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name, used in resource names."
  type        = string
  default     = "prod"
}

variable "image_tag" {
  description = "Tag of the backend and frontend images in ECR (deploy.sh uses the git commit)."
  type        = string
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture; must match the platform the images were built for."
  type        = string
  default     = "ARM64"

  validation {
    condition     = contains(["ARM64", "X86_64"], var.cpu_architecture)
    error_message = "cpu_architecture must be ARM64 or X86_64."
  }
}

# ---- Network ----------------------------------------------------------------

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "nat_gateway_per_az" {
  description = "One NAT gateway per AZ (resilient to an AZ outage) instead of a single shared one (cheaper)."
  type        = bool
  default     = false
}

# ---- Application ------------------------------------------------------------

variable "task_cpu" {
  type    = number
  default = 1024
}

variable "task_memory" {
  type    = number
  default = 2048
}

variable "desired_count" {
  description = "Tasks to run normally. Two or more spreads them across availability zones."
  type        = number
  default     = 2
}

variable "max_count" {
  description = "Upper bound for CPU-based autoscaling."
  type        = number
  default     = 4
}

variable "seed_admin" {
  description = "Bootstrap the 'admin' account on an empty database. Set to false once you have signed in and rotated it."
  type        = bool
  default     = true
}

variable "domain_name" {
  description = "Optional custom hostname (e.g. vault.example.com). Requires acm_certificate_arn. Empty = use the CloudFront hostname."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate in us-east-1 covering domain_name. Only used when domain_name is set."
  type        = string
  default     = ""
}

variable "alarm_email" {
  description = "Optional e-mail address subscribed to the alarm SNS topic (confirm the subscription e-mail)."
  type        = string
  default     = ""
}

# ---- Database ---------------------------------------------------------------

variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_engine_version" {
  description = "PostgreSQL major version. Minor versions are upgraded automatically in the maintenance window."
  type        = string
  default     = "16"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling in GiB."
  type        = number
  default     = 200
}

variable "db_multi_az" {
  description = "Synchronous standby in a second AZ with automatic failover."
  type        = bool
  default     = true
}

variable "db_backup_retention_days" {
  type    = number
  default = 14
}

variable "db_deletion_protection" {
  description = "Must be switched off (and applied) before the database can be destroyed."
  type        = bool
  default     = true
}

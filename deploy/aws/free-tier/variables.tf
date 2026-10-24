variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "image_tag" {
  description = "Tag of the backend and frontend images in ECR (deploy.sh uses the git commit)."
  type        = string
}

variable "instance_type" {
  description = "Graviton (ARM64) instance type. t4g.small has a free trial of 750 hours/month through 2026."
  type        = string
  default     = "t4g.small"
}

variable "db_instance_class" {
  description = "db.t4g.micro is the free-tier class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_multi_az" {
  description = "Standby in a second AZ with automatic failover. Not free; enable when the app outgrows the free tier."
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling in GiB (20 GiB are free)."
  type        = number
  default     = 50
}

variable "seed_admin" {
  description = "Bootstrap the 'admin' account on an empty database. Set to false once you have signed in and changed it."
  type        = bool
  default     = true
}

variable "alarm_email" {
  description = "Optional e-mail address for alarms (confirm the subscription e-mail AWS sends)."
  type        = string
  default     = ""
}

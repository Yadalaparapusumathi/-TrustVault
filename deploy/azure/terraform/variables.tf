variable "location" {
  description = "Azure region."
  type        = string
  default     = "centralindia"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "image_tag" {
  description = "Tag of the backend and frontend images in ACR (deploy.sh uses the git commit)."
  type        = string
}

variable "min_replicas" {
  description = "Replicas kept running. 1 keeps the app warm; 0 scales to zero when idle (cheaper, ~30 s cold start)."
  type        = number
  default     = 1
}

variable "max_replicas" {
  type    = number
  default = 3
}

variable "backend_cpu" {
  type    = number
  default = 0.75
}

variable "backend_memory" {
  type    = string
  default = "1.5Gi"
}

variable "seed_admin" {
  description = "Bootstrap the 'admin' account on an empty database. Set to false once you have signed in and changed it."
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Optional e-mail for database alerts."
  type        = string
  default     = ""
}

# ---- Database ---------------------------------------------------------------

variable "db_sku" {
  description = "B_Standard_B1ms is in the 12-month free offer. Zone-redundant HA needs GP_ (e.g. GP_Standard_D2ds_v5) or MO_."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_storage_mb" {
  description = "32768 MB is in the free offer; storage auto-grows from here."
  type        = number
  default     = 32768
}

variable "db_backup_retention_days" {
  type    = number
  default = 14
}

variable "db_geo_redundant_backup" {
  description = "Copy backups to the paired region. Can only be chosen when the server is created."
  type        = bool
  default     = false
}

variable "db_high_availability" {
  description = "Zone-redundant standby with automatic failover. Not available on Burstable (B_) SKUs."
  type        = bool
  default     = false
}

# TrustVault on Azure:
#
#   Internet -> Container Apps ingress (HTTPS) -> one Container App revision, sharing localhost:
#                                                  db-init   (init container) ensures the database and roles exist
#                                                  backend   Spring Boot on 127.0.0.1:8081
#                                                  frontend  nginx :8080 (the ingress target)
#                                                       |  TLS, private VNet only
#                                       Azure Database for PostgreSQL Flexible Server 16
#
# Secrets live in Key Vault and reach the containers through a user-assigned managed identity.

terraform {
  required_version = ">= 1.10"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }

  # deploy.sh passes the storage account and container via -backend-config.
  backend "azurerm" {
    key = "trustvault.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
  }
}

data "azurerm_client_config" "current" {}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  name   = "trustvault-${var.environment}"
  suffix = random_string.suffix.result
  tags   = { project = "trustvault", environment = var.environment, managed-by = "terraform" }
}

resource "azurerm_resource_group" "main" {
  name     = local.name
  location = var.location
  tags     = local.tags
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

# ---- Network ----------------------------------------------------------------

resource "azurerm_virtual_network" "main" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.42.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "apps" {
  name                 = "container-apps"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.42.0.0/23"]

  delegation {
    name = "container-apps"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "db" {
  name                 = "postgres"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.42.4.0/24"]

  delegation {
    name = "postgres"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_private_dns_zone" "db" {
  name                = "${local.name}.private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "db" {
  name                  = local.name
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.db.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

# ---- Database ---------------------------------------------------------------
# Private (VNet-only, no public endpoint), TLS required, encrypted at rest, automated backups with point-in-time
# restore, storage auto-grow, optional zone-redundant HA (General Purpose SKUs and up) and geo-redundant backups.

resource "random_password" "db_admin" {
  length  = 40
  special = false
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                = "${local.name}-${local.suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  version             = "16"
  sku_name            = var.db_sku
  storage_mb          = var.db_storage_mb
  auto_grow_enabled   = true

  administrator_login    = "tvmaster"
  administrator_password = random_password.db_admin.result

  delegated_subnet_id           = azurerm_subnet.db.id
  private_dns_zone_id           = azurerm_private_dns_zone.db.id
  public_network_access_enabled = false

  backup_retention_days        = var.db_backup_retention_days
  geo_redundant_backup_enabled = var.db_geo_redundant_backup

  dynamic "high_availability" {
    for_each = var.db_high_availability ? [1] : []
    content {
      mode = "ZoneRedundant"
    }
  }

  maintenance_window {
    day_of_week  = 0
    start_hour   = 21
    start_minute = 30
  }

  tags = local.tags

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [zone, high_availability[0].standby_availability_zone]
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.db]
}

resource "azurerm_postgresql_flexible_server_configuration" "settings" {
  for_each = {
    require_secure_transport            = "on"
    ssl_min_protocol_version            = "TLSv1.2"
    password_encryption                 = "scram-sha-256"
    log_min_duration_statement          = "1000"
    log_connections                     = "on"
    log_disconnections                  = "on"
    idle_in_transaction_session_timeout = "300000"
  }
  server_id = azurerm_postgresql_flexible_server.main.id
  name      = each.key
  value     = each.value
}

resource "azurerm_monitor_diagnostic_setting" "db" {
  name                       = "logs"
  target_resource_id         = azurerm_postgresql_flexible_server.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "PostgreSQLLogs"
  }
  enabled_metric {
    category = "AllMetrics"
  }
}

# ---- Secrets ----------------------------------------------------------------
# TV_MASTER_KEY wraps every file's data key: losing it makes every stored document unreadable, so the vault has
# purge protection (a deleted secret can be recovered for 90 days and cannot be purged early).

resource "random_password" "db_owner" {
  length  = 40
  special = false
}

resource "random_password" "db_app" {
  length  = 40
  special = false
}

resource "random_password" "admin_bootstrap" {
  length           = 24
  special          = true
  override_special = "#%+=-_"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
}

resource "random_bytes" "master_key" {
  length = 32
}

resource "random_bytes" "audit_hmac_key" {
  length = 48
}

resource "azurerm_user_assigned_identity" "app" {
  name                = "${local.name}-app"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_key_vault" "main" {
  name                       = "tv-${var.environment}-${local.suffix}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 90
  purge_protection_enabled   = true
  rbac_authorization_enabled = false
  tags                       = local.tags

  # Whoever runs Terraform manages the secrets; the app identity can only read them.
  access_policy {
    tenant_id          = data.azurerm_client_config.current.tenant_id
    object_id          = data.azurerm_client_config.current.object_id
    secret_permissions = ["Get", "List", "Set", "Delete", "Recover", "Backup", "Restore"]
  }

  access_policy {
    tenant_id          = data.azurerm_client_config.current.tenant_id
    object_id          = azurerm_user_assigned_identity.app.principal_id
    secret_permissions = ["Get"]
  }
}

locals {
  secrets = {
    db-admin-password      = random_password.db_admin.result
    db-owner-password      = random_password.db_owner.result
    db-app-password        = random_password.db_app.result
    master-key             = random_bytes.master_key.base64
    audit-hmac-key         = random_bytes.audit_hmac_key.base64
    admin-bootstrap-secret = random_password.admin_bootstrap.result
  }
}

resource "azurerm_key_vault_secret" "app" {
  for_each     = local.secrets
  name         = each.key
  value        = each.value
  key_vault_id = azurerm_key_vault.main.id
}

# ---- Registry ---------------------------------------------------------------

resource "azurerm_container_registry" "main" {
  name                = "trustvault${var.environment}${local.suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Basic"
  admin_enabled       = false
  tags                = local.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
  principal_type       = "ServicePrincipal"
}

# Role assignments take a little while to reach the registry's data plane.
resource "time_sleep" "acr_pull" {
  depends_on      = [azurerm_role_assignment.acr_pull]
  create_duration = "60s"
}

# ---- Container Apps -----------------------------------------------------------

resource "azurerm_container_app_environment" "main" {
  name                       = local.name
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.apps.id

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }

  tags = local.tags

  lifecycle {
    ignore_changes = [infrastructure_resource_group_name]
  }
}

locals {
  db_host  = azurerm_postgresql_flexible_server.main.fqdn
  registry = azurerm_container_registry.main.login_server
}

resource "azurerm_container_app" "main" {
  name                         = local.name
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.app.id
  }

  dynamic "secret" {
    for_each = azurerm_key_vault_secret.app
    content {
      name                = secret.key
      key_vault_secret_id = secret.value.versionless_id
      identity            = azurerm_user_assigned_identity.app.id
    }
  }

  ingress {
    external_enabled           = true
    target_port                = 8080
    transport                  = "auto"
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    http_scale_rule {
      name                = "http"
      concurrent_requests = "50"
    }

    init_container {
      name    = "db-init"
      image   = "public.ecr.aws/docker/library/postgres:16-alpine"
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["sh", "-c", file("${path.module}/../../aws/db-init.sh")]

      env {
        name  = "PGHOST"
        value = local.db_host
      }
      env {
        name  = "PGUSER"
        value = azurerm_postgresql_flexible_server.main.administrator_login
      }
      env {
        name        = "PGPASSWORD"
        secret_name = "db-admin-password"
      }
      env {
        name  = "PGSSLMODE"
        value = "require"
      }
      env {
        name  = "PGCONNECT_TIMEOUT"
        value = "10"
      }
      env {
        name        = "TV_DB_OWNER_PASSWORD"
        secret_name = "db-owner-password"
      }
      env {
        name        = "TV_DB_APP_PASSWORD"
        secret_name = "db-app-password"
      }
    }

    container {
      name   = "backend"
      image  = "${local.registry}/trustvault-backend:${var.image_tag}"
      cpu    = var.backend_cpu
      memory = var.backend_memory

      env {
        name  = "SERVER_PORT"
        value = "8081"
      }
      env {
        name  = "TV_DB_URL"
        value = "jdbc:postgresql://${local.db_host}:5432/trustvault?sslmode=require"
      }
      env {
        name  = "TV_DB_OWNER_USER"
        value = "trustvault_owner"
      }
      env {
        name  = "TV_DB_APP_USER"
        value = "trustvault_app"
      }
      env {
        name        = "TV_DB_OWNER_PASSWORD"
        secret_name = "db-owner-password"
      }
      env {
        name        = "TV_DB_APP_PASSWORD"
        secret_name = "db-app-password"
      }
      env {
        name        = "TV_MASTER_KEY"
        secret_name = "master-key"
      }
      env {
        name        = "TV_AUDIT_HMAC_KEY"
        secret_name = "audit-hmac-key"
      }
      env {
        name        = "TV_SEED_PASSWORD_ADMIN"
        secret_name = "admin-bootstrap-secret"
      }
      env {
        name  = "TV_SEED_ENABLED"
        value = tostring(var.seed_admin)
      }
      env {
        name  = "TV_COOKIE_SECURE"
        value = "true"
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 8081
        path                    = "/actuator/health"
        interval_seconds        = 10
        timeout                 = 5
        failure_count_threshold = 18
      }
      liveness_probe {
        transport               = "HTTP"
        port                    = 8081
        path                    = "/actuator/health"
        interval_seconds        = 30
        timeout                 = 5
        failure_count_threshold = 3
      }
    }

    container {
      name   = "frontend"
      image  = "${local.registry}/trustvault-frontend:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "BACKEND_HOST"
        value = "127.0.0.1"
      }
      env {
        name  = "BACKEND_PORT"
        value = "8081"
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/actuator/health"
        interval_seconds        = 10
        timeout                 = 5
        failure_count_threshold = 3
      }
    }
  }

  depends_on = [time_sleep.acr_pull, azurerm_postgresql_flexible_server_configuration.settings]
}

# ---- Alerts -----------------------------------------------------------------

resource "azurerm_monitor_action_group" "main" {
  count               = var.alert_email != "" ? 1 : 0
  name                = local.name
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "trustvault"

  email_receiver {
    name          = "ops"
    email_address = var.alert_email
  }
}

resource "azurerm_monitor_metric_alert" "db" {
  for_each = var.alert_email != "" ? {
    cpu     = { metric = "cpu_percent", operator = "GreaterThan", threshold = 80 }
    storage = { metric = "storage_percent", operator = "GreaterThan", threshold = 85 }
    memory  = { metric = "memory_percent", operator = "GreaterThan", threshold = 90 }
  } : {}
  name                = "${local.name}-db-${each.key}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_postgresql_flexible_server.main.id]
  frequency           = "PT5M"
  window_size         = "PT15M"

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = each.value.metric
    aggregation      = "Average"
    operator         = each.value.operator
    threshold        = each.value.threshold
  }

  action {
    action_group_id = azurerm_monitor_action_group.main[0].id
  }
}

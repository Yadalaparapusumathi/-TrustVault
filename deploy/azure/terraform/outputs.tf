output "app_url" {
  value = "https://${azurerm_container_app.main.ingress[0].fqdn}"
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}

output "acr_name" {
  value = azurerm_container_registry.main.name
}

output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "container_app" {
  value = azurerm_container_app.main.name
}

output "db_fqdn" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "admin_password_command" {
  description = "Prints the one-time admin bootstrap password."
  value       = "az keyvault secret show --vault-name ${azurerm_key_vault.main.name} --name admin-bootstrap-secret --query value -o tsv"
}

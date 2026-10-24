output "app_url" {
  description = "Public URL of the application."
  value       = local.custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_domain" {
  description = "CNAME target for domain_name."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "ecr_backend" {
  value = aws_ecr_repository.app["backend"].repository_url
}

output "ecr_frontend" {
  value = aws_ecr_repository.app["frontend"].repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.app.name
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "app_secret_arn" {
  description = "Secrets Manager secret holding the generated keys and the admin bootstrap password."
  value       = aws_secretsmanager_secret.app.arn
}

output "admin_password_command" {
  description = "Prints the one-time admin bootstrap password."
  value       = "aws secretsmanager get-secret-value --region ${var.aws_region} --secret-id ${aws_secretsmanager_secret.app.arn} --query SecretString --output text | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"TV_SEED_PASSWORD_ADMIN\"])'"
}

output "app_url" {
  value = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "ecr_backend" {
  value = aws_ecr_repository.app["backend"].repository_url
}

output "ecr_frontend" {
  value = aws_ecr_repository.app["frontend"].repository_url
}

output "instance_id" {
  description = "Open a shell with: aws ssm start-session --target <id>"
  value       = aws_instance.app.id
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "admin_password_command" {
  description = "Prints the one-time admin bootstrap password."
  value       = "aws secretsmanager get-secret-value --region ${var.aws_region} --secret-id ${aws_secretsmanager_secret.app.arn} --query SecretString --output text | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"TV_SEED_PASSWORD_ADMIN\"])'"
}

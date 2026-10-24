# One Fargate task = three containers sharing localhost, mirroring docker-compose.yml:
#   db-init  (runs once per task start, then exits) ensures the trustvault database and its two roles exist
#   backend  Spring Boot on 127.0.0.1:8081, never reachable from outside the task
#   frontend nginx on :8080 serving the SPA and proxying /api to the backend; the only port the ALB can reach

locals {
  platform    = var.cpu_architecture == "ARM64" ? "linux/arm64" : "linux/amd64"
  backend_url = "jdbc:postgresql://${aws_db_instance.main.address}:${aws_db_instance.main.port}/trustvault?sslmode=require"
  app_secret  = aws_secretsmanager_secret.app.arn

  db_init_script = file("${path.module}/../db-init.sh")
}

# ---- Images -----------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  for_each             = toset(["backend", "frontend"])
  name                 = "${local.name}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 30 most recent images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# ---- Logs -------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["db-init", "backend", "frontend"])
  name              = "/trustvault/${var.environment}/${each.key}"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.main.arn
}

# ---- IAM --------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:ecs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"]
    }
  }
}

# Used by the ECS agent: pull images, write logs, inject secrets.
resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = [local.app_secret, aws_db_instance.main.master_user_secret[0].secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = aws_kms_key.main.arn
      }
    ]
  })
}

# Used by the application itself. It needs no AWS API access; only ECS Exec for break-glass debugging.
resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "task_exec" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"
      ]
      Resource = "*"
    }]
  })
}

# ---- Cluster, task, service -----------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name              = "db-init"
      image             = "public.ecr.aws/docker/library/postgres:${var.db_engine_version}-alpine"
      essential         = false
      memoryReservation = 64
      entryPoint        = ["sh", "-c"]
      command           = [local.db_init_script]
      environment = [
        { name = "PGHOST", value = aws_db_instance.main.address },
        { name = "PGPORT", value = tostring(aws_db_instance.main.port) },
        { name = "PGSSLMODE", value = "require" },
        { name = "PGCONNECT_TIMEOUT", value = "10" }
      ]
      secrets = [
        { name = "PGUSER", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::" },
        { name = "TV_DB_OWNER_PASSWORD", valueFrom = "${local.app_secret}:TV_DB_OWNER_PASSWORD::" },
        { name = "TV_DB_APP_PASSWORD", valueFrom = "${local.app_secret}:TV_DB_APP_PASSWORD::" }
      ]
      linuxParameters = { capabilities = { drop = ["ALL"] } }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app["db-init"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "db-init"
        }
      }
    },
    {
      name      = "backend"
      image     = "${aws_ecr_repository.app["backend"].repository_url}:${var.image_tag}"
      essential = true
      memory    = var.task_memory - 384
      dependsOn = [{ containerName = "db-init", condition = "SUCCESS" }]
      environment = [
        { name = "SERVER_PORT", value = "8081" },
        { name = "TV_DB_URL", value = local.backend_url },
        { name = "TV_DB_OWNER_USER", value = "trustvault_owner" },
        { name = "TV_DB_APP_USER", value = "trustvault_app" },
        { name = "TV_DB_POOL_SIZE", value = "10" },
        { name = "TV_COOKIE_SECURE", value = "true" },
        { name = "TV_SEED_ENABLED", value = tostring(var.seed_admin) }
      ]
      secrets = [
        { name = "TV_DB_OWNER_PASSWORD", valueFrom = "${local.app_secret}:TV_DB_OWNER_PASSWORD::" },
        { name = "TV_DB_APP_PASSWORD", valueFrom = "${local.app_secret}:TV_DB_APP_PASSWORD::" },
        { name = "TV_MASTER_KEY", valueFrom = "${local.app_secret}:TV_MASTER_KEY::" },
        { name = "TV_AUDIT_HMAC_KEY", valueFrom = "${local.app_secret}:TV_AUDIT_HMAC_KEY::" },
        { name = "TV_SEED_PASSWORD_ADMIN", valueFrom = "${local.app_secret}:TV_SEED_PASSWORD_ADMIN::" }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:8081/actuator/health | grep -q '\"UP\"' || exit 1"]
        interval    = 15
        timeout     = 5
        retries     = 5
        startPeriod = 120
      }
      linuxParameters = { capabilities = { drop = ["ALL"] }, initProcessEnabled = true }
      stopTimeout     = 30
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app["backend"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "backend"
        }
      }
    },
    {
      name         = "frontend"
      image        = "${aws_ecr_repository.app["frontend"].repository_url}:${var.image_tag}"
      essential    = true
      memory       = 256
      dependsOn    = [{ containerName = "backend", condition = "HEALTHY" }]
      portMappings = [{ containerPort = 8080, protocol = "tcp" }]
      environment = [
        { name = "BACKEND_HOST", value = "127.0.0.1" },
        { name = "BACKEND_PORT", value = "8081" }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO /dev/null http://127.0.0.1:8080/ || exit 1"]
        interval    = 15
        timeout     = 5
        retries     = 3
        startPeriod = 10
      }
      linuxParameters = { capabilities = { drop = ["ALL"] } }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app["frontend"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "frontend"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name                               = local.name
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  propagate_tags                     = "SERVICE"
  enable_execute_command             = true
  health_check_grace_period_seconds  = 240
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  wait_for_steady_state              = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "frontend"
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener.http]
}

resource "aws_appautoscaling_target" "app" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.desired_count
  max_capacity       = var.max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu"
  service_namespace  = aws_appautoscaling_target.app.service_namespace
  resource_id        = aws_appautoscaling_target.app.resource_id
  scalable_dimension = aws_appautoscaling_target.app.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

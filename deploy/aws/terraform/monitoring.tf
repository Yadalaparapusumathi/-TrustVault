resource "aws_sns_topic" "alarms" {
  name              = "${local.name}-alarms"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  alarms = {
    alb-5xx = {
      namespace   = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum", threshold = 10
      operator    = "GreaterThanThreshold", dimensions = { LoadBalancer = aws_lb.main.arn_suffix }
      description = "Backend returned more than 10 5xx responses in 5 minutes"
    }
    unhealthy-targets = {
      namespace   = "AWS/ApplicationELB", metric = "UnHealthyHostCount", stat = "Maximum", threshold = 0
      operator    = "GreaterThanThreshold"
      dimensions  = { LoadBalancer = aws_lb.main.arn_suffix, TargetGroup = aws_lb_target_group.app.arn_suffix }
      description = "At least one task is failing its health check"
    }
    ecs-cpu = {
      namespace   = "AWS/ECS", metric = "CPUUtilization", stat = "Average", threshold = 85
      operator    = "GreaterThanThreshold"
      dimensions  = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.app.name }
      description = "Service CPU above 85% even after autoscaling"
    }
    rds-cpu = {
      namespace   = "AWS/RDS", metric = "CPUUtilization", stat = "Average", threshold = 80
      operator    = "GreaterThanThreshold", dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier }
      description = "Database CPU above 80%"
    }
    rds-free-storage = {
      namespace   = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum", threshold = 5 * 1024 * 1024 * 1024
      operator    = "LessThanThreshold", dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier }
      description = "Database free storage below 5 GiB"
    }
    rds-free-memory = {
      namespace   = "AWS/RDS", metric = "FreeableMemory", stat = "Minimum", threshold = 256 * 1024 * 1024
      operator    = "LessThanThreshold", dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier }
      description = "Database freeable memory below 256 MiB"
    }
    rds-connections = {
      namespace   = "AWS/RDS", metric = "DatabaseConnections", stat = "Maximum", threshold = 300
      operator    = "GreaterThanThreshold", dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier }
      description = "Unusually many database connections"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${local.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  dimensions          = each.value.dimensions
  period              = 300
  evaluation_periods  = 1
  threshold           = each.value.threshold
  comparison_operator = each.value.operator
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# RDS-level events (failover, maintenance, storage full, backups failing) to the same topic.
resource "aws_db_event_subscription" "main" {
  name             = local.name
  sns_topic        = aws_sns_topic.alarms.arn
  source_type      = "db-instance"
  source_ids       = [aws_db_instance.main.identifier]
  event_categories = ["availability", "failover", "failure", "low storage", "maintenance", "recovery", "backup"]
}

resource "aws_sns_topic_policy" "alarms" {
  arn = aws_sns_topic.alarms.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "events.rds.amazonaws.com"] }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.alarms.arn
        Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
      },
      {
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = ["sns:Subscribe", "sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:Publish"]
        Resource  = aws_sns_topic.alarms.arn
      }
    ]
  })
}

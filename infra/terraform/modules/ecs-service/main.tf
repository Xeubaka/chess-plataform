# Reusable module: one Fargate task definition + service.
# This is the "module" concept from Terraform — write the pattern once,
# instantiate it 6 times (once per microservice) from ecs.tf via for_each.

variable "project_name" {}
variable "service_name" {}
variable "cluster_id" {}
variable "execution_role_arn" {}
variable "subnets" { type = list(string) }
variable "security_group_id" {}
variable "image" {}
variable "container_port" { type = number }
variable "attach_to_alb" { type = bool }
variable "target_group_arn" { default = null }

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.project_name}-${var.service_name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.execution_role_arn

  container_definitions = jsonencode([{
    name  = var.service_name
    image = var.image
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
    environment = [
      { name = "REDIS_URL", value = "redis://REPLACE-WITH-ELASTICACHE-ENDPOINT:6379" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project_name}/${var.service_name}"
        "awslogs-region"        = "us-east-1"
        "awslogs-stream-prefix" = "ecs"
        "awslogs-create-group"  = "true"
      }
    }
  }])
}

resource "aws_ecs_service" "this" {
  name            = "${var.project_name}-${var.service_name}"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    security_groups  = [var.security_group_id]
    assign_public_ip = true
  }

  dynamic "load_balancer" {
    for_each = var.attach_to_alb ? [1] : []
    content {
      target_group_arn = var.target_group_arn
      container_name   = var.service_name
      container_port   = var.container_port
    }
  }
}

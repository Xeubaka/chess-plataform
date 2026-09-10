# ECS Fargate: no EC2 instances to patch or manage. One task definition +
# service per microservice, so each can be deployed and scaled independently
# — the whole point of the architecture, now expressed as infra.

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

resource "aws_iam_role" "ecs_execution" {
  name = "${var.project_name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "gateway" {
  name        = "${var.project_name}-gateway-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # required for Fargate

  health_check {
    path = "/api/rooms" # cheap way to confirm gateway -> room-service path works end to end
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }
}

# One task definition + service per microservice.
# Only "gateway" is attached to the load balancer; the others are only
# reachable from inside the cluster's security group — same isolation
# principle as the docker-compose network, just on AWS.
module "service" {
  for_each = toset(["gateway", "frontend", "room-service", "game-service", "chat-service", "analysis-service"])

  source = "./modules/ecs-service"

  project_name       = var.project_name
  service_name       = each.value
  cluster_id         = aws_ecs_cluster.main.id
  execution_role_arn = aws_iam_role.ecs_execution.arn
  subnets            = aws_subnet.public[*].id
  security_group_id  = aws_security_group.services.id
  image              = coalesce(var.container_images[each.value], "${aws_ecr_repository.services[each.value].repository_url}:latest")
  container_port     = each.value == "gateway" ? 8080 : (each.value == "frontend" ? 8081 : 3000)
  attach_to_alb      = each.value == "gateway"
  target_group_arn   = each.value == "gateway" ? aws_lb_target_group.gateway.arn : null
}

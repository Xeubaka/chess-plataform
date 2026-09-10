# One image repository per service. GitHub Actions pushes here on every
# merge to main; ECS pulls from here when a new task is launched.

locals {
  service_names = ["gateway", "frontend", "room-service", "game-service", "chat-service", "analysis-service"]
}

resource "aws_ecr_repository" "services" {
  for_each             = toset(local.service_names)
  name                 = "${var.project_name}/${each.value}"
  image_tag_mutability = "IMMUTABLE" # forces a new tag per build — never silently overwrite :latest

  image_scanning_configuration {
    scan_on_push = true # this is the "security scanning" line item from the JD, at the registry level
  }
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used on all resource names"
  type        = string
  default     = "chess-platform"
}

variable "container_images" {
  description = "Map of service name to ECR image URI:tag. Filled in by CI/CD after it builds and pushes images."
  type        = map(string)
  default = {
    gateway          = ""
    frontend         = ""
    room-service     = ""
    game-service     = ""
    chat-service     = ""
    analysis-service = ""
  }
}

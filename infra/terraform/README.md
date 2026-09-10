# Terraform — deploying this to AWS

This is a **learning-scaffold**, not click-and-deploy production infra. It provisions:
- A VPC with public subnets
- An ECS Fargate cluster (one task per service — no servers to patch)
- An Application Load Balancer routing to the frontend/gateway task
- One ECR repository per service (where your GitHub Actions pipeline pushes images)
- A single ElastiCache Redis instance (replaces the docker-compose `redis` service)

## Why Terraform instead of clicking around the AWS console
Terraform lets you describe infrastructure in files, version it in git, and
run the *exact same* `plan`/`apply` locally or in CI/CD. Two big practical
wins you can cite in the interview:
1. **Reproducibility** — spin up an identical "staging" environment from the same code that made "prod."
2. **Review-ability** — infra changes go through a pull request and `terraform plan` shows a diff, same as code review.

## How to actually run this (you'll need your own AWS account)
```bash
cd infra/terraform
terraform init
terraform plan -var="aws_region=us-east-1"
terraform apply -var="aws_region=us-east-1"
```
This will incur real AWS costs (ECS Fargate, ALB, ElastiCache are not
free-tier-eligible in most cases). Run `terraform destroy` when you're done
studying it for the day.

## What's deliberately left out (name these in an interview as "next steps")
- No HTTPS/ACM certificate — ALB is HTTP-only here
- No autoscaling policies attached (structure is there, thresholds are not)
- No remote state backend (add an S3 bucket + DynamoDB lock table before
  ever running this with a teammate — local state will conflict)
- No secrets management (would add AWS Secrets Manager / SSM Parameter Store)
- Single AZ Redis (no failover) — ElastiCache supports Multi-AZ, turned off here to keep the learning footprint small

## File map
- `network.tf` — VPC, subnets, internet gateway, security groups
- `ecr.tf` — one container registry per service
- `ecs.tf` — Fargate cluster, task definitions, services, ALB
- `variables.tf` / `outputs.tf` — inputs and what you get back after `apply`

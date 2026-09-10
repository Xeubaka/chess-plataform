output "load_balancer_dns" {
  description = "Public URL for the app once deployed"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_urls" {
  description = "Push your CI/CD built images here"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Uncomment once you've created an S3 bucket + DynamoDB table for locking.
  # Local state (the default) is fine solo, but the FIRST thing to fix before
  # a teammate touches this repo is moving state off your laptop.
  #
  # backend "s3" {
  #   bucket         = "chess-platform-tfstate"
  #   key            = "global/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "chess-platform-tf-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
}

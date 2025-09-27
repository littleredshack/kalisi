# EDT System Makefile
# Unified build and test commands

include .env
export

.PHONY: help start stop restart build test clean status logs shell

help:
	@echo "EDT System Build Commands"
	@echo "========================"
	@echo ""
	@echo "make start    - Start all services"
	@echo "make stop     - Stop all services"
	@echo "make restart  - Restart all services"
	@echo "make build    - Build all services"
	@echo "make test     - Run all tests"
	@echo "make clean    - Clean up containers and volumes"
	@echo "make status   - Show service status"
	@echo "make logs     - View logs (use SERVICE=name for specific service)"
	@echo "make shell    - Open shell (use SERVICE=name for specific service)"
	@echo ""
	@echo "Examples:"
	@echo "  make logs SERVICE=api-gateway-dev"
	@echo "  make shell SERVICE=redis"

start:
	@echo "🚀 Starting EDT services..."
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) up -d
	@echo "⏳ Waiting for services to be healthy..."
	@sleep 10
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) ps

stop:
	@echo "🛑 Stopping EDT services..."
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) down

restart:
	@echo "🔄 Restarting EDT services..."
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) restart

build:
	@echo "🏗️  Building EDT services..."
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) build

test:
	@echo "🧪 Running tests..."
	@./tests/run_all_tests.sh

clean:
	@echo "🧹 Cleaning up..."
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) down -v
	@rm -rf target/
	@echo "✅ Cleanup complete"

status:
	@echo "📊 Service Status:"
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) ps
	@echo ""
	@echo "🔍 Container Health:"
	@docker ps --format "table {{.Names}}\t{{.Status}}" | grep "$(DOCKER_PROJECT_NAME)"

logs:
	@if [ -z "$(SERVICE)" ]; then \
		docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) logs -f; \
	else \
		docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) logs -f $(SERVICE); \
	fi

shell:
	@SERVICE=$${SERVICE:-api-gateway-dev}; \
	echo "🐚 Opening shell in $$SERVICE..."; \
	docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) exec $$SERVICE /bin/bash

# Quick test commands
test-security:
	@echo "🔒 Running security tests..."
	@./tests/security/comprehensive_security_check.sh

test-env:
	@echo "🔧 Running environment tests..."
	@./tests/security/test_environment_config.sh

test-docker:
	@echo "🐳 Running Docker tests..."
	@./tests/security/test_docker_ports.sh

test-mfa:
	@echo "🔐 Running MFA tests..."
	@./tests/security/test_mfa_flow.sh

# Development helpers
dev-logs:
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) logs -f api-gateway-dev

dev-rebuild:
	@echo "🔄 Rebuilding API gateway..."
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) stop api-gateway-dev
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) build api-gateway-dev
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) up -d api-gateway-dev

# CI/CD helpers
ci-test:
	@echo "🚀 Running CI test suite..."
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) up -d
	@sleep 15
	@./tests/run_all_tests.sh || (docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) logs; exit 1)
	@docker-compose -f $(DOCKER_COMPOSE_FILE) -p $(DOCKER_PROJECT_NAME) down
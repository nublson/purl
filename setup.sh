#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo "No .env found. Copying .env.example to .env"
  cp .env.example .env
  echo "Fill in the required values in .env, then re-run ./setup.sh"
  exit 1
fi

echo "Installing dependencies..."
pnpm install

echo "Running database migrations..."
pnpm prisma migrate deploy

echo "Generating Prisma client..."
pnpm prisma generate

echo "Setup complete. Run 'pnpm dev' to start."

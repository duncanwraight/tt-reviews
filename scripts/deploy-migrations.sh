#!/bin/bash

# Script to deploy Supabase migrations manually
# Usage: ./scripts/deploy-migrations.sh

set -e

echo "🗃️ Deploying Supabase database migrations..."

# Check if we're linked to a project
if [ ! -f .supabase/config.toml ]; then
    echo "❌ Not linked to a Supabase project. Run 'supabase link' first."
    exit 1
fi

# Check if there are migration files
MIGRATION_COUNT=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l)
if [ "$MIGRATION_COUNT" -eq 0 ]; then
    echo "✅ No migration files found. Nothing to deploy."
    exit 0
fi

echo "📁 Found $MIGRATION_COUNT migration files:"
ls -la supabase/migrations/

# Confirm with user
read -p "Do you want to deploy these migrations? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration deployment cancelled."
    exit 1
fi

# Deploy migrations
echo "🚀 Deploying migrations..."
supabase db push

echo "✅ Migrations deployed successfully!"
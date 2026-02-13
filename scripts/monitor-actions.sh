#!/bin/bash
# GitHub Actions Monitoring Helper
# Requires: gh CLI installed (https://cli.github.com)
#
# Installation:
#   macOS:  brew install gh
#   Windows: choco install gh OR winget install GitHub.cli
#   Linux:  sudo apt install gh (or download from releases)
#
# Use Case: Monitor test failures on GitHub Actions after pushing
#
# Examples:
#   bash scripts/monitor-actions.sh list      - Show recent runs
#   bash scripts/monitor-actions.sh latest    - Show latest run status
#   bash scripts/monitor-actions.sh failures  - Show failed runs only
#   bash scripts/monitor-actions.sh logs <N>  - Show logs for run #N
#   bash scripts/monitor-actions.sh retry <N> - Retry run #N

REPO="JeffreySanford/cosmic-horizon"

case "${1:-latest}" in
  list)
    echo "📋 Recent GitHub Actions runs:"
    gh run list --repo "$REPO" --limit 10 --json status,name,headBranch,createdAt,conclusion
    ;;
  latest)
    echo "⏱️  Latest run status:"
    gh run list --repo "$REPO" --limit 1 --json conclusion,status,name,url
    ;;
  failures)
    echo "❌ Failed runs:"
    gh run list --repo "$REPO" --status failure --limit 5
    ;;
  logs)
    if [ -z "$2" ]; then
      echo "Usage: bash scripts/monitor-actions.sh logs <run-number>"
      echo "Example: bash scripts/monitor-actions.sh logs 1"
      exit 1
    fi
    RUN_ID=$(gh run list --repo "$REPO" --limit "$2" --json databaseId | jq ".[$2-1].databaseId")
    echo "📜 Fetching logs for run $2..."
    gh run view "$RUN_ID" --repo "$REPO" --log
    ;;
  retry)
    if [ -z "$2" ]; then
      echo "Usage: bash scripts/monitor-actions.sh retry <run-number>"
      exit 1
    fi
    RUN_ID=$(gh run list --repo "$REPO" --limit "$2" --json databaseId | jq ".[$2-1].databaseId")
    echo "🔄 Retrying run $2..."
    gh run rerun "$RUN_ID" --repo "$REPO"
    ;;
  *)
    echo "GitHub Actions Monitoring Helper"
    echo ""
    echo "Commands:"
    echo "  list      - Show recent runs"
    echo "  latest    - Show latest run status"
    echo "  failures  - Show failed runs"
    echo "  logs <N>  - Show logs for run N"
    echo "  retry <N> - Retry run N"
    echo ""
    echo "Install gh first: https://cli.github.com"
    ;;
esac

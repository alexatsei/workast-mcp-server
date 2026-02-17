#!/bin/bash
set -e

# ─── Workast MCP Server Setup ────────────────────────────────────────────────
# Run this once to install dependencies and register the server with Claude Code.
# Usage: ./setup.sh
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🔧 Workast MCP Server Setup"
echo "═══════════════════════════"
echo ""

# 1. Check prereqs
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is required but not installed."
  echo "   Install it from https://nodejs.org/ (v18+)"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js v18+ required (you have v$NODE_VERSION)"
  exit 1
fi

if ! command -v claude &> /dev/null; then
  echo "❌ Claude Code CLI is required but not installed."
  echo "   Install it from https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

echo "✅ Prerequisites OK (Node $(node -v), Claude Code found)"
echo ""

# 2. Install dependencies
echo "📦 Installing dependencies..."
cd "$SCRIPT_DIR"
npm install --silent
echo "✅ Dependencies installed"
echo ""

# 3. Get API token
echo "🔑 Enter your Workast API token"
echo "   (starts with wat:: — get it from Workast Settings > API)"
echo ""
read -rp "   Token: " WORKAST_TOKEN

if [ -z "$WORKAST_TOKEN" ]; then
  echo "❌ No token provided. Exiting."
  exit 1
fi

echo ""

# 4. Register MCP server with Claude Code
echo "⚙️  Registering MCP server with Claude Code..."

# Remove existing registration if present (ignore errors)
claude mcp remove workast -s user 2>/dev/null || true

claude mcp add workast \
  -e "WORKAST_API_TOKEN=$WORKAST_TOKEN" \
  -s user \
  -- node "$SCRIPT_DIR/index.js"

echo "✅ MCP server registered"
echo ""

# 5. Done
echo "═══════════════════════════"
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code (quit and reopen)"
echo "  2. Try: \"show me my workast spaces\""
echo ""
echo "If you need to update your token later, just run this script again."
echo ""

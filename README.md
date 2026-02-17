# Workast MCP Server for Claude Code

Connect [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to [Workast](https://www.workast.com/) — view, create, and manage tasks directly from your terminal.

Built by the Sei Foundation growth team.

## What it does

This MCP (Model Context Protocol) server gives Claude Code full access to your Workast workspace. You can ask Claude things like:

- "Show me my tasks"
- "What's assigned to me?"
- "Read me the details of the pSEO project"
- "Create a task in the testing-workast space called 'Update landing page copy'"
- "Mark the GA setup task as done"

### Available tools (18)

| Category | Tools |
|----------|-------|
| **Spaces** | `list_spaces`, `get_space`, `create_space` |
| **Tasks** | `list_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`, `reopen_task`, `delete_task` |
| **Assignment** | `assign_task`, `unassign_task` |
| **Collaboration** | `add_comment`, `create_subtask` |
| **Users** | `list_users`, `get_me` |
| **Tags** | `list_tags`, `add_tags_to_task` |

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- [Node.js](https://nodejs.org/) v18+
- A Workast API token (get it from Workast settings or ask your workspace admin)

## Quick setup

### Option 1: Automatic (recommended)

```bash
git clone <your-repo-url> ~/workast-mcp-server
cd ~/workast-mcp-server
./setup.sh
```

The script will:
1. Install dependencies
2. Ask for your Workast API token
3. Register the MCP server with Claude Code

### Option 2: Manual

1. **Clone and install:**
   ```bash
   git clone <your-repo-url> ~/workast-mcp-server
   cd ~/workast-mcp-server
   npm install
   ```

2. **Register with Claude Code:**
   ```bash
   claude mcp add workast \
     -e WORKAST_API_TOKEN=your_token_here \
     -s user \
     -- node ~/workast-mcp-server/index.js
   ```

3. **Restart Claude Code** to pick up the new server.

## Getting your Workast API token

1. Open Workast (via Slack or web app)
2. Go to **Settings** > **API** (or ask your workspace admin)
3. Your token will start with `wat::`

## Verify it works

Open Claude Code and try:

```
show me my workast spaces
```

If you see your spaces listed, you're good to go.

## Troubleshooting

**"WORKAST_API_TOKEN env variable is not set"**
- Make sure you passed your token during setup
- Check `~/.claude.json` to verify the env var is set under the workast MCP config

**Tools not showing up**
- Restart Claude Code (`Ctrl+C` then `claude` again)
- Run `claude mcp list` to check if workast is registered

**"Workast API returned 401"**
- Your API token may be expired or invalid
- Get a fresh token from Workast settings

**Tasks not updating after code changes**
- The MCP server process is cached in Claude Code's session
- Restart Claude Code to pick up any changes to `index.js`

## How it works

The server uses the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) to expose Workast API endpoints as tools that Claude can call. It communicates over stdio (stdin/stdout) with Claude Code.

Key architecture decisions:
- **Client-side filtering** for assignee and text search (the Workast search API requires undocumented predicate formats)
- **Multi-space aggregation** — when no space is specified, tasks are fetched from all your active spaces and merged
- **Zod schemas** for all tool parameters (required by MCP SDK v1.26+)

## API reference

This server wraps the Workast REST API at `https://api.todobot.io`. Endpoints used:

- `GET /list` — list spaces
- `GET /list/:id` — get space details
- `GET /list/:id/task` — list tasks in a space
- `GET /task/:id` — get task details
- `POST /list/:id/task` — create task
- `PATCH /task/:id` — update task
- `POST /task/:id/done` — complete task
- `POST /task/:id/undone` — reopen task
- `DELETE /task/:id` — delete task
- `POST /task/:id/assigned` — assign user
- `DELETE /task/:id/assigned` — unassign user
- `POST /task/:id/activity` — add comment
- `POST /task/:id/subtask` — create subtask
- `GET /user` — list users
- `GET /user/me` — current user
- `GET /tag` — list tags
- `POST /task/:id/tag` — add tags

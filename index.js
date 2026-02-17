#!/usr/bin/env node
'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const BASE_URL = 'https://api.todobot.io';
const API_TOKEN = process.env.WORKAST_API_TOKEN;

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function api(method, path, body = null, query = null) {
  if (!API_TOKEN) throw new Error('WORKAST_API_TOKEN env variable is not set');

  let url = `${BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.append(k, v);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Workast API ${method} ${path} returned ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'workast',
  version: '1.0.0',
});

// ── Spaces ───────────────────────────────────────────────────────────────────

server.tool(
  'list_spaces',
  'List all Workast spaces (lists/projects). Returns names, IDs, metadata.',
  {},
  async () => ok(await api('GET', '/list'))
);

server.tool(
  'get_space',
  'Get details of a specific Workast space by ID.',
  { space_id: z.string().describe('The space/list ID') },
  async ({ space_id }) => ok(await api('GET', `/list/${space_id}`))
);

server.tool(
  'create_space',
  'Create a new Workast space/list.',
  {
    name: z.string().describe('Name of the space'),
    description: z.string().optional().describe('Optional description'),
  },
  async ({ name, description }) => {
    const body = { name };
    if (description) body.description = description;
    return ok(await api('POST', '/list', body));
  }
);

// ── Tasks ────────────────────────────────────────────────────────────────────

server.tool(
  'list_tasks',
  'Search/list tasks. Filter by space, status, assignee, or text query. Set include_subtasks=true to also search within subtasks (fetches full task details, slower).',
  {
    space_id: z.string().optional().describe('Filter by space/list ID'),
    query: z.string().optional().describe('Text search query'),
    status: z.enum(['active', 'done', 'all']).optional().default('active').describe('Task status filter'),
    assignee: z.string().optional().describe('Filter by assignee user ID'),
    limit: z.number().optional().default(25).describe('Max results (default 25)'),
    include_subtasks: z.boolean().optional().default(false).describe('Include subtasks in results (slower — fetches each task\'s details)'),
  },
  async ({ space_id, query, status, assignee, limit, include_subtasks }) => {
    const spaceIds = [];
    if (space_id) {
      spaceIds.push({ id: space_id, name: '' });
    } else {
      const spaces = await api('GET', '/list');
      for (const s of spaces) {
        if (s.isParticipant && !s.isArchived) spaceIds.push({ id: s.id, name: s.name });
      }
    }

    let allTasks = [];
    for (const space of spaceIds) {
      try {
        const q = {};
        if (status === 'done') q.done = 'true';
        else if (status === 'all') q.done = 'all';
        const tasks = await api('GET', `/list/${space.id}/task`, null, q);
        const tagged = space.name
          ? tasks.map(t => ({ ...t, spaceName: space.name }))
          : tasks;
        allTasks.push(...tagged);
      } catch (_) { /* skip spaces that error */ }
    }

    // Fetch subtasks if requested
    if (include_subtasks) {
      const parents = [...allTasks];
      for (const task of parents) {
        try {
          const full = await api('GET', `/task/${task.id}`);
          if (full.subTasks && full.subTasks.length > 0) {
            const subs = full.subTasks.map(st => ({
              ...st,
              spaceName: task.spaceName || '',
              parentTaskId: task.id,
              parentTaskName: task.text || task.name,
              isSubtask: true,
            }));
            allTasks.push(...subs);
          }
        } catch (_) { /* skip tasks that error */ }
      }
    }

    // Client-side filters
    if (assignee) {
      allTasks = allTasks.filter(t =>
        t.assignedTo && t.assignedTo.some(a => a.id === assignee)
      );
    }
    if (query) {
      const q = query.toLowerCase();
      allTasks = allTasks.filter(t =>
        (t.text && t.text.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }
    if (limit && allTasks.length > limit) allTasks = allTasks.slice(0, limit);
    return ok(allTasks);
  }
);

server.tool(
  'get_task',
  'Get full details of a specific task by ID.',
  { task_id: z.string().describe('The task ID') },
  async ({ task_id }) => ok(await api('GET', `/task/${task_id}`))
);

server.tool(
  'create_task',
  'Create a new task in a Workast space.',
  {
    space_id: z.string().describe('The space/list ID to create the task in'),
    name: z.string().describe('Task name/title'),
    description: z.string().optional().describe('Task description'),
    due_date: z.string().optional().describe('Due date in ISO 8601, e.g. 2025-03-01'),
    assignee: z.string().optional().describe('User ID to assign'),
  },
  async ({ space_id, name, description, due_date, assignee }) => {
    const body = { name };
    if (description) body.description = description;
    if (due_date) body.dueDate = due_date;
    if (assignee) body.assignedTo = [assignee];
    return ok(await api('POST', `/list/${space_id}/task`, body));
  }
);

server.tool(
  'update_task',
  'Update an existing task (name, description, due date).',
  {
    task_id: z.string().describe('The task ID'),
    name: z.string().optional().describe('New task name'),
    description: z.string().optional().describe('New description'),
    due_date: z.string().optional().describe('New due date in ISO 8601'),
  },
  async ({ task_id, name, description, due_date }) => {
    const body = {};
    if (name) body.name = name;
    if (description) body.description = description;
    if (due_date) body.dueDate = due_date;
    return ok(await api('PATCH', `/task/${task_id}`, body));
  }
);

server.tool(
  'complete_task',
  'Mark a task as complete/done.',
  { task_id: z.string().describe('The task ID') },
  async ({ task_id }) => ok(await api('POST', `/task/${task_id}/done`))
);

server.tool(
  'reopen_task',
  'Reopen a completed task (mark as not done).',
  { task_id: z.string().describe('The task ID') },
  async ({ task_id }) => ok(await api('POST', `/task/${task_id}/undone`))
);

server.tool(
  'delete_task',
  'Delete a task.',
  { task_id: z.string().describe('The task ID') },
  async ({ task_id }) => {
    await api('DELETE', `/task/${task_id}`);
    return { content: [{ type: 'text', text: 'Task deleted successfully.' }] };
  }
);

server.tool(
  'assign_task',
  'Assign a user to a task.',
  {
    task_id: z.string().describe('The task ID'),
    user_id: z.string().describe('The user ID to assign'),
  },
  async ({ task_id, user_id }) =>
    ok(await api('POST', `/task/${task_id}/assigned`, { userId: user_id }))
);

server.tool(
  'unassign_task',
  'Remove a user assignment from a task.',
  {
    task_id: z.string().describe('The task ID'),
    user_id: z.string().describe('The user ID to unassign'),
  },
  async ({ task_id, user_id }) =>
    ok(await api('DELETE', `/task/${task_id}/assigned`, { userId: user_id }))
);

server.tool(
  'add_comment',
  'Add a comment to a task.',
  {
    task_id: z.string().describe('The task ID'),
    text: z.string().describe('Comment text'),
  },
  async ({ task_id, text }) =>
    ok(await api('POST', `/task/${task_id}/activity`, { text }))
);

server.tool(
  'create_subtask',
  'Create a subtask under an existing task.',
  {
    task_id: z.string().describe('The parent task ID'),
    name: z.string().describe('Subtask name'),
  },
  async ({ task_id, name }) =>
    ok(await api('POST', `/task/${task_id}/subtask`, { name }))
);

// ── Users ────────────────────────────────────────────────────────────────────

server.tool(
  'list_users',
  'List all users in the Workast workspace.',
  {},
  async () => ok(await api('GET', '/user'))
);

server.tool(
  'get_me',
  'Get the current authenticated user profile.',
  {},
  async () => ok(await api('GET', '/user/me'))
);

// ── Tags ─────────────────────────────────────────────────────────────────────

server.tool(
  'list_tags',
  'List all tags in the workspace.',
  {},
  async () => ok(await api('GET', '/tag'))
);

server.tool(
  'add_tags_to_task',
  'Add tags to a task.',
  {
    task_id: z.string().describe('The task ID'),
    tag_ids: z.string().describe('Comma-separated tag IDs to add'),
  },
  async ({ task_id, tag_ids }) => {
    const ids = tag_ids.split(',').map(s => s.trim());
    return ok(await api('POST', `/task/${task_id}/tag`, { tagIds: ids }));
  }
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

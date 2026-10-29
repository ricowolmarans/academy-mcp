# Creator AI — Canvas LMS Management MCP Server

Self-hostable [MCP](https://modelcontextprotocol.io) server for managing **Canvas LMS** from ChatGPT, Claude Desktop, Cursor, or any MCP client.

The connected AI generates content from your instructions and calls Creator AI tools to create, update, and organise courses across all accounts you can access.

## Features

| Area | Operations |
|------|------------|
| **Courses** | List, get, create, update, delete/conclude |
| **Modules** | List, create, update, delete, reorder; module items |
| **Assignments** | Full CRUD |
| **Pages** | Create, read, update, publish/unpublish, delete |
| **Quizzes** (classic) | CRUD + questions |
| **Rubrics** | List, get, create, delete |
| **Discovery** | Search courses before modifying |
| **Course building** | `build_course_structure` for multi-module scaffolds |

### Safety

- Destructive and publish operations require `confirm: true`
- Without it, tools return a **PREVIEW** only
- Personal access token is never logged or returned
- Zod validation, pagination, rate-limit retries, clear Canvas errors

## Setup

```bash
cd creator-ai-mcp
cp .env.example .env
# Set CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN

npm install
npm run build
npm start          # stdio
# or npm run dev   # tsx
```

Generate a token: Canvas → Account → Settings → **New Access Token**.

Optional: `CANVAS_ACCOUNT_ID` for course creation.

## MCP client config (stdio)

```json
{
  "mcpServers": {
    "creator-ai": {
      "command": "node",
      "args": ["/absolute/path/to/creator-ai-mcp/dist/index.js"],
      "env": {
        "CANVAS_BASE_URL": "https://yourschool.instructure.com",
        "CANVAS_ACCESS_TOKEN": "your_token"
      }
    }
  }
}
```

## Docker

```bash
docker build -t creator-ai .
docker run --rm -i \
  -e CANVAS_BASE_URL=https://yourschool.instructure.com \
  -e CANVAS_ACCESS_TOKEN=your_token \
  creator-ai
```

## Example prompts

- "List my teacher courses."
- "Show modules for course 12345 with items."
- "Create unpublished module Week 1 with a Welcome page and a 10-point Reflection assignment — preview first."
- "Build a 4-module structure for course 12345 from this outline…"

## Canvas API notes

- Targets **classic Quizzes** (`/api/v1/.../quizzes`), not New Quizzes.
- Course creation needs account-level permission + `account_id`.
- Complex rubric criteria are best refined in the Canvas UI after create.
- Respects the token user's permissions only.

## License

MIT

#!/usr/bin/env node
/**
 * Creator AI — stdio transport (local MCP clients: Claude Desktop local, Cursor, etc.)
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createCreatorAiServer } from "./server.js";
import { getConfig, maskToken } from "./utils/config.js";

async function main() {
  try {
    const cfg = getConfig();
    console.error(
      `[creator-ai] Starting (stdio) — Canvas: ${cfg.CANVAS_BASE_URL} token: ${maskToken(cfg.CANVAS_ACCESS_TOKEN)}`
    );
  } catch (e) {
    console.error(`[creator-ai] Configuration error: ${e instanceof Error ? e.message : e}`);
    console.error("Set CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN (see .env.example).");
    process.exit(1);
  }

  const server = createCreatorAiServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[creator-ai] MCP server connected on stdio");
}

main().catch((err) => {
  console.error("[creator-ai] Fatal:", err);
  process.exit(1);
});

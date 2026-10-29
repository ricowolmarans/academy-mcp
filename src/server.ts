import { McpServer } from "@modelcontextprotocol/server";
import { registerAllTools } from "./tools/index.js";

/** Build a fresh McpServer with all Creator AI tools registered. */
export function createCreatorAiServer(): McpServer {
  const server = new McpServer({
    name: "creator-ai",
    version: "1.0.0",
  });
  registerAllTools(server);
  return server;
}

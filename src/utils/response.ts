export function ok(data: unknown, summary?: string) {
  const text =
    (summary ? summary + "\n\n" : "") +
    (typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return { content: [{ type: "text" as const, text }] };
}

export function err(message: string, details?: unknown) {
  const text =
    `Error: ${message}` +
    (details !== undefined ? "\n\n" + JSON.stringify(details, null, 2) : "");
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

export function preview(action: string, data: unknown, confirmHint: string) {
  const text =
    `PREVIEW — ${action}\nThis change has NOT been applied.\n${confirmHint}\n\n` +
    JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

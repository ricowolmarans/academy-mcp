export class CanvasApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
    public readonly endpoint?: string
  ) {
    super(message);
    this.name = "CanvasApiError";
  }

  static fromResponse(status: number, body: unknown, endpoint: string): CanvasApiError {
    let message = `Canvas API error ${status}`;
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (Array.isArray(b.errors)) {
        message = b.errors
          .map((e: unknown) => {
            if (typeof e === "string") return e;
            if (e && typeof e === "object" && "message" in e)
              return String((e as { message: unknown }).message);
            return JSON.stringify(e);
          })
          .join("; ");
      } else if (typeof b.message === "string") message = b.message;
      else if (typeof b.error === "string") message = b.error;
    }
    return new CanvasApiError(message, status, body, endpoint);
  }
}

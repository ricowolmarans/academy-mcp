import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("config schema", () => {
  const schema = z.object({
    CANVAS_BASE_URL: z.string().url().transform((u) => u.replace(/\/+$/, "")),
    CANVAS_ACCESS_TOKEN: z.string().min(1),
  });

  it("rejects empty", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("accepts valid and strips trailing slash", () => {
    const r = schema.safeParse({
      CANVAS_BASE_URL: "https://canvas.example.com/",
      CANVAS_ACCESS_TOKEN: "tok",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.CANVAS_BASE_URL).toBe("https://canvas.example.com");
  });
});

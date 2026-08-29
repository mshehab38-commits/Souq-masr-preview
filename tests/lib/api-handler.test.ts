import { afterEach, describe, expect, it, vi } from "vitest";
import { withApiHandler } from "@/lib/api-handler";

function parsedLogLines(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map(([line]) => JSON.parse(line as string));
}

describe("withApiHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a request id when the client sends none, and echoes it on the response", async () => {
    const handler = withApiHandler(async () => Response.json({ ok: true }));
    const response = await handler(new Request("http://localhost/api/thing"), undefined);

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("propagates the client-supplied request id instead of generating a new one", async () => {
    const handler = withApiHandler(async () => Response.json({ ok: true }));
    const response = await handler(
      new Request("http://localhost/api/thing", { headers: { "x-request-id": "client-supplied-id" } }),
      undefined,
    );

    expect(response.headers.get("x-request-id")).toBe("client-supplied-id");
  });

  it("logs request start and completion with method, path, status, and duration", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const handler = withApiHandler(async () => Response.json({ ok: true }, { status: 201 }));

    await handler(new Request("http://localhost/api/thing", { method: "POST" }), undefined);

    const lines = parsedLogLines(logSpy);
    const start = lines.find((l) => l.message === "api.request.start");
    const complete = lines.find((l) => l.message === "api.request.complete");

    expect(start).toMatchObject({ level: "info", method: "POST", path: "/api/thing" });
    expect(start.requestId).toBeTruthy();
    expect(complete).toMatchObject({
      level: "info",
      method: "POST",
      path: "/api/thing",
      status: 201,
      requestId: start.requestId,
    });
    expect(typeof complete.durationMs).toBe("number");
  });

  it("catches a thrown error, returns a generic 500 with only the requestId, and never leaks the message or stack to the client", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = withApiHandler(async () => {
      throw new Error("super secret internal detail");
    });

    const response = await handler(new Request("http://localhost/api/thing"), undefined);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["error", "requestId"]);
    expect(body.error).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("super secret internal detail");
    expect(response.headers.get("x-request-id")).toBe(body.requestId);

    const lines = parsedLogLines(errorSpy);
    const errorLine = lines.find((l) => l.message === "api.request.error");
    expect(errorLine).toMatchObject({ level: "error", error: "super secret internal detail" });
    expect(errorLine.requestId).toBe(body.requestId);
  });

  it("passes the context argument through to the handler unchanged", async () => {
    const handler = withApiHandler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
      const { id } = await context.params;
      return Response.json({ id });
    });

    const response = await handler(new Request("http://localhost/api/thing/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(await response.json()).toEqual({ id: "abc" });
  });
});

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStorageProvider } from "@/lib/storage";
import { withApiHandler } from "@/lib/api-handler";

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

function contentTypeForPath(segments: string[]): string {
  const ext = segments[segments.length - 1]?.split(".").pop()?.toLowerCase();
  return EXTENSION_CONTENT_TYPES[ext ?? ""] ?? "application/octet-stream";
}

// Dev/test-only: serves the LocalStorageProvider fallback. Hard-disabled in
// production regardless of configuration, since production always requires
// real object storage (see lib/env.ts) and this route must never become an
// unauthenticated arbitrary file read/write endpoint on a live server.
function guardNonProduction(): NextResponse | null {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export const PUT = withApiHandler(async (request: Request, context: { params: Promise<{ path: string[] }> }) => {
  const blocked = guardNonProduction();
  if (blocked) return blocked;

  const { path } = await context.params;
  const key = path.join("/");
  const contentType = request.headers.get("content-type") ?? contentTypeForPath(path);
  const body = Buffer.from(await request.arrayBuffer());

  await getStorageProvider().putObject(key, body, contentType);
  return NextResponse.json({ ok: true });
});

export const GET = withApiHandler(async (_request: Request, context: { params: Promise<{ path: string[] }> }) => {
  const blocked = guardNonProduction();
  if (blocked) return blocked;

  const { path } = await context.params;
  const key = path.join("/");

  try {
    const body = await getStorageProvider().getObject(key);
    return new NextResponse(new Uint8Array(body), {
      headers: { "Content-Type": contentTypeForPath(path) },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
});

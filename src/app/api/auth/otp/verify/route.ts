import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  verifyOtp,
  generateCsrfToken,
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from "@/modules/identity/service";
import { getClientIp } from "@/lib/request";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().length(6),
});

export const POST = withApiHandler(async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const result = await verifyOtp(parsed.data.phone, parsed.data.code, { ip, userAgent });

  await recordAudit({
    actorId: result.ok ? result.userId : undefined,
    actorType: result.ok ? "USER" : "SYSTEM",
    action: "auth.otp.verify",
    metadata: { ip, ok: result.ok, reason: result.ok ? undefined : result.reason },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const cookieStore = await cookies();
  const isProduction = env.NODE_ENV === "production";

  cookieStore.set(SESSION_COOKIE_NAME, result.sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: result.sessionExpiresAt,
  });

  cookieStore.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: result.sessionExpiresAt,
  });

  return NextResponse.json({ ok: true });
});

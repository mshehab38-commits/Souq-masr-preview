import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp } from "@/modules/identity/service";
import { getClientIp } from "@/lib/request";
import { recordAudit } from "@/lib/audit";
import { withApiHandler } from "@/lib/api-handler";

const bodySchema = z.object({ phone: z.string().min(8).max(20) });

export const POST = withApiHandler(async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const result = await requestOtp(parsed.data.phone, ip);

  await recordAudit({
    actorType: "SYSTEM",
    action: "auth.otp.request",
    metadata: { ip, ok: result.ok, reason: result.ok ? undefined : result.reason },
  });

  // Every valid phone is treated identically (login-or-register is unified),
  // so there is no account-existence signal to leak here either way.
  if (!result.ok) {
    const status = result.reason === "invalid_phone" ? 422 : 429;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, devCode: result.devCode });
});

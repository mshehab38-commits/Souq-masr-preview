import { NextResponse } from "next/server";
import { assertCsrf, getCurrentUser } from "@/modules/identity/service";
import { toggleFavorite } from "@/modules/catalog/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!(await assertCsrf(request))) {
    return NextResponse.json({ error: "csrf_mismatch" }, { status: 403 });
  }

  const { id } = await context.params;
  const result = await toggleFavorite(user.id, id);
  return NextResponse.json(result);
}

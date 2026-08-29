import { NextResponse } from "next/server";
import { listAvailableShippingOptions } from "@/modules/shipping/service";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const governorateId = url.searchParams.get("governorateId");

  const options = await listAvailableShippingOptions(governorateId);
  return NextResponse.json({ options });
});

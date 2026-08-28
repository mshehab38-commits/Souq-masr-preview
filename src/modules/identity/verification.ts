import { prisma } from "@/lib/db";
import type { VerificationRequestType } from "@prisma/client";

export async function submitVerificationRequest(
  userId: string,
  type: VerificationRequestType,
  data: { businessName?: string; notes?: string },
) {
  return prisma.verificationRequest.create({
    data: {
      userId,
      type,
      businessName: data.businessName,
      notes: data.notes,
    },
  });
}

export async function getVerificationRequests(userId: string) {
  return prisma.verificationRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getVerificationRequests,
  getAccountDeletionRequests,
  formatEgyptianPhoneLocal,
} from "@/modules/identity/service";
import { ProfileView } from "./ProfileView";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [{ items: verificationRequests }, deletionRequests] = await Promise.all([
    getVerificationRequests(user.id),
    getAccountDeletionRequests(user.id),
  ]);
  const pendingDeletionRequest = deletionRequests.find((request) => request.status === "PENDING") ?? null;

  return (
    <ProfileView
      user={{
        name: user.name,
        email: user.email,
        phone: formatEgyptianPhoneLocal(user.phone),
        role: user.role,
        phoneVerified: user.phoneVerifiedAt !== null,
        commerceVerified: user.commerceVerifiedAt !== null,
      }}
      verificationRequests={verificationRequests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        businessName: request.businessName,
        createdAt: request.createdAt.toISOString(),
      }))}
      pendingDeletionRequest={pendingDeletionRequest ? { id: pendingDeletionRequest.id } : null}
    />
  );
}

import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getVerificationRequests,
  formatEgyptianPhoneLocal,
} from "@/modules/identity/service";
import { ProfileView } from "./ProfileView";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const verificationRequests = await getVerificationRequests(user.id);

  return (
    <ProfileView
      user={{
        name: user.name,
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
    />
  );
}

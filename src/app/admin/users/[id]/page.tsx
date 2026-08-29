import { UserDetail } from "./UserDetail";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetail userId={id} />;
}

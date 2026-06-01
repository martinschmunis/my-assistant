import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated", status: 401 };
  if (!session.user.approved) return { error: "Pending approval", status: 403 };
  return { session, userId: session.user.id };
}

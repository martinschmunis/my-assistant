import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireAuth() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return { error: "Not authenticated", status: 401 };
    if (!session.user.approved) return { error: "Pending approval", status: 403 };
    if (!session.user.id) return { error: "User ID missing", status: 401 };
    return { session, userId: Number(session.user.id) };
  } catch (e) {
    console.error("requireAuth error:", e);
    return { error: "Auth error: " + e.message, status: 500 };
  }
}

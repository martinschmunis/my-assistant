import { getSession } from "@/lib/auth";
import { getAllUsers, approveUser, revokeUser, setAdmin } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.approved) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Check admin status from session
  if (!session.user.is_admin) {
    // Auto-approve first user as admin
    const users = await getAllUsers();
    const thisUser = users.find(u => u.id === session.user.id);
    if (!thisUser?.is_admin) return Response.json({ error: "Not an admin" }, { status: 403 });
  }

  const users = await getAllUsers();
  return Response.json({ users });
}

export async function POST(req) {
  const session = await getSession();
  if (!session?.user?.approved) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { action, userId } = await req.json();

  if (action === "approve") {
    await approveUser(userId);
    return Response.json({ ok: true });
  }
  if (action === "revoke") {
    await revokeUser(userId);
    return Response.json({ ok: true });
  }
  if (action === "makeAdmin") {
    await setAdmin(userId, true);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

import { initSchema } from "@/lib/db";

export async function GET() {
  try {
    await initSchema();
    return Response.json({ ok: true, message: "Database ready" });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

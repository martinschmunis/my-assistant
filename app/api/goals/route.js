import { requireAuth } from "@/lib/auth";
import { getGoals, saveGoal, deleteGoal, saveTask, deleteTask, saveStep, toggleStep } from "@/lib/db";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const goals = await getGoals(auth.userId);
    return Response.json({ goals });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireAuth();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const { action } = body;
    if (action === "saveGoal")   { await saveGoal(body.goal, auth.userId); return Response.json({ ok: true }); }
    if (action === "deleteGoal") { await deleteGoal(body.id); return Response.json({ ok: true }); }
    if (action === "saveTask")   { await saveTask(body.task, body.goalId); return Response.json({ ok: true }); }
    if (action === "deleteTask") { await deleteTask(body.id); return Response.json({ ok: true }); }
    if (action === "toggleStep") { await toggleStep(body.stepId, body.done); return Response.json({ ok: true }); }
    if (action === "saveStep")   { await saveStep(body.step, body.taskId); return Response.json({ ok: true }); }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

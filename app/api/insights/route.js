import { requireAuth } from "@/lib/auth";
import { getGoals, getMemory, getRecentInteractions, addMemory, logInteraction, clearInteractions, clearMemory } from "@/lib/db";

const ANALYSIS_PROMPT = (goals, memory, interactions, userName) => {
  const allSteps = goals.flatMap(g => g.tasks?.flatMap(t => t.steps || []) || []);
  const doneSteps = allSteps.filter(s => s.done);
  const completedGoals = goals.filter(g => {
    const steps = g.tasks?.flatMap(t => t.steps || []) || [];
    return steps.length > 0 && steps.every(s => s.done);
  });

  return `You are a personal assistant analyzing progress for ${userName}, a user of this planning app.

TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}

PROGRESS STATS:
- Steps completed: ${doneSteps.length} of ${allSteps.length}
- Goals fully completed: ${completedGoals.map(g => g.title).join(", ") || "none yet"}
- Active goals: ${goals.length}

GOALS:
${goals.map(g => {
  const steps = g.tasks?.flatMap(t => t.steps || []) || [];
  const done = steps.filter(s => s.done).length;
  const pct = steps.length ? Math.round(done / steps.length * 100) : 0;
  return `- "${g.title}" (${g.type}): ${done}/${steps.length} steps (${pct}%)`;
}).join("\n") || "No goals yet."}

MEMORY:
${memory.map(m => `[${m.type}] ${m.content}`).join("\n") || "None yet."}

RECENT INTERACTIONS:
${interactions.slice(-10).map(i => `${i.role}: ${i.content.slice(0, 200)}`).join("\n") || "None yet."}

RULES:
1. Start with progress and wins, never criticism.
2. If goals were completed, celebrate that in the greeting.
3. Never repeat patterns already in memory as new blind spots.
4. Only flag blind spots with fresh concrete evidence.
5. Keep responses short — this user may have dyslexia.

Respond with ONLY valid JSON:
{
  "greeting": "1 warm sentence. Celebrate completions if any.",
  "progressSummary": "2-3 sentences using exact numbers. Focus on what was done.",
  "todayFocus": "The single most important next action. Very specific.",
  "wins": [{"title": "Short label", "detail": "One sentence on a real achievement."}],
  "blindSpots": [{"title": "Short label", "detail": "Only with fresh concrete evidence."}],
  "atRiskGoals": [{"goalTitle": "...", "reason": "One sentence."}],
  "memoryUpdates": [{"type": "pattern|strength|struggle|preference", "content": "Only new insights."}]
}`;
};

export async function GET(req) {
  const auth = await requireAuth();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const [goals, memory, interactions] = await Promise.all([
      getGoals(auth.userId),
      getMemory(auth.userId),
      getRecentInteractions(auth.userId, 20),
    ]);

    const userName = auth.session.user.dbName || auth.session.user.name || "you";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: ANALYSIS_PROMPT(goals, memory, interactions, userName) }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "{}";
    let insights;
    try {
      insights = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      insights = { greeting: `Hey ${userName}.`, progressSummary: "Keep going.", todayFocus: "Check your goals.", blindSpots: [], wins: [], memoryUpdates: [], atRiskGoals: [] };
    }

    for (const m of insights.memoryUpdates || []) {
      await addMemory(auth.userId, m.type, m.content);
    }

    return Response.json({ insights, goals });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireAuth();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    if (body.action === "resetInteractions") { await clearInteractions(auth.userId); return Response.json({ ok: true }); }
    if (body.action === "resetMemory")       { await clearMemory(auth.userId);       return Response.json({ ok: true }); }
    if (body.action === "resetAll")          { await clearInteractions(auth.userId); await clearMemory(auth.userId); return Response.json({ ok: true }); }
    const { role, content, screen } = body;
    await logInteraction(auth.userId, role, content, screen);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

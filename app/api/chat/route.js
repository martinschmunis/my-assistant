import { requireAuth } from "@/lib/auth";
import { getMemory, getRecentInteractions, logInteraction } from "@/lib/db";

export async function POST(req) {
  const auth = await requireAuth();
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const { messages, system } = await req.json();
    const [memory, recentInteractions] = await Promise.all([
      getMemory(auth.userId),
      getRecentInteractions(auth.userId, 10),
    ]);

    const memoryContext = memory.length
      ? `\n\nWHAT YOU KNOW ABOUT THIS USER:\n${memory.map(m => `[${m.type}] ${m.content}`).join("\n")}`
      : "";
    const interactionContext = recentInteractions.length
      ? `\n\nRECENT HISTORY:\n${recentInteractions.map(i => `${i.role}: ${i.content}`).join("\n")}`
      : "";

    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) await logInteraction(auth.userId, "user", lastUserMsg.content, "chat").catch(() => {});

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: system + memoryContext + interactionContext,
        messages,
      }),
    });

    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    await logInteraction(auth.userId, "assistant", text, "chat").catch(() => {});
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

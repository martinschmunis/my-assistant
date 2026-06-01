import { sql } from "@vercel/postgres";

// ── Schema ─────────────────────────────────────────────────────────────────
export async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      google_id   TEXT UNIQUE NOT NULL,
      email       TEXT,
      name        TEXT,
      image       TEXT,
      approved    BOOLEAN DEFAULT FALSE,
      is_admin    BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      last_seen   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS goals (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'longterm',
      why         TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      goal_id     TEXT REFERENCES goals(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      deadline    TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS steps (
      id          TEXT PRIMARY KEY,
      task_id     TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      text        TEXT NOT NULL,
      duration    TEXT,
      day         TEXT,
      done        BOOLEAN DEFAULT FALSE,
      done_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS memory (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS interactions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      screen      TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  return { ok: true };
}

// ── Users ──────────────────────────────────────────────────────────────────
export async function getAllUsers() {
  const { rows } = await sql`SELECT * FROM users ORDER BY created_at DESC`;
  return rows;
}

export async function approveUser(userId) {
  await sql`UPDATE users SET approved = true WHERE id = ${userId}`;
}

export async function revokeUser(userId) {
  await sql`UPDATE users SET approved = false WHERE id = ${userId}`;
}

export async function setAdmin(userId, isAdmin) {
  await sql`UPDATE users SET is_admin = ${isAdmin} WHERE id = ${userId}`;
}

// ── Goals ──────────────────────────────────────────────────────────────────
export async function getGoals(userId) {
  const { rows: goals } = await sql`SELECT * FROM goals WHERE user_id = ${userId} ORDER BY created_at ASC`;
  const { rows: tasks } = await sql`
    SELECT t.* FROM tasks t
    INNER JOIN goals g ON t.goal_id = g.id
    WHERE g.user_id = ${userId}
    ORDER BY t.created_at ASC
  `;
  const { rows: steps } = await sql`
    SELECT s.* FROM steps s
    INNER JOIN tasks t ON s.task_id = t.id
    INNER JOIN goals g ON t.goal_id = g.id
    WHERE g.user_id = ${userId}
    ORDER BY s.created_at ASC
  `;
  return goals.map(g => ({
    ...g,
    tasks: tasks.filter(t => t.goal_id === g.id).map(t => ({
      ...t,
      steps: steps.filter(s => s.task_id === t.id),
    })),
  }));
}

export async function saveGoal(goal, userId) {
  await sql`
    INSERT INTO goals (id, user_id, title, type, why)
    VALUES (${goal.id}, ${userId}, ${goal.title}, ${goal.type}, ${goal.why || ""})
    ON CONFLICT (id) DO UPDATE SET title = ${goal.title}, type = ${goal.type}, why = ${goal.why || ""}
  `;
  for (const task of goal.tasks || []) await saveTask(task, goal.id);
}

export async function deleteGoal(id) {
  await sql`DELETE FROM goals WHERE id = ${id}`;
}

export async function saveTask(task, goalId) {
  await sql`
    INSERT INTO tasks (id, goal_id, title, deadline)
    VALUES (${task.id}, ${goalId}, ${task.title}, ${task.deadline || ""})
    ON CONFLICT (id) DO UPDATE SET title = ${task.title}, deadline = ${task.deadline || ""}
  `;
  for (const step of task.steps || []) await saveStep(step, task.id);
}

export async function deleteTask(id) {
  await sql`DELETE FROM tasks WHERE id = ${id}`;
}

export async function saveStep(step, taskId) {
  await sql`
    INSERT INTO steps (id, task_id, text, duration, day, done)
    VALUES (${step.id}, ${taskId}, ${step.text}, ${step.duration || ""}, ${step.day || "Today"}, ${step.done || false})
    ON CONFLICT (id) DO UPDATE SET text = ${step.text}, duration = ${step.duration || ""}, day = ${step.day || "Today"}, done = ${step.done || false}
  `;
}

export async function toggleStep(stepId, done) {
  await sql`UPDATE steps SET done = ${done} WHERE id = ${stepId}`;
  if (done) {
    await sql`UPDATE steps SET done_at = NOW() WHERE id = ${stepId}`;
  } else {
    await sql`UPDATE steps SET done_at = NULL WHERE id = ${stepId}`;
  }
}

// ── Memory ─────────────────────────────────────────────────────────────────
export async function getMemory(userId) {
  const { rows } = await sql`SELECT * FROM memory WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`;
  return rows;
}

export async function addMemory(userId, type, content) {
  await sql`INSERT INTO memory (user_id, type, content) VALUES (${userId}, ${type}, ${content})`;
}

export async function clearMemory(userId) {
  await sql`DELETE FROM memory WHERE user_id = ${userId}`;
}

// ── Interactions ───────────────────────────────────────────────────────────
export async function logInteraction(userId, role, content, screen = null) {
  await sql`INSERT INTO interactions (user_id, role, content, screen) VALUES (${userId}, ${role}, ${content?.slice(0, 2000)}, ${screen})`;
}

export async function getRecentInteractions(userId, limit = 20) {
  const { rows } = await sql`SELECT * FROM interactions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.reverse();
}

export async function clearInteractions(userId) {
  await sql`DELETE FROM interactions WHERE user_id = ${userId}`;
}

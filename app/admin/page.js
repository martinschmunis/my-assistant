"use client";
import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

const FONT = "'Lexend', sans-serif";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = () => {
    fetch("/api/admin").then(r => r.json()).then(d => {
      if (d.error) setErr(d.error);
      else setUsers(d.users || []);
      setLoading(false);
    }).catch(() => { setErr("Could not load users."); setLoading(false); });
  };

  useEffect(() => { if (status === "authenticated") load(); }, [status]);

  const action = async (act, userId) => {
    await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: act, userId }) });
    load();
  };

  if (status === "loading") return <div style={{ padding: 40, fontFamily: FONT, color: "#64748B" }}>Loading...</div>;
  if (status === "unauthenticated") return <div style={{ padding: 40, fontFamily: FONT, color: "#EF4444" }}>Not signed in.</div>;
  if (err) return <div style={{ padding: 40, fontFamily: FONT, color: "#EF4444" }}>{err}</div>;

  const pending = users.filter(u => !u.approved);
  const approved = users.filter(u => u.approved);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px", fontFamily: FONT, background: "#0F172A", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ color: "#F8FAFC", fontSize: 24, fontWeight: 700, margin: 0 }}>Admin</h1>
        <button onClick={() => signOut()} style={{ background: "transparent", border: "1px solid #334155", borderRadius: 8, padding: "8px 14px", color: "#64748B", cursor: "pointer", fontFamily: FONT, fontSize: 13 }}>Sign out</button>
      </div>

      {pending.length > 0 && (
        <>
          <p style={{ color: "#F59E0B", fontSize: 11, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase", margin: "0 0 12px" }}>PENDING APPROVAL ({pending.length})</p>
          {pending.map(u => (
            <div key={u.id} style={{ background: "#2D1B00", border: "1px solid #92400E", borderRadius: 14, padding: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
              {u.image && <img src={u.image} style={{ width: 40, height: 40, borderRadius: "50%" }} alt="" />}
              <div style={{ flex: 1 }}>
                <p style={{ color: "#FCD34D", fontSize: 15, margin: 0, fontWeight: 600 }}>{u.name}</p>
                <p style={{ color: "#92400E", fontSize: 13, margin: "2px 0 0" }}>{u.email}</p>
                <p style={{ color: "#475569", fontSize: 11, margin: "2px 0 0", fontFamily: "monospace" }}>Joined {new Date(u.created_at).toLocaleDateString()}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => action("approve", u.id)} style={{ background: "#22C55E", border: "none", borderRadius: 8, padding: "8px 14px", color: "#fff", cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>Approve</button>
                <button onClick={() => action("revoke", u.id)} style={{ background: "transparent", border: "1px solid #EF4444", borderRadius: 8, padding: "8px 14px", color: "#EF4444", cursor: "pointer", fontFamily: FONT, fontSize: 13 }}>Deny</button>
              </div>
            </div>
          ))}
          <div style={{ marginBottom: 28 }} />
        </>
      )}

      <p style={{ color: "#64748B", fontSize: 11, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase", margin: "0 0 12px" }}>APPROVED USERS ({approved.length})</p>
      {approved.length === 0 && <p style={{ color: "#475569", fontSize: 14 }}>No approved users yet.</p>}
      {approved.map(u => (
        <div key={u.id} style={{ background: "#1E293B", border: "1px solid #263348", borderRadius: 14, padding: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
          {u.image && <img src={u.image} style={{ width: 40, height: 40, borderRadius: "50%" }} alt="" />}
          <div style={{ flex: 1 }}>
            <p style={{ color: "#E2E8F0", fontSize: 15, margin: 0, fontWeight: 600 }}>{u.name} {u.is_admin && <span style={{ background: "#0EA5E9", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4, marginLeft: 6 }}>ADMIN</span>}</p>
            <p style={{ color: "#64748B", fontSize: 13, margin: "2px 0 0" }}>{u.email}</p>
            <p style={{ color: "#475569", fontSize: 11, margin: "2px 0 0", fontFamily: "monospace" }}>Last seen {new Date(u.last_seen).toLocaleDateString()}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!u.is_admin && <button onClick={() => action("makeAdmin", u.id)} style={{ background: "transparent", border: "1px solid #0EA5E9", borderRadius: 8, padding: "8px 12px", color: "#0EA5E9", cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>Make Admin</button>}
            <button onClick={() => action("revoke", u.id)} style={{ background: "transparent", border: "1px solid #EF4444", borderRadius: 8, padding: "8px 12px", color: "#EF4444", cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>Revoke</button>
          </div>
        </div>
      ))}

      {pending.length === 0 && approved.length === 0 && !loading && (
        <p style={{ color: "#475569", fontSize: 14 }}>No users yet.</p>
      )}
    </div>
  );
}

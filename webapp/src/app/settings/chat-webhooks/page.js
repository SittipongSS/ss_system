"use client";
// หน้าตั้งค่า Google Chat webhook (เฟส 2 ของ GOOGLE_CHAT_PLAN.md) — supervisor เท่านั้น
// บันทึกชัดเจนด้วยปุ่ม "บันทึก" ต่อ space (ไม่มี auto-save ตามกติกาทั้งเว็บ)
import { useEffect, useState } from "react";
import { BellRing, Info, Save, Send } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import { useCan } from "@/lib/roleContext";
import { fmtDateTime } from "@/lib/format";

export default function ChatWebhooksPage() {
  const canManage = useCan("master:manage");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyKey, setBusyKey] = useState(""); // key ที่กำลังบันทึก/ทดสอบ
  const [toast, setToast] = useState(null); // { kind: 'success'|'error', msg }

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/chat-webhooks");
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดไม่สำเร็จ");
      setRows(Array.isArray(d) ? d : []);
    } catch (e) {
      setLoadError(e.message);
    }
    setLoading(false);
  };
  useEffect(() => { if (canManage) load(); else setLoading(false); }, [canManage]);

  const patchRow = (key, patch) => setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)));

  const save = async (row) => {
    setBusyKey(row.key);
    try {
      const res = await fetch("/api/chat-webhooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: row.key, url: row.url, enabled: row.enabled }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
      setRows((p) => p.map((r) => (r.key === row.key ? { ...r, ...d, hint: r.hint, label: r.label, envFallback: r.envFallback, saved: true, dirty: false } : r)));
      setToast({ kind: "success", msg: `บันทึก "${row.label}" แล้ว` });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setBusyKey("");
  };

  const sendTest = async (row) => {
    setBusyKey(row.key);
    try {
      const res = await fetch("/api/chat-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: row.key }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ส่งทดสอบไม่สำเร็จ");
      setToast({ kind: "success", msg: "ส่งการ์ดทดสอบแล้ว — ไปดูใน space ได้เลย" });
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setBusyKey("");
  };

  if (!canManage) {
    return (
      <div className="glass-panel" style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        หน้านี้สำหรับผู้ดูแลระบบ (supervisor) เท่านั้น
      </div>
    );
  }

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><BellRing size={22} /></span>{" "}
            แจ้งเตือน Google Chat
          </h1>
          <p>webhook ของแต่ละ space ที่ระบบส่งการ์ดแจ้งเตือนเข้าไป — แก้แล้วมีผลทันที ไม่ต้อง deploy ใหม่</p>
        </div>
      </div>

      <div className="info-note">
        <Info size={16} />
        <div>
          เอา URL มาจาก Google Chat: เปิด space → คลิกชื่อ space → <b>Apps &amp; integrations</b> → <b>Webhooks</b> → คัดลอก URL
          {" "}· ช่องที่เว้นว่าง + ไม่มี env สำรอง = ปิดแจ้งเตือนของ space นั้น (ระบบส่วนอื่นทำงานปกติ)
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : loadError ? (
        <div className="glass-panel" role="alert" style={{ padding: "14px 16px", borderColor: "var(--red)", color: "var(--red)" }}>{loadError}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rows.map((row) => (
            <section key={row.key} className="glass-panel" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{row.label}</h2>
                <span className="ui-badge" style={{ color: row.enabled && (row.url || row.envFallback) ? "var(--green)" : "var(--text-3)" }}>
                  {!row.enabled ? "ปิดใช้" : row.url ? "ใช้ค่าจากหน้านี้" : row.envFallback ? "ใช้ค่าจาก env (Vercel)" : "ยังไม่ได้ตั้ง"}
                </span>
                {row.updatedAt && (
                  <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                    แก้ล่าสุด {row.updatedByName || "-"} · {fmtDateTime(row.updatedAt)}
                  </span>
                )}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--text-3)" }}>{row.hint}</p>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  className="premium-input"
                  style={{ flex: 1, minWidth: 280, fontFamily: "monospace", fontSize: 12 }}
                  placeholder="https://chat.googleapis.com/v1/spaces/…"
                  value={row.url}
                  onChange={(e) => patchRow(row.key, { url: e.target.value })}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={row.enabled} onChange={(e) => patchRow(row.key, { enabled: e.target.checked })} />
                  เปิดใช้
                </label>
                <button type="button" className="btn btn-primary" disabled={busyKey === row.key || !row.dirty} onClick={() => save(row)}>
                  <Save size={15} /> บันทึก
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busyKey === row.key || row.dirty}
                  title={row.dirty ? "บันทึกก่อนแล้วค่อยส่งทดสอบ" : "ส่งการ์ดทดสอบเข้า space นี้"}
                  onClick={() => sendTest(row)}
                >
                  <Send size={15} /> ส่งทดสอบ
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

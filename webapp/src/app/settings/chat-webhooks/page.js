"use client";
// หน้าตั้งค่า Google Chat webhook แบบมีเวอร์ชัน (Decision 0012, mig 0133) —
// supervisor เท่านั้น. แต่ละ space แก้ไขใน "ฉบับร่าง" แล้วเผยแพร่ ระบบแจ้งเตือน
// อ่านจากเวอร์ชันที่เผยแพร่เท่านั้น (space ที่ไม่เคยตั้งค่า fallback env เดิม)
import { useCallback, useEffect, useState } from "react";
import { Archive, BellRing, Edit3, Eye, FilePlus2, Info, Send } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useCan } from "@/lib/roleContext";
import { fmtDateTime } from "@/lib/format";
import {
  CHAT_WEBHOOK_URL_PREFIX, chatWebhookStatusLabel, hasPublishableChangeNote, maskWebhookUrl,
} from "@/lib/chatWebhookSettings";
import styles from "./page.module.css";

const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";

// ป้ายสถานะค่าที่ "ใช้งานจริง" ของ space (published → env → ยังไม่ได้ตั้ง)
function effectiveStatus(space) {
  const pub = space.published;
  if (pub) {
    if (pub.enabled && pub.url) return { cls: styles.on, label: `เปิดใช้ · Version ${pub.versionNumber}` };
    return { cls: styles.off, label: `ปิดใช้ · Version ${pub.versionNumber}` };
  }
  if (space.envFallback) return { cls: styles.on, label: "ใช้ค่าจาก env (Vercel)" };
  return { cls: styles.off, label: "ยังไม่ได้ตั้ง" };
}

export default function ChatWebhooksPage() {
  const canManage = useCan("master:manage");
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyKey, setBusyKey] = useState(""); // key/action ที่กำลังทำงาน
  const [toast, setToast] = useState(null);
  const [drawer, setDrawer] = useState(null); // { mode: 'edit'|'history', space }
  const [form, setForm] = useState({ url: "", enabled: true, changeNote: "" });
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(null); // { action: 'publish'|'archive', space }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/chat-webhooks", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดไม่สำเร็จ");
      setSpaces(Array.isArray(d) ? d : []);
    } catch (e) {
      setLoadError(e.message);
    }
    setLoading(false);
  }, []);
  useEffect(() => { if (canManage) load(); else setLoading(false); }, [canManage, load]);

  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  };

  const openEdit = (space, draftRow = space.draft) => {
    if (!draftRow) return;
    setForm({ url: draftRow.url || "", enabled: draftRow.enabled !== false, changeNote: draftRow.changeNote || "" });
    setDirty(false);
    setDrawer({ mode: "edit", space });
  };

  const createDraft = async (space) => {
    setBusyKey(space.key);
    try {
      const draft = await request("/api/chat-webhooks/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: space.key }),
      }, "สร้างฉบับร่างไม่สำเร็จ");
      setToast({ kind: "success", msg: `สร้างฉบับร่าง "${space.label}" Version ${draft.versionNumber} แล้ว` });
      await load();
      openEdit({ ...space, draft }, draft);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setBusyKey("");
  };

  const saveDraft = async (event) => {
    event.preventDefault();
    const space = drawer?.space;
    const draftRow = space?.draft;
    if (!draftRow) return;
    setBusyKey(space.key);
    try {
      const saved = await request(`/api/chat-webhooks/draft/${draftRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expectedUpdatedAt: draftRow.updatedAt }),
      }, "บันทึกฉบับร่างไม่สำเร็จ");
      setDrawer(null);
      setToast({ kind: "success", msg: `บันทึกฉบับร่าง "${space.label}" Version ${saved.versionNumber} แล้ว` });
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setBusyKey("");
  };

  const transitionDraft = async () => {
    const space = confirm?.space;
    const draftRow = space?.draft;
    if (!draftRow || !confirm) return;
    const action = confirm.action;
    setBusyKey(space.key);
    try {
      await request(`/api/chat-webhooks/draft/${draftRow.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: draftRow.updatedAt }),
      }, action === "publish" ? "เผยแพร่การตั้งค่าไม่สำเร็จ" : "เก็บฉบับร่างไม่สำเร็จ");
      setConfirm(null);
      setDrawer(null);
      setToast({
        kind: "success",
        msg: action === "publish"
          ? `เผยแพร่ "${space.label}" Version ${draftRow.versionNumber} แล้ว`
          : `เก็บฉบับร่าง "${space.label}" Version ${draftRow.versionNumber} เป็นประวัติแล้ว`,
      });
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setBusyKey("");
  };

  // ส่งการ์ดทดสอบ — ค่าที่ใช้งานจริง (ไม่ส่ง versionId) หรือฉบับร่าง (ส่ง versionId)
  const sendTest = async (space, versionId = null) => {
    setBusyKey(space.key);
    try {
      await request("/api/chat-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: space.key, ...(versionId ? { versionId } : {}) }),
      }, "ส่งทดสอบไม่สำเร็จ");
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

  const drawerSpace = drawer?.space;
  const editingDraft = drawer?.mode === "edit" ? drawerSpace?.draft : null;

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><BellRing size={22} /></span>{" "}
            แจ้งเตือน Google Chat
          </h1>
          <p>webhook ของแต่ละ space จัดการแบบมีเวอร์ชัน — แก้ไขในฉบับร่างแล้วเผยแพร่ ระบบใช้ค่าที่เผยแพร่ทันที ไม่ต้อง deploy ใหม่</p>
        </div>
      </div>

      <div className="info-note">
        <Info size={16} />
        <div>
          เอา URL มาจาก Google Chat: เปิด space → คลิกชื่อ space → <b>Apps &amp; integrations</b> → <b>Webhooks</b> → คัดลอก URL
          {" "}· การแก้ไขทำใน<b>ฉบับร่าง</b>และมีผลเมื่อ<b>เผยแพร่</b>เท่านั้น · เผยแพร่ค่าว่าง (ไม่มี URL) = ปิดแจ้งเตือนของ space นั้น (ระบบส่วนอื่นทำงานปกติ)
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : loadError ? (
        <div className="glass-panel" role="alert" style={{ padding: "14px 16px", borderColor: "var(--red)", color: "var(--red)" }}>{loadError}</div>
      ) : (
        <div className={styles.layout}>
          {spaces.map((space) => {
            const status = effectiveStatus(space);
            const busy = busyKey === space.key;
            return (
              <section key={space.key} className={`glass-panel ${styles.spaceCard}`}>
                {/* ปุ่มสร้างฉบับร่าง = ปุ่มเพิ่มของเนื้อหา space นี้ — ขวาสุดของ card header ตามกติกา Page Header */}
                <header className={styles.spaceHeader}>
                  <div className={styles.spaceTitle}>
                    <h2>{space.label}</h2>
                    <span className={`${styles.badge} ${status.cls}`}>{status.label}</span>
                    {space.draft && <span className={`${styles.badge} ${styles.draftBadge}`}>มีฉบับร่าง Version {space.draft.versionNumber}</span>}
                  </div>
                  <div className={styles.spaceHeaderActions}>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={busy}
                      title="ส่งการ์ดทดสอบด้วยค่าที่ใช้งานอยู่"
                      onClick={() => sendTest(space)}
                    >
                      <Send size={14} /> ส่งทดสอบ
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setDrawer({ mode: "history", space })}>
                      <Eye size={14} /> ประวัติ ({(space.versions || []).length})
                    </button>
                    {!space.draft && (
                      <button type="button" className="btn btn-accent sm" onClick={() => createDraft(space)} disabled={busy}>
                        <FilePlus2 size={14} /> สร้างฉบับร่าง
                      </button>
                    )}
                  </div>
                </header>
                <div className={styles.spaceBody}>
                  <p className={styles.hint}>{space.hint}</p>
                  <div className={styles.configRow}>
                    <div className={styles.configUrl}>
                      {space.published
                        ? (space.published.url ? maskWebhookUrl(space.published.url) : "— ไม่มี URL (ปิดแจ้งเตือน space นี้) —")
                        : space.envFallback ? "— ใช้ค่าจาก env (Vercel) ไม่แสดงในหน้านี้ —" : "— ยังไม่ได้ตั้งค่า —"}
                    </div>
                  </div>
                  {space.published && (
                    <div className={styles.meta}>
                      เผยแพร่ล่าสุด {actorOf(space.published)} · {fmtDateTime(space.published.publishedAt)}
                      {space.published.changeNote ? ` · ${space.published.changeNote}` : ""}
                    </div>
                  )}

                  {space.draft && (
                    <div className={styles.draftStrip}>
                      <Edit3 size={18} aria-hidden="true" />
                      <div className={styles.draftCopy}>
                        <strong>Version {space.draft.versionNumber} กำลังเป็นฉบับร่าง</strong>
                        <p>บันทึกล่าสุด {fmtDateTime(space.draft.updatedAt)} · ยังไม่มีผลกับการแจ้งเตือนจนกว่าจะยืนยันเผยแพร่</p>
                      </div>
                      <div className={styles.draftActions}>
                        <button type="button" className="btn ghost sm" onClick={() => setConfirm({ action: "archive", space })} disabled={busy}>
                          <Archive size={14} /> เก็บฉบับร่าง
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setConfirm({ action: "publish", space })}
                          disabled={busy || !hasPublishableChangeNote(space.draft)}
                          title={!hasPublishableChangeNote(space.draft) ? "บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่" : undefined}
                        >
                          <Send size={14} /> เผยแพร่
                        </button>
                        <button type="button" className="btn btn-accent sm" onClick={() => openEdit(space)} disabled={busy}>
                          <Edit3 size={14} /> แก้ไขฉบับร่าง
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <RecordDrawer
        open={!!drawer}
        onClose={() => !busyKey && setDrawer(null)}
        closeOnOverlay={drawer?.mode !== "edit"}
        title={drawer?.mode === "edit"
          ? `แก้ไขฉบับร่าง "${drawerSpace?.label}" Version ${editingDraft?.versionNumber || "-"}`
          : `ประวัติเวอร์ชัน "${drawerSpace?.label}"`}
        subtitle={drawer?.mode === "edit"
          ? "บันทึกฉบับร่างก่อนเผยแพร่ ไม่มี Auto-save"
          : "Published และ Archived เป็นหลักฐานถาวรและแก้ไขไม่ได้"}
        footer={drawer?.mode === "edit" ? (
          <>
            <button type="button" className="btn ghost" onClick={() => setDrawer(null)} disabled={!!busyKey}>ยกเลิก</button>
            <button type="submit" form="chat-webhook-draft-form" className="btn btn-accent" disabled={!!busyKey}>
              {busyKey ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}
            </button>
          </>
        ) : <button type="button" className="btn" onClick={() => setDrawer(null)}>ปิด</button>}
      >
        {drawer?.mode === "edit" ? (
          <form id="chat-webhook-draft-form" className={styles.form} onSubmit={saveDraft}>
            <p className={styles.note}>การบันทึกจะอัปเดตเฉพาะฉบับร่าง การแจ้งเตือนยังใช้ค่าที่เผยแพร่อยู่จนกว่าจะยืนยันเผยแพร่</p>
            <label>
              Webhook URL
              <input
                type="text"
                className="premium-input"
                style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                placeholder={`${CHAT_WEBHOOK_URL_PREFIX}…`}
                value={form.url}
                maxLength={600}
                onChange={(e) => { setForm({ ...form, url: e.target.value }); setDirty(true); }}
              />
            </label>
            <label className={styles.checkboxRow} style={{ flexDirection: "row" }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => { setForm({ ...form, enabled: e.target.checked }); setDirty(true); }}
              />
              เปิดใช้การแจ้งเตือนของ space นี้
            </label>
            <label>
              หมายเหตุการเปลี่ยนแปลง <b>*</b>
              <textarea
                className="premium-input"
                value={form.changeNote}
                maxLength={500}
                placeholder="เช่น เปลี่ยน space ทีมขายเป็นห้องใหม่"
                onChange={(e) => { setForm({ ...form, changeNote: e.target.value }); setDirty(true); }}
              />
            </label>
            <div className={styles.testRow}>
              <button
                type="button"
                className="btn ghost sm"
                disabled={!!busyKey || dirty || !editingDraft?.url}
                title={dirty ? "บันทึกฉบับร่างก่อนแล้วค่อยส่งทดสอบ" : !editingDraft?.url ? "ฉบับร่างยังไม่มี URL" : "ส่งการ์ดทดสอบไปที่ URL ของฉบับร่าง"}
                onClick={() => sendTest(drawerSpace, editingDraft?.id)}
              >
                <Send size={14} /> ทดสอบฉบับร่าง
              </button>
            </div>
          </form>
        ) : drawerSpace ? (
          <div className={styles.historyList}>
            {(drawerSpace.versions || []).map((row) => (
              <article key={row.id} className={styles.historyItem}>
                <div className={styles.historyHead}>
                  <strong>Version {row.versionNumber}</strong>
                  <span className={`${styles.badge} ${row.status === "published" ? styles.on : row.status === "draft" ? styles.draftBadge : styles.off}`}>
                    {chatWebhookStatusLabel(row.status)}{row.status !== "draft" && !row.enabled ? " (ปิดใช้)" : ""}
                  </span>
                </div>
                <code>{row.url ? maskWebhookUrl(row.url) : "— ไม่มี URL —"}</code>
                <p>{row.changeNote || "ไม่มีหมายเหตุ"}</p>
                <small>{actorOf(row)} · {fmtDateTime(row.publishedAt || row.archivedAt || row.updatedAt)}</small>
              </article>
            ))}
          </div>
        ) : null}
      </RecordDrawer>

      <ConfirmDialog
        open={confirm?.action === "publish"}
        title={`ยืนยันเผยแพร่การตั้งค่า "${confirm?.space?.label || "-"}"`}
        description={`Version ${confirm?.space?.draft?.versionNumber || "-"} จะเป็นค่าที่ระบบใช้ส่งการ์ดแจ้งเตือนทันที`}
        detail={confirm?.space?.published
          ? "Published version เดิมจะถูกเก็บถาวร"
          : "space นี้จะเลิกใช้ค่า env (ถ้ามี) และยึดค่าที่เผยแพร่นี้แทน"}
        confirmLabel="เผยแพร่เวอร์ชัน"
        busy={!!busyKey}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <ConfirmDialog
        open={confirm?.action === "archive"}
        title="เก็บฉบับร่างเป็นประวัติ"
        description={`Version ${confirm?.space?.draft?.versionNumber || "-"} ของ "${confirm?.space?.label || "-"}" จะถูกปิดและแก้ไขต่อไม่ได้`}
        detail="ค่าที่ใช้งานอยู่ (เผยแพร่/env) จะไม่เปลี่ยนแปลง"
        confirmLabel="เก็บฉบับร่าง"
        tone="danger"
        busy={!!busyKey}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}

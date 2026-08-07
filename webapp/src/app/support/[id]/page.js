"use client";

// ── รายละเอียดเรื่องแจ้งปัญหา (mig 0219) ─────────────────────────────────
//
// **หน้าเดียว สองมุม** — ผู้แจ้งอ่านความคืบหน้าและตัดสินว่า "หายแล้ว/ยังไม่หาย"
// แอดมินได้แถบปุ่มจัดการเพิ่ม (รับเรื่อง · มอบหมาย · ปรับผลกระทบ · แก้แล้ว · ไม่ทำ)
//
// ⚠️ ปุ่มโผล่ตาม **สถานะ** ไม่ใช่ตาม role อย่างเดียว — `issueAction` (ตาราง ACTIONS)
// เป็นตัวตัดสินจริงที่ฝั่ง server หน้าจอแค่ไม่แสดงปุ่มที่กดไปก็โดนปฏิเสธ · ห้าม
// ย้ายกติกาลำดับขั้นมาเขียนซ้ำที่นี่
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import Modal from "@/components/Modal";
import PersonSelect from "@/components/ui/PersonSelect";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Segmented from "@/components/ui/Segmented";
import StatusBadge from "@/components/ui/StatusBadge";
import UpdateThread from "@/components/updates/UpdateThread";
import { notifyToast } from "@/lib/feedback";
import { describeResponseError } from "@/lib/fetchError";
import { fmtDateTime } from "@/lib/format";
import { useRole } from "@/lib/roleContext";
import { isSystemAdmin } from "@/lib/issues/access";
import { AUTO_CLOSE_DAYS } from "@/lib/issues/model";
import {
  ISSUE_IMPACTS, ISSUE_IMPACT_LABELS, ISSUE_IMPACT_TONES, ISSUE_KIND_LABELS,
  ISSUE_STATUS_LABELS, ISSUE_STATUS_TONES,
} from "@/lib/issues/statuses";
import styles from "./page.module.css";

const IMPACT_OPTIONS = ISSUE_IMPACTS.map((value) => ({ value, label: ISSUE_IMPACT_LABELS[value] }));

export default function IssueDetailPage() {
  const { id } = useParams();
  const role = useRole();
  const admin = isSystemAdmin({ role });

  const [issue, setIssue] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/issues/${id}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // อย่าโชว์คำว่า forbidden ดิบ ๆ — แปลเป็นข้อความที่คนอ่านรู้เรื่อง
        throw new Error(
          res.status === 403 ? "คุณไม่มีสิทธิ์ดูเรื่องนี้ (เห็นได้เฉพาะเรื่องที่คุณแจ้งเอง)"
            : res.status === 404 ? "ไม่พบเรื่องนี้ (อาจถูกลบไปแล้ว)"
              : body?.error || "โหลดเรื่องไม่สำเร็จ",
        );
      }
      setIssue(body.issue);
      setRelated(body.related || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // รายชื่อผู้รับมอบ = **role admin เท่านั้น** (มติ Q3/Q18) — โหลดตอนกด "มอบหมาย"
  // ไม่ใช่ตอนเปิดหน้า เพราะคนส่วนใหญ่เข้ามาอ่านเฉย ๆ
  const openAssign = () => {
    setAssignee(issue?.assigneeId || "");
    setAssigning(true);
    if (admins.length) return;
    fetch("/api/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setAdmins((Array.isArray(list) ? list : []).filter((u) => u.role === "admin")))
      .catch(() => setAdmins([]));
  };

  const MESSAGES = {
    confirm: "ปิดเรื่องแล้ว ขอบคุณที่ยืนยัน",
    reopen: "แจ้งกลับให้ผู้ดูแลแล้ว",
    acknowledge: "รับเรื่องแล้ว",
    assign: "มอบหมายแล้ว",
    impact: "ปรับผลกระทบแล้ว",
    resolve: "แจ้งว่าแก้แล้ว — รอผู้แจ้งยืนยัน",
    reject: "ปิดเรื่องแล้ว",
  };

  const act = async (action, extra = {}) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "ทำรายการไม่สำเร็จ"));
      await load();
      notifyToast.success(MESSAGES[action] || "บันทึกแล้ว");
      return true;
    } catch (e) {
      notifyToast.error(e.message);
      return false;
    } finally { setBusy(false); }
  };

  return (
    <Workspace
      icon={<LifeBuoy size={22} />}
      title={issue?.title || "เรื่องแจ้งปัญหา"}
      subtitle={issue?.code}
      back={{ href: "/support", label: "กลับหน้ารายการ" }}
      hideHeader
      loading={loading}
    >
      {error && <p className={styles.error} role="alert">{error}</p>}

      {issue && (
        <div className={styles.page}>
          <header className={styles.head}>
            <div className={styles.headMain}>
              <span className={styles.code}>{issue.code}</span>
              <h1>{issue.title || "(ไม่มีหัวข้อ)"}</h1>
              <p className={styles.meta}>
                แจ้งโดย {issue.reportedByName || "—"} · {fmtDateTime(issue.createdAt)}
              </p>
            </div>
            <div className={styles.headBadges}>
              <StatusBadge tone={ISSUE_IMPACT_TONES[issue.impact]} label={ISSUE_IMPACT_LABELS[issue.impact]} />
              <StatusBadge dot tone={ISSUE_STATUS_TONES[issue.status]} label={ISSUE_STATUS_LABELS[issue.status]} />
            </div>
          </header>

          {/* แถบจัดการของผู้ดูแลระบบ — ปุ่มไหนโผล่ขึ้นกับสถานะ (ตาราง ACTIONS
              ที่ฝั่ง server เป็นตัวตัดสินจริง) · หนึ่งบริบทมี filled action เดียว
              ปุ่มที่เหลือจึงเป็น Button เปล่า/quiet ตามกฎ UI */}
          {admin && ["pending", "acknowledged", "resolved"].includes(issue.status) && (
            <div className={styles.adminBar}>
              {issue.status === "pending" && (
                <Button tone="accent" disabled={busy} onClick={() => act("acknowledge")}>รับเรื่อง</Button>
              )}
              {issue.status === "acknowledged" && (
                <Button tone="accent" disabled={busy} onClick={() => act("resolve")}>แจ้งว่าแก้แล้ว</Button>
              )}
              <Button disabled={busy} onClick={openAssign}>
                {issue.assigneeId ? "เปลี่ยนผู้รับผิดชอบ" : "มอบหมายให้…"}
              </Button>
              <span className={styles.spacer} />
              {issue.status !== "resolved" && (
                <Button variant="quiet" disabled={busy} onClick={() => { setReason(""); setRejecting(true); }}>
                  ไม่ใช่บั๊ก / ไม่ทำ
                </Button>
              )}
            </div>
          )}

          {/* ⭐ ปิดสองฝ่าย (มติ Q8): แอดมินตั้ง "แก้แล้ว" แล้วผู้แจ้งเป็นคนปิดจริง
              บอกกำหนดปิดอัตโนมัติไว้ตรงนี้ ไม่ใช่ให้เงียบไปแล้วเรื่องหายเอง */}
          {issue.status === "resolved" && (
            <div className={styles.resolved}>
              <div>
                <b>ผู้ดูแลแจ้งว่าแก้แล้ว{issue.resolvedAt ? ` เมื่อ ${fmtDateTime(issue.resolvedAt)}` : ""}</b>
                <p>
                  ช่วยลองใช้งานอีกครั้งแล้วยืนยันว่าหายจริงไหม —
                  ถ้าไม่ตอบภายใน {AUTO_CLOSE_DAYS} วัน ระบบจะปิดเรื่องให้เอง
                </p>
              </div>
              <div className={styles.resolvedActions}>
                <Button tone="accent" onClick={() => act("confirm")} disabled={busy}>ยืนยันว่าหายแล้ว</Button>
                <Button onClick={() => act("reopen")} disabled={busy}>ยังไม่หาย</Button>
              </div>
            </div>
          )}

          {issue.status === "rejected" && issue.rejectReason && (
            <div className={styles.rejected}>
              <b>ผู้ดูแลปิดเรื่องนี้ว่าไม่ใช่บั๊ก / ไม่ทำ</b>
              <p>{issue.rejectReason}</p>
            </div>
          )}

          <div className={styles.split}>
            <section className={styles.thread}>
              <h2>ความคืบหน้า</h2>
              <UpdateThread
                entityType="system_issue"
                entityId={issue.id}
                /* ⭐ รายละเอียดที่ผู้แจ้งเขียนไว้ = "อาการของใบนี้" ต้องอ่านก่อนไล่ไทม์ไลน์เสมอ
                   จึงปักหมุดหัวเธรด ไม่ปล่อยให้จมอยู่ก้นบทสนทนาที่คุยกันยาว */
                pinned={(
                  <div className={styles.pinned}>
                    <b>อาการที่แจ้ง</b>
                    <p>{issue.detail}</p>
                  </div>
                )}
                placeholder="พิมพ์ตอบกลับ…"
                emptyText="ยังไม่มีความคืบหน้า"
                composeHint={issue.assigneeName ? `แจ้งเตือนถึง ${issue.assigneeName}` : "ยังไม่มีผู้รับผิดชอบ — เรื่องอยู่ในคิวของผู้ดูแลระบบ"}
              />
            </section>

            <aside className={styles.side}>
              <section className={styles.card}>
                <h2>ข้อมูลเรื่อง</h2>
                <dl className={styles.kv}>
                  <dt>ประเภท</dt><dd>{ISSUE_KIND_LABELS[issue.kind]}</dd>
                  <dt>ผลกระทบ</dt>
                  <dd>
                    {/* แอดมินปรับได้ตรงนี้ (มติ Q9) — ผู้แจ้งเป็นคนประเมินครั้งแรก
                        แต่คนที่เห็นภาพรวมคิวคือคนที่จัดลำดับได้จริง */}
                    {admin && ["pending", "acknowledged", "resolved"].includes(issue.status) ? (
                      <Segmented
                        options={IMPACT_OPTIONS}
                        value={issue.impact}
                        onChange={(value) => value !== issue.impact && act("impact", { impact: value })}
                        ariaLabel="ปรับผลกระทบ"
                      />
                    ) : ISSUE_IMPACT_LABELS[issue.impact]}
                  </dd>
                  <dt>ผู้รับผิดชอบ</dt><dd>{issue.assigneeName || <span className={styles.dim}>ยังไม่มีผู้รับ</span>}</dd>
                  {issue.pageUrl && <><dt>หน้าที่พบ</dt><dd className={styles.mono}>{issue.pageUrl}</dd></>}
                  {issue.userAgent && <><dt>เบราว์เซอร์</dt><dd className={styles.dim}>{issue.userAgent}</dd></>}
                  <dt>ผู้แจ้ง</dt>
                  <dd className={styles.dim}>
                    {[issue.reporterRole, issue.reporterDepartment, issue.reporterTeam].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </dl>
              </section>

              {!!related.length && (
                <section className={styles.card}>
                  <h2>เรื่องอื่นจากหน้าเดียวกัน</h2>
                  <ul className={styles.related}>
                    {related.map((row) => (
                      <li key={row.id}>
                        <StatusBadge size="sm" dot tone={ISSUE_STATUS_TONES[row.status]} label={ISSUE_STATUS_LABELS[row.status]} />
                        <span>{row.title || row.code}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>

          <Modal open={assigning} onClose={() => setAssigning(false)} title="มอบหมายผู้รับผิดชอบ" size="sm">
            <p className={styles.modalNote}>
              เลือกได้เฉพาะผู้ดูแลระบบ (role admin) — คนที่ถูกมอบหมายจะได้รับแจ้งเตือนทันที
            </p>
            <PersonSelect
              users={admins}
              value={assignee}
              onChange={setAssignee}
              emptyLabel="— เลือกผู้ดูแลระบบ —"
              ariaLabel="ผู้รับผิดชอบ"
            />
            <div className={styles.modalFoot}>
              <Button variant="quiet" onClick={() => setAssigning(false)} disabled={busy}>ยกเลิก</Button>
              <Button
                tone="accent"
                disabled={busy || !assignee}
                onClick={async () => {
                  const picked = admins.find((u) => u.id === assignee);
                  const done = await act("assign", { assigneeId: assignee, assigneeName: picked?.name || null });
                  if (done) setAssigning(false);
                }}
              >
                มอบหมาย
              </Button>
            </div>
          </Modal>

          {/* บังคับเหตุผลสองชั้น (ที่นี่ + CHECK ของ DB) — "ไม่ทำ" เฉย ๆ ทำให้ผู้แจ้ง
              ไม่รู้ว่าควรทำอะไรต่อ และเป็นสาเหตุที่คนเลิกแจ้ง */}
          <ReasonDialog
            open={rejecting}
            title="ปิดเรื่องว่าไม่ใช่บั๊ก / ไม่ทำ"
            description="ผู้แจ้งจะเห็นเหตุผลนี้ในหน้าเรื่อง และเรื่องจะถูกปิดทันที"
            detail={issue.code}
            label="เหตุผล"
            value={reason}
            onChange={setReason}
            onClose={() => setRejecting(false)}
            confirmLabel="ปิดเรื่อง"
            placeholder="เช่น เป็นพฤติกรรมที่ตั้งใจให้เป็นแบบนี้ / ซ้ำกับเรื่อง IS-…"
            onConfirm={async () => {
              const done = await act("reject", { reason });
              if (done) setRejecting(false);
            }}
          />
        </div>
      )}
    </Workspace>
  );
}

"use client";
// ── ตารางส่งต่องาน — ตัวเดียวของหน้าโอนงานคนลาออก และหน้าต่างส่งต่อของหน้าลูกค้า (มติ 27/11 ข้อ 1) ─────────
//
// แต่ละแถวเลือก ทีม · คนรับ · AC · AE Sup (ดีล) หรือ ทีม · คนรับ (ลีด) แล้วกด "โอน" — แถวที่โอนสำเร็จหายไป
// ติ๊กหลายแถว = แถบ "ส่งทั้งหมดให้" (AC/Sup ตั้งต้นเป็น "คงคนเดิมของแต่ละใบ")
//
// ⚠️ ค่าตั้งต้น: ทีม = ทีมเดิมของใบ · AC/Sup = คนเดิมของใบ · **คนรับไม่มีค่าตั้งต้น** (เป็นการตัดสินใจ — form rules)
// ⚠️ แถวที่ส่งไม่สำเร็จค้างอยู่พร้อมเหตุจาก server — ไม่หายไปเงียบ ๆ
import { useMemo, useState } from "react";
import { ArrowRightLeft, FileText, Lock, MoveRight } from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import PersonSelect from "@/components/ui/PersonSelect";
import StatusBadge from "@/components/ui/StatusBadge";
import { TableScroll } from "@/components/ui/Table";
import { apiJson } from "@/lib/apiFetch";
import { DEAL_HOLDER_ROLES, userTeams } from "@/lib/permissions";
import { PROJECT_PEOPLE_ROLES } from "@/lib/pm/projectPeople";
import { STAGE_LABELS } from "@/lib/salesPlanning";
import { LEAD_STATUS_LABELS } from "@/lib/sales/leads";
import { contractStatusLabel } from "@/lib/sales/contracts";
import { fmtDateTime, fmtMoney, NA, naText } from "@/lib/format";
import styles from "./handover.module.css";

export const KEEP = "";

const STAGE_TONE = { lead: "neutral", qualified: "info", timeline_proposed: "info", quotation: "info", awaiting_confirm: "warning", deposit_pending: "warning", won: "success", in_project: "success" };
const ORDER_STATUS = { draft: "ร่าง", pending_approval: "รออนุมัติ", rejected: "ตีกลับ", approval_revoked: "ยกเลิกอนุมัติ", approved: "อนุมัติแล้ว" };
const QUOTE_STATUS = { draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", sent: "ส่งแล้ว", accepted: "รับแล้ว", rejected: "ตีกลับ", expired: "หมดอายุ" };

/** ทะเบียนคน → ตัวเลือกของสามช่อง (ทีม · คนรับ · AC · Sup) — กรองด้วย role ชุดเดียวกับที่ server ตรวจ */
export function useHandoverPeople(directory = [], { excludeId = null } = {}) {
  return useMemo(() => {
    const active = (directory || []).filter((u) => !u.disabled);
    const holders = active.filter((u) => DEAL_HOLDER_ROLES.includes(u.role) && String(u.id) !== String(excludeId || ""));
    const teams = [...new Set(holders.flatMap((u) => userTeams(u)))].sort();
    /* คนที่ถูกเลือกไว้เดิมแต่หลุดเงื่อนไข (ย้ายทีม/ถูกระงับ) ยังต้องโชว์ ไม่งั้นช่องดูเหมือนว่างทั้งที่มีค่า (กติกาเดียวกับฟอร์มดีล) */
    const withCurrent = (list, id) => (id && !list.some((u) => String(u.id) === String(id))
      ? [...list, ...(directory || []).filter((u) => String(u.id) === String(id))]
      : list);
    return {
      teams,
      withCurrent,
      holdersIn: (team) => holders.filter((u) => !team || userTeams(u).includes(team)),
      acsIn: (team) => active.filter((u) => PROJECT_PEOPLE_ROLES.preparedBy.includes(u.role) && (!team || !userTeams(u).length || userTeams(u).includes(team))),
      sups: active.filter((u) => PROJECT_PEOPLE_ROLES.aeSupervisor.includes(u.role)),
    };
  }, [directory, excludeId]);
}

/** ช่องเลือกของหนึ่งแถว (หรือแถบส่งหลายแถว) */
export function HandoverPick({ pick, onChange, people, withRoles = true, keepRoles = false, current = {} }) {
  const teamOptions = people.teams.map((t) => ({ value: t, label: t }));
  return (
    <div className={styles.pick}>
      <div className={styles.pickLine}>
        <ChoiceChips value={pick.team || ""} options={teamOptions} ariaLabel="ทีมของงานที่ส่งต่อ"
          onChange={(team) => onChange({ ...pick, team, toUserId: "" })} />
        <PersonSelect users={people.holdersIn(pick.team)} value={pick.toUserId || ""} size="sm"
          emptyLabel="เลือกคนรับ…" ariaLabel="คนรับงาน"
          onChange={(toUserId) => onChange({ ...pick, toUserId })} />
      </div>
      {withRoles ? (
        <div className={styles.pickRoles}>
          <label className={styles.mini}>
            AC
            <PersonSelect users={people.withCurrent(people.acsIn(pick.team), current.acOwnerId)} value={pick.acOwnerId ?? KEEP} size="sm"
              emptyLabel={keepRoles ? "คงคนเดิมของแต่ละใบ" : (current.acOwnerId ? null : "— ยังไม่มี AC —")} ariaLabel="ผู้ประสานงาน (AC)"
              onChange={(acOwnerId) => onChange({ ...pick, acOwnerId })} />
          </label>
          <label className={styles.mini}>
            AE Sup
            <PersonSelect users={people.withCurrent(people.sups, current.aeSupervisorId)} value={pick.aeSupervisorId ?? KEEP} size="sm"
              emptyLabel={keepRoles ? "คงคนเดิมของแต่ละใบ" : (current.aeSupervisorId ? null : "— ยังไม่มี AE Sup —")} ariaLabel="ผู้ตรวจสอบ (AE Supervisor)"
              onChange={(aeSupervisorId) => onChange({ ...pick, aeSupervisorId })} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** เอกสารของดีลพร้อมบอกว่าย้ายตามไหม */
export function DealDocs({ docs = [] }) {
  if (!docs.length) return <span className={styles.docNote}>ยังไม่มีเอกสาร</span>;
  return (
    <div className={styles.docs}>
      {docs.map((doc) => {
        if (doc.kind === "quotation") {
          return (
            <span key={doc.id} className={styles.doc}>
              <FileText size={13} aria-hidden="true" />{doc.number || "ใบเสนอราคา"}
              <span className={styles.docNote}>{QUOTE_STATUS[doc.status] || doc.status}</span>
            </span>
          );
        }
        const moves = doc.moves === "with";
        const label = doc.kind === "contract"
          ? (doc.number || (doc.contractKind === "service" ? "สัญญาบริการ" : "สัญญา"))
          : (doc.number || "ใบสั่งขาย");
        const status = doc.kind === "contract" ? contractStatusLabel(doc.status) : (ORDER_STATUS[doc.status] || doc.status);
        return (
          <span key={doc.id} className={`${styles.doc} ${moves ? styles.docMoves : styles.docStays}`}>
            {moves ? <MoveRight size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
            {label}
            <span className={styles.docNote}>{status} · {moves ? "ย้ายตาม" : "ยอดอยู่กับคนเดิม"}</span>
          </span>
        );
      })}
    </div>
  );
}

export function HandoverLegend() {
  return (
    <div className={styles.legend}>
      <span className={styles.legendItem}><MoveRight size={13} aria-hidden="true" />ย้ายตามเจ้าของใหม่</span>
      <span className={styles.legendItem}><Lock size={13} aria-hidden="true" />ไม่ย้าย — ยอดขายนับให้คนปิด</span>
      <span className={styles.legendItem}><FileText size={13} aria-hidden="true" />ใบเสนอราคา: ชื่อผู้เสนอราคาบนใบพิมพ์อ่านจากเจ้าของดีล</span>
    </div>
  );
}

const initialPick = (row, kind) => (kind === "lead"
  ? { team: row.team || "", toUserId: "" }
  : { team: row.team || "", toUserId: "", acOwnerId: row.acOwnerId || KEEP, aeSupervisorId: row.aeSupervisorId || KEEP });

/** แปลงตัวเลือกเป็นรายการที่ส่ง API — AC/Sup ส่งเฉพาะที่เปลี่ยนจากคนเดิม (ไม่ส่ง = คงคนเดิม) */
export function handoverItem(row, kind, pick) {
  const item = { kind, id: row.id, toUserId: pick.toUserId, team: pick.team || null };
  if (kind === "deal") {
    if (pick.acOwnerId && pick.acOwnerId !== (row.acOwnerId || "")) item.acOwnerId = pick.acOwnerId;
    if (pick.aeSupervisorId && pick.aeSupervisorId !== (row.aeSupervisorId || "")) item.aeSupervisorId = pick.aeSupervisorId;
  }
  return item;
}

/**
 * @param kind "deal" | "lead"
 * @param rows แถวจาก GET /api/sales-planning/handover
 * @param onTransferred (okResults, rowsById) — ผู้เรียกถอดแถวที่สำเร็จออก + เก็บลงประวัติ
 */
export default function HandoverTable({ kind, rows = [], people, showOwner = false, showReasons = false, onTransferred, onToast }) {
  const [picks, setPicks] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [bulk, setBulk] = useState({ team: "", toUserId: "", acOwnerId: KEEP, aeSupervisorId: KEEP });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const pickOf = (row) => picks[row.id] || initialPick(row, kind);
  const setPick = (row, next) => setPicks((prev) => ({ ...prev, [row.id]: next }));
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const chosen = rows.filter((r) => selected.has(r.id));
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const send = async (items) => {
    setBusy(true);
    try {
      const data = await apiJson("/api/sales-planning/handover", { method: "POST", json: { items }, fallbackError: "ส่งต่องานไม่สำเร็จ" });
      const results = data.results || [];
      const failed = Object.fromEntries(results.filter((r) => !r.ok).map((r) => [r.id, r.error]));
      setErrors((prev) => {
        const next = { ...prev };
        for (const r of results) { if (r.ok) delete next[r.id]; }
        return { ...next, ...failed };
      });
      const done = results.filter((r) => r.ok);
      if (done.length) {
        setSelected((prev) => new Set([...prev].filter((id) => !done.some((r) => r.id === id))));
        onTransferred?.(done, rowsById);
      }
      const warned = done.filter((r) => r.warning);
      if (done.length) {
        onToast?.({
          kind: warned.length ? "warning" : "success",
          msg: done.length === 1
            ? `ส่งต่อ ${done[0].label} ให้ ${done[0].toName} แล้ว${warned.length ? ` · ${warned[0].warning}` : ""}`
            : `ส่งต่อ ${done.length} รายการแล้ว${results.length - done.length ? ` · ไม่สำเร็จ ${results.length - done.length} รายการ (ดูเหตุที่แถว)` : ""}`,
        });
      } else if (results.length) {
        onToast?.({ kind: "error", msg: results[0].error || "ส่งต่องานไม่สำเร็จ" });
      }
    } catch (error) {
      onToast?.({ kind: "error", msg: error.message });
    } finally {
      setBusy(false);
    }
  };

  const sendRow = (row) => {
    const pick = pickOf(row);
    if (!pick.toUserId) { setErrors((prev) => ({ ...prev, [row.id]: "เลือกคนรับก่อน" })); return; }
    send([handoverItem(row, kind, pick)]);
  };
  const sendBulk = () => {
    if (!bulk.toUserId) { setErrors((prev) => ({ ...prev, __bulk: "เลือกคนรับก่อน" })); return; }
    setErrors((prev) => { const next = { ...prev }; delete next.__bulk; return next; });
    send(chosen.map((row) => handoverItem(row, kind, {
      team: bulk.team || row.team,
      toUserId: bulk.toUserId,
      acOwnerId: bulk.acOwnerId || row.acOwnerId || KEEP,
      aeSupervisorId: bulk.aeSupervisorId || row.aeSupervisorId || KEEP,
    })));
  };
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      {kind === "deal" ? <HandoverLegend /> : null}
      {chosen.length ? (
        <div className={styles.bulkbar}>
          <span className={styles.bulkCount}>เลือก {chosen.length} รายการ · ส่งทั้งหมดให้</span>
          <HandoverPick pick={bulk} people={people} withRoles={kind === "deal"} keepRoles
            onChange={(next) => setBulk({ ...next, team: next.team })} />
          <Button tone="primary" size="sm" icon={<ArrowRightLeft size={14} />} disabled={busy} onClick={sendBulk}>
            โอน {chosen.length} รายการ
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>ล้างที่เลือก</Button>
          {errors.__bulk ? <span className={styles.rowError}>{errors.__bulk}</span> : null}
        </div>
      ) : null}
      <TableScroll family="list" surface="embedded" cells="stacked">
        <table>
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allOn} aria-label="เลือกทั้งหมด"
                  onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              {kind === "deal" ? (
                <>
                  <th>ดีล</th>
                  {showOwner ? <th>เจ้าของตอนนี้</th> : null}
                  <th>ขั้น</th>
                  {showReasons ? <th>งานที่ยังค้าง</th> : null}
                  <th className="num">มูลค่า</th>
                  <th>เอกสาร</th>
                  <th>ส่งให้ (ทีม · คนรับ · AC · AE Sup)</th>
                </>
              ) : (
                <>
                  <th>ลีด</th>
                  <th>สถานะ</th>
                  <th>นัดล่าสุด</th>
                  <th>ส่งให้ (ทีม · คนรับ)</th>
                </>
              )}
              <th aria-label="โอน" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)}
                    aria-label={`เลือก ${row.code || row.company || row.contactName || row.id}`} />
                </td>
                {kind === "deal" ? (
                  <>
                    <td>
                      <div className={styles.cellStack}>
                        <span className={styles.code}>{naText(row.code)}</span>
                        <span className={styles.title} title={row.title || ""}>{naText(row.title)}</span>
                        <span className={styles.sub}>{row.customerName || "ยังไม่ผูกลูกค้า"}</span>
                      </div>
                    </td>
                    {showOwner ? <td>{naText(row.ownerName)}</td> : null}
                    <td><StatusBadge tone={STAGE_TONE[row.stage] || "neutral"} label={STAGE_LABELS[row.stage] || row.stage} /></td>
                    {showReasons ? (
                      <td>
                        <div className={styles.reasons}>
                          {(row.reasons || []).map((r) => <StatusBadge key={`${r.key}-${r.detail || ""}`} tone="warning" label={r.label} title={r.detail || undefined} />)}
                        </div>
                      </td>
                    ) : null}
                    <td className="num">{row.projectValue == null ? NA : fmtMoney(row.projectValue)}</td>
                    <td><DealDocs docs={row.docs} /></td>
                  </>
                ) : (
                  <>
                    <td>
                      <div className={styles.cellStack}>
                        <span className={styles.title}>{naText(row.company)}</span>
                        <span className={styles.sub}>{naText(row.contactName)}</span>
                      </div>
                    </td>
                    <td><StatusBadge tone="info" label={LEAD_STATUS_LABELS[row.status] || row.status} /></td>
                    <td>{row.meetingAt ? fmtDateTime(row.meetingAt) : NA}</td>
                  </>
                )}
                <td>
                  <HandoverPick pick={pickOf(row)} people={people} withRoles={kind === "deal"}
                    current={{ acOwnerId: row.acOwnerId, aeSupervisorId: row.aeSupervisorId }}
                    onChange={(next) => { setPick(row, next); if (next.toUserId) setErrors((prev) => { const n = { ...prev }; delete n[row.id]; return n; }); }} />
                  {errors[row.id] ? <div className={styles.rowError} role="status">{errors[row.id]}</div> : null}
                </td>
                <td className={styles.rowAction}>
                  <Button tone="primary" size="sm" icon={<ArrowRightLeft size={14} />} disabled={busy} onClick={() => sendRow(row)}>โอน</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}

"use client";
// ── จอ "งวดที่วันจะเปลี่ยน" หลังบันทึกกติกาของลูกค้า (รุ่นสี่ · system-design §7.2 · ม็อก recommended.html `modal=redate`) ──
//
// ⭐ **ระบบเสนอ คนยืนยัน — ไม่ย้ายวันเองตอนบันทึกกติกา** (ข้อติกรรมการ 29/09 ข้อ 6 · §9 ความเสี่ยง 3)
//    รายการมาจาก `ruleChange` ที่ PATCH /billing-rule คืน (= `planRuleChange` ของงวดเปิดทุกใบของลูกค้า · คิดที่ server ตัวเดียว)
//    · rows = งวดที่ระบบเสนอวันใหม่ (ล้างวันวางบิล · เพิ่มวันวางบิลถอยจากกำหนดชำระ · กำหนดชำระใหม่ตามกติกา)
//    · kept = งวดที่ไม่แตะพร้อมเหตุ (แก้เองไว้ · ขอใบวางบิลแล้ว · ติ๊กงวดนี้ไม่ต้องวางบิล · กำหนดชำระไม่ตรงวันจ่าย = มีสองทาง)
// ⚠️ **ไม่มีค่าตั้งต้น** — ไม่ติ๊กให้สักงวด · "เลือกทั้งหมด" เป็นการกดของคน · งวดที่ไม่เลือกคงวันเดิม
// ⚠️ ยืนยันผ่าน POST …/billing-rule/redate (ตัวเขียนของ schedule-many ต่อใบ: ล็อกงวด · updatedAt · ตรวจทุกแถวก่อนเขียน)
//    409 = งวดที่มีคนแก้/ล็อกระหว่างนี้ ⇒ เอาออกจากที่เลือกพร้อมเหตุที่แถว ที่เหลือคงที่เลือกไว้ ให้กดอีกครั้ง
import { useState } from "react";
import { ArrowDown, CircleAlert, CircleCheck, EyeOff, ExternalLink, ListChecks, Lock } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { fmtMoney } from "@/lib/format";
import { NO_BILLING_TEXT, UNKNOWN_TEXT, billingCellText, describeRule, dueCellText, ruleOf, sourceLabel } from "@/lib/sales/billingRule";
import { applyRedateConflicts, changeTextOf, keptTextOf, redatePayloadOf } from "./CustomerBillingRuleState";
import { PairRow } from "./CustomerBillingRuleRounds";
import styles from "./CustomerBillingRule.module.css";

const soHref = (id) => `/sales-planning/sales-orders/${encodeURIComponent(id)}`;

/* ลิงก์ไปใบ SO (แท็บใหม่ — โมดัลนี้ไม่ปิดทิ้ง) · `short` = คำว่า "เปิดใบ" ต่อท้ายหัวแถวที่มีเลขใบอยู่แล้ว */
function SoRef({ id, code, seq, short = false }) {
  const label = <><span className={styles.nowrap}>{code || "ใบสั่งขาย"}</span> · งวด {seq}</>;
  if (!id) return short ? null : <b>{label}</b>;
  return (
    <a className={styles.soLink} href={soHref(id)} target="_blank" rel="noopener noreferrer" aria-label={`เปิด ${code || "ใบสั่งขาย"} งวด ${seq} ในแท็บใหม่`}>
      {short ? "เปิดใบ" : <b>{label}</b>}<ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

export default function CustomerBillingRuleRedate({ open = true, customer, change, after, onClose }) {
  const rows = change?.rows || [];
  const kept = change?.kept || [];
  const same = change?.same || [];
  const hiddenOrders = Number(change?.hiddenOrders) || 0;
  const [selected, setSelected] = useState(() => new Set());
  const [blocked, setBlocked] = useState(() => new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);

  const afterRule = ruleOf(after);
  const creditDays = afterRule?.creditDays || 0;
  const noBilling = afterRule?.need === "none";
  const selectable = rows.filter((row) => !blocked.has(row.id));
  const allOn = selectable.length > 0 && selectable.every((row) => selected.has(row.id));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setError("");
  };
  const toggleAll = () => {
    setSelected(allOn ? new Set() : new Set(selectable.map((row) => row.id)));
    setError("");
  };

  const apply = async () => {
    if (saving) return;
    setTried(true);
    if (!selected.size) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiJson(`/api/master/customers/${encodeURIComponent(customer.id)}/billing-rule/redate`, {
        method: "POST",
        json: redatePayloadOf(change, selected),
        fallbackError: "ใช้วันใหม่ไม่สำเร็จ",
      });
      const saved = Number(res?.saved) || selected.size;
      notifyToast.success(`ใช้วันใหม่ ${saved} งวดแล้ว · งวดที่ไม่เลือกคงวันเดิม`);
      onClose?.({ saved });
    } catch (err) {
      if (err?.status === 409 && Array.isArray(err.data?.conflicts)) {
        const hit = applyRedateConflicts(selected, err.data.conflicts);
        setSelected(hit.selected);
        setBlocked((prev) => new Map([...prev, ...hit.blocked]));
      }
      setError(err?.message || "ใช้วันใหม่ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const status = error
    ? <p className={styles.status} role="status" data-tone="danger"><CircleAlert size={14} aria-hidden="true" /><span>{error}</span></p>
    : tried && !selected.size && rows.length
      ? <p className={styles.status} role="status" data-tone="warn"><CircleAlert size={14} aria-hidden="true" /><span>ยังไม่ได้เลือกงวด — ติ๊กงวดที่จะใช้วันใหม่ หรือกด &quot;ข้ามไปก่อน&quot; (คงวันเดิมทุกงวด)</span></p>
      : null;

  const footer = (
    <div className={styles.foot}>
      {status}
      <div className={styles.footRow}>
        <p className={`${styles.shield} ${styles.footInfo}`}><CircleCheck size={14} aria-hidden="true" /><span>ข้ามไปก่อนได้ — งวดคงวันเดิม · แก้ทีละงวดได้ที่งวดชำระของใบ SO</span></p>
        <div className={styles.footActions}>
          <Button tone="neutral" onClick={() => onClose?.({ saved: 0 })} disabled={saving}>{rows.length ? "ข้ามไปก่อน" : "ปิด"}</Button>
          {rows.length ? (
            <Button tone="primary" className={styles.saveBtn} disabled={saving} onClick={apply}>
              {saving ? "กำลังบันทึก…" : `ใช้วันใหม่ ${selected.size} งวด`}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => onClose?.({ saved: 0 })}
      dismissible={!saving}
      size="md"
      sheetOnPhone
      title="งวดที่วันจะเปลี่ยน"
      subtitle={`${customer?.arCode ? `${customer.arCode} · ` : ""}${describeRule(after) || UNKNOWN_TEXT} · ระบบเสนอ ไม่ย้ายวันเอง`}
      footer={footer}
    >
      {rows.length ? (
        <>
          <div className={styles.rdHead}>
            <p>เลือกงวดที่จะใช้วันใหม่ — ไม่มีค่าตั้งต้น · งวดที่ไม่เลือกคงวันเดิม</p>
            {selectable.length > 1 ? (
              <Button variant="quiet" size="sm" icon={<ListChecks size={14} aria-hidden="true" />} onClick={toggleAll}>
                {allOn ? "ไม่เลือกทั้งหมด" : `เลือกทั้งหมด ${selectable.length} งวด`}
              </Button>
            ) : null}
          </div>
          <ul className={styles.rdList}>
            {rows.map((row) => {
              const why = blocked.get(row.id);
              const inputId = `billing-redate-${row.id}`;
              return (
                <li key={row.id} className={styles.rdRow} data-on={selected.has(row.id) ? "1" : undefined} data-blocked={why ? "1" : undefined}>
                  {/* เป้าแตะ 44px ทั้งช่อง (มือถือ) — หัวแถวเป็นป้ายของช่องเดียวกันอีกอัน (htmlFor) */}
                  <label className={styles.rdCheck}>
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={selected.has(row.id)}
                      disabled={Boolean(why) || saving}
                      onChange={() => toggle(row.id)}
                    />
                    <span className="sr-only">เลือก {row.salesOrderCode || "ใบสั่งขาย"} งวด {row.seq}</span>
                  </label>
                  <div className={styles.rdBody}>
                    <div className={styles.rdTitleRow}>
                      <label htmlFor={inputId} className={styles.rdTitle}>
                        <span>
                          <span className={styles.nowrap}>{row.salesOrderCode || "ใบสั่งขาย"}</span> · งวด {row.seq}
                          {row.amount ? <> · <span className={styles.nowrap}>{fmtMoney(row.amount)}</span></> : null}
                        </span>
                        <small>{changeTextOf(row)}</small>
                      </label>
                      <SoRef id={row.salesOrderId} code={row.salesOrderCode} seq={row.seq} short />
                    </div>
                    <div className={styles.rdPairs}>
                      <PairRow as="div" row={{ billingDate: row.prevBillingDate, dueDate: row.prevDueDate, tone: "old" }} />
                      <span className={styles.rdArrow}><ArrowDown size={14} aria-hidden="true" /><span className="sr-only">เปลี่ยนเป็น</span></span>
                      <PairRow
                        as="div"
                        row={{ billingDate: row.billingDate, dueDate: row.dueDate, billText: noBilling ? NO_BILLING_TEXT : "", tone: "new" }}
                        source={row.source && row.dueDate ? sourceLabel(row.source, { creditDays }) : ""}
                      />
                    </div>
                    {why ? <p className={styles.runWhy} role="status"><Lock size={13} aria-hidden="true" /><span>{why} — เอาออกจากที่เลือกแล้ว</span></p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className={styles.pvEmpty}>
          <CircleCheck size={18} aria-hidden="true" />
          <p><b>ไม่มีงวดที่วันจะเปลี่ยน</b>ทุกงวดที่เปิดอยู่ตรงกับกติกาใหม่แล้ว หรือไม่แตะตามเหตุด้านล่าง</p>
        </div>
      )}
      {kept.length ? (
        <div className={styles.rdKept}>
          <h5><Lock size={13} aria-hidden="true" />ไม่แตะ {kept.length} งวด</h5>
          <ul>
            {kept.map((item) => (
              <li key={item.id}>
                <SoRef id={item.salesOrderId} code={item.salesOrderCode} seq={item.seq} />
                <span>{keptTextOf(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {same.length ? (
        <div className={styles.rdKept}>
          <h5><CircleCheck size={13} aria-hidden="true" />วันเท่าเดิม {same.length} งวด</h5>
          <ul>
            {same.map((item) => (
              <li key={item.id}>
                <SoRef id={item.salesOrderId} code={item.salesOrderCode} seq={item.seq} />
                <span>{billingCellText(item, after)} → {dueCellText(item, after)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hiddenOrders ? (
        <p className={styles.rdNote}><EyeOff size={13} aria-hidden="true" /><span>ลูกค้านี้มีอีก {hiddenOrders} ใบที่คุณมองไม่เห็น — ไม่ได้ตรวจงวดของใบเหล่านั้น</span></p>
      ) : null}
    </Modal>
  );
}

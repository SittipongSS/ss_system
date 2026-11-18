"use client";
// ── การ์ด "สรุปใบนี้" ของพัฒนากลิ่น / พัฒนาสูตร (ม-165 · มติเจ้าของ 18/11/2026) ──────────────────────────
//
// ⭐ ลำดับตามที่เจ้าของบอก: **SO · จำนวนจาก SO · ยืนยัน · ขอแก้ · ไม่เอา** — หนึ่งรายการต่อหนึ่งบรรทัด
// ⭐ ตัวเลขนำ "ยืนยัน x / y" = ด่านปิดใบตัวเดียวกัน (`devRequestSummary` ← `soReconcile`) — เขียวเมื่อครบเท่านั้น
// ⭐ พัฒนาสูตรไม่มีก้อน SO (ไม่มีใบไหนผูก SO) · ตัวเลขนำไม่มีตัวหาร
// ⚠️ ที่นี่วาดอย่างเดียว — ตัวเลข/รายการทั้งหมดมาจาก `lib/requests/devSummary.js` (กฎหลังบั๊กรางซ้ำ #1033)
// ⚠️ แถวศูนย์ของสามกอง (ยืนยัน/ขอแก้/ไม่เอา) **จางแต่ไม่หาย** — ตำแหน่งคงที่ให้กวาดตาข้ามใบได้ (กติกาเดิมของการ์ดสรุป)
import Link from "next/link";
import { Pencil, X } from "lucide-react";
import { DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import { devRequestSummary } from "@/lib/requests/devSummary";
import styles from "./devSummary.module.css";

const n = (v) => fmtNumber(v);

function Line({ name, code, end = null, tag = null, muted = false }) {
  return (
    <li className={`${styles.line} ${muted ? styles.muted : ""}`.trim()} title={code || undefined}>
      <span className={styles.lineName}>
        {name}
        {tag ? <span className={styles.tag}>{tag}</span> : null}
      </span>
      {end ? <span className={styles.lineEnd}>{end}</span> : null}
    </li>
  );
}

function Group({ icon: Icon, label, count, children }) {
  return (
    <section className={`${styles.group} ${count ? "" : styles.zero}`.trim()}>
      <div className={styles.groupHead}>
        <span>{Icon ? <Icon size={14} aria-hidden="true" /> : null}{label}</span>
        <b>{n(count)}</b>
      </div>
      {children}
    </section>
  );
}

/* ⚠️ `today` มาจากเปลือก (จับใน effect) — อ่านนาฬิกาตอนเรนเดอร์ = hydration mismatch + คนละวันกับตาราง
   (registry.test.mjs) · ยังไม่มีค่า (เรนเดอร์แรก) = ไม่โชว์ "ส่งไป n วัน" */
export default function DevSummaryCard({ request, kind, today = null }) {
  const s = devRequestSummary(request, kind, { today });
  if (!s) return null;
  const { confirmed, revise, rejected } = s;
  const leadClass = confirmed.tone === "success" ? styles.leadSuccess
    : confirmed.tone === "warning" ? styles.leadWarning : "";

  return (
    <DocumentSummaryCard title="สรุปใบนี้">
      {s.orders.length ? (
        <section className={styles.orders} aria-label="ใบสั่งขายที่ใบนี้นับ">
          <div className={styles.sectionLabel}>ใบสั่งขาย</div>
          <ul className={styles.list}>
            {s.orders.map((o) => (
              <li key={`${o.role}:${o.id}`} className={styles.line}>
                <span className={styles.lineName}>
                  <Link href={`/sa/sales-orders/${encodeURIComponent(o.id)}`} prefetch={false} className={styles.orderLink}>
                    {o.orderNumber}
                  </Link>
                  <span className={styles.role}>
                    {o.role === "main" ? " · หลัก" : ` · แนบ${o.attachedAt ? ` ${fmtDate(o.attachedAt)}` : ""}`}
                  </span>
                </span>
                <span className={styles.lineEnd}>
                  {naText([o.slots ? `${n(o.slots)} ${s.unit}` : null, o.revisions ? `รอบแก้ ${n(o.revisions)}` : null]
                    .filter(Boolean).join(" · "))}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.paidLine}>
            <span>รวมที่ลูกค้าจ่าย</span>
            <b>{n(s.paid)} {s.unit}</b>
          </div>
        </section>
      ) : null}

      <section className={`${styles.lead} ${leadClass}`.trim()}>
        <div className={styles.leadTop}>
          <span className={styles.leadNumber}>
            {confirmed.total != null ? `${n(confirmed.count)} / ${n(confirmed.total)}` : n(confirmed.count)}
          </span>
          <span className={styles.leadCaption}>
            {confirmed.total != null
              ? ["ยืนยันแล้ว", confirmed.note].filter(Boolean).join(" · ")
              : `${s.unit}ที่ลูกค้ายืนยัน`}
          </span>
        </div>
        {confirmed.rows.length ? (
          <ul className={styles.list}>
            {confirmed.rows.map((r) => (
              <Line key={r.id} name={r.name} code={r.code} end={r.stageText} tag={r.freebie ? "แถม" : null} />
            ))}
          </ul>
        ) : null}
      </section>

      <Group icon={Pencil} label="ขอแก้" count={revise.count}>
        {revise.rows.length ? (
          <ul className={styles.list}>
            {revise.rows.map((r) => (
              <Line
                key={r.id}
                name={r.children.length ? `${r.name} → ${r.children.map((c) => c.short).join(" · ")}` : r.name}
                code={r.code}
                end={r.children.length ? null : "ยังไม่มีรอบแก้"}
              />
            ))}
          </ul>
        ) : null}
        {/* ⭐ ตัวนับรอบแก้โชว์เสมอเมื่อมีรอบแก้หรือซื้อรอบแก้ (ม-164 มติ 3) · สูตรไม่มี SO ⇒ ไม่มี "ซื้อ" */}
        {revise.used || revise.paid ? (
          <p className={styles.note}>
            {revise.paid != null ? `รอบแก้ ใช้ ${n(revise.used)} · ซื้อ ${n(revise.paid)}` : `รอบแก้ ${n(revise.used)}`}
          </p>
        ) : null}
      </Group>

      <Group icon={X} label="ไม่เอา" count={rejected.count}>
        {rejected.rows.length ? (
          <ul className={styles.list}>
            {rejected.rows.map((r) => (
              <Line key={r.id} name={r.name} code={r.code} tag={r.fromRevision ? "รอบแก้" : null} muted />
            ))}
          </ul>
        ) : null}
      </Group>

      <div className={styles.footer}>
        <Group label="รอลูกค้าตอบ" count={s.waitingCustomer.length}>
          {s.waitingCustomer.length ? (
            <ul className={styles.list}>
              {s.waitingCustomer.map((r) => (
                <Line key={r.id} name={r.name} code={r.code} end={r.sentDays != null ? `ส่งไป ${n(r.sentDays)} วัน` : null} />
              ))}
            </ul>
          ) : null}
        </Group>
        {s.working.length ? (
          <Group label="กำลังทำ" count={s.working.length}>
            <ul className={styles.list}>
              {s.working.map((r) => (
                <Line key={r.id} name={r.name} code={r.code} end={r.stageText} tag={r.brief ? "บรีฟ" : null} />
              ))}
            </ul>
          </Group>
        ) : null}
      </div>
    </DocumentSummaryCard>
  );
}

"use client";
import { TableScroll } from "@/components/ui/Table";
// คำร้องข้ามฝ่าย (mig 0173) — คำร้องของฉัน / คิวของฝ่ายตน
//
// เซลเปิดเคสถามราคาไป PC (บรรจุภัณฑ์) หรือ RD (หัวน้ำหอม/เนื้อสาร)
// RD/PC เห็นคิวงานที่รอตอบที่เดียว — ของเดิมไม่มีคิวเลย ต้องรอให้เซลตามเอง
//
// เป็น "แท็บหนึ่ง" ของหน้า /sa/requests (คิวของฝ่ายตน / คำร้องของฉัน) — หน้าแม่
// เป็นเจ้าของข้อมูลและตัวนับบนแท็บ พาเนลนี้เลือกแสดงตาม scope ที่ส่งมา
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import QueueCountStrip from "./QueueCountStrip";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDate } from "@/lib/format";
import styles from "./requestForm.module.css";
import { requestProgress } from "@/lib/deptRequests";
import {
  QUEUE_COUNT_META, groupQueueRows, matchesQueueCount, queueCounts,
  requestDueText, requestNextStep,
} from "@/lib/requests/queueBoard";
import { businessDate } from "@/lib/businessDate";
// ⚠️ ชื่อฝ่ายอ่านจากทะเบียน ไม่ใช่พิมพ์รหัส "RD" ลงข้อความ — จอเดียวกันเคยพูด
// ทั้ง "ฝ่ายวิจัยและพัฒนา" (หัวหน้า) และ "ฝ่าย RD" (ข้อความว่าง) ในหน้าเดียว
import { REQUEST_DEPT_LABELS, requestKindLabel } from "@/lib/master/requestTypes";

export default function RequestQueuePanel({
  scope = "mine", dept = null, rows = [],
  // 🐞 **เคยรับทะเบียน 9 ชุด (materials · products · projects · deals · salesOrders ·
  // scents · formulas · productTypes · mentionPeople) แล้วไม่ได้ใช้สักตัว** — ตกค้าง
  // จากตอนที่ฟอร์มเปิดคำร้องยังเป็นโมดัลอยู่ในพาเนลนี้ · หน้าแม่จึงยิง 8 endpoint
  // ทุกครั้งที่เปิดคิว เพื่อส่งของที่ไม่มีใครอ่านต่อ ⇒ ถอดทั้งชุด
  // ⚠️ `reload` ยังรับไว้ — ผู้เรียกใช้หลังกดสร้าง/แก้เพื่อดึงใหม่ · ที่ถอดคือ
  // **ปุ่มรีเฟรชบนจอ** ซึ่งทั้งระบบไม่มีที่อื่น และหน้าที่ต้องกดเองแปลว่าข้อมูลไม่สด
  // โดยปริยาย ⇒ ผู้ใช้จะกดทุกครั้งเพราะไม่กล้าเชื่อสิ่งที่เห็น
  loading = false, loadError = "", reload, newRequestDefaults = null,
  // ⭐ ภาพรวมฝ่ายมีแถบตัวเลขของตัวเองอยู่ข้างบน (นับ **ทั้งฝ่าย** ไม่ใช่แค่แถวที่โชว์
  // อยู่ในตารางนี้) ⇒ ปิดของในพาเนลไม่ให้ซ้ำสองแถบที่นับคนละชุดแต่ป้ายเหมือนกันเป๊ะ
  showCounts = true,
  // ⚠️ ข้อความตอนว่างต้องพูดถึง **ชุดแถวที่ผู้เรียกส่งมา** — ภาพรวมฝ่ายส่งเฉพาะใบที่
  // ใกล้ถึงกำหนด 7 วัน ⇒ "ไม่มีคำร้องรอฝ่าย … ตอบ" ที่เป็นค่าตั้งต้นจะโกหก
  emptyText = null,
  // ⭐ คิวของฝ่าย (`/rd/requests`) เป็นที่ **ตอบ** ไม่ใช่ที่เปิดคำร้อง — ปุ่มเปิดอยู่ฝั่ง
  // ผู้ขอที่ `/requests` ที่เดียว · โผล่สองที่แล้วต้องมี `returnTo` สองชุดที่ต้องดูแล
  showNewRequest = true,
}) {
  // ⭐ prefill ส่งผ่าน query — หน้าเต็มรับได้ตรง ๆ ต่างจากโมดัลที่ต้องส่ง props
  // ผ่านทุกจุดที่เปิดมัน · `returnTo` พากลับมาที่คิวหลังกดยกเลิก
  const newRequestQuery = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(newRequestDefaults || {})) if (v) q.set(k, v);
    q.set("returnTo", "/requests");
    return `?${q.toString()}`;
  })();
  const router = useRouter();
  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า toISOString() ยังให้เมื่อวาน แล้ว
  // "เลยกำหนด" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  const counts = queueCounts(rows, { todayIso: today });

  // ⭐ **ตัวเลขบนแถบกดกรองได้** — "เลยกำหนด 2" คือคำถามแรกที่หัวหน้าเปิดคิวมาถาม
  // แต่เดิมตอบได้แค่ว่ามีกี่ใบ ไม่ได้บอกว่าใบไหน ⇒ ต้องไล่กวาดตาทั้งตารางเอง
  // ⚠️ กรองที่จอได้ **เพราะชุดข้อมูลนี้ผ่านด่านขอบเขตของ API มาแล้ว** — ต่างจาก
  // ตัวสลับขอบเขตบนหน้าแม่ที่ต้องกรองฝั่ง server (กับดักข้อ 9 ของแผน)
  const [countFilter, setCountFilter] = useState(null);
  const visibleRows = useMemo(
    () => (countFilter
      ? rows.filter((r) => matchesQueueCount(r, countFilter, { todayIso: today }))
      : rows),
    [rows, countFilter, today],
  );
  const groups = groupQueueRows(visibleRows, { todayIso: today });

  // ⭐ ตาราง 8 คอลัมน์บนจอตั้งเลื่อนซ้ายขวาอย่างเดียว — สลับเป็นการ์ดเหมือนอีก 9 หน้า
  // ของระบบ · `useResponsiveView` เก็บ override ของผู้ใช้ไว้จนกว่าจะพลิกจอ
  const [view, setView] = useResponsiveView({ portrait: "list", landscape: "table" });

  // ── เปิดคำร้อง = สามสเต็ปในปุ่มเดียว ─────────────────────────────────────
  //
  // ⭐ ปุ่มเดียว "ส่งคำร้อง" ไม่ใช่ "สร้างร่าง" แล้วให้ไปกดส่งอีกหน้า (มติ 2026-08-03
  // ให้ทำงานคล้ายเธรด — ไม่มีใครร่างโพสต์ในเธรดไว้แล้วกลับมากดส่งทีหลัง) · ที่สำคัญ
  // กว่านั้น: ไฟล์แนบกับ @mention จะแขวนอยู่บนร่างที่ไม่มีใครเห็น ถ้าหยุดแค่ร่าง
  //
  // กลไกร่างยังอยู่ข้างใน เพราะสองอย่างต้องมี id ของคำร้องก่อน:
  //   1 POST     → ได้ร่าง + id (ยังไม่กินเลขที่)
  //   2 upload   → ไฟล์แนบเกาะ id นั้น
  //   3 PATCH ส่ง → ออกเลขที่ + ลงเธรดคำร้อง/เธรดดีล + ยิงแจ้งเตือนคนที่ถูก @
  // ⚠️ ล้มกลางทางแล้ว **ไม่ rollback ร่างทิ้ง** — ของที่พิมพ์มายังอยู่ พาไปหน้า
  // รายละเอียดให้กดส่งเองได้ ดีกว่าลบแล้วให้พิมพ์ใหม่ทั้งใบ
  return (
    <>
      {showNewRequest && (
      <div className="toolbar">
        <span className="spacer" />
        {/* ปุ่มเพิ่มขวาสุดของแถวหัวการ์ด ตาม page-header standard */}
        {/* ⚠️ **เปลือกเดียว** — ฟอร์มย้ายไป /requests/new ทั้งก้อน · ครอบ RequestForm
            ไว้สองที่จะได้แถบปุ่มกับข้อความ blocker สองชุดที่ต้องดูแลให้ตรงกัน
            (โรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้)
            หน้าเต็มคือเงื่อนไขของการแนบไฟล์ตอนเปิดคำร้อง ซึ่งโมดัลทำไม่ได้ */}
        <button
          type="button" className="btn btn-accent"
          onClick={() => router.push(`/requests/new${newRequestQuery}`)}
        >
          <Plus size={14} /> เปิดคำร้อง
        </button>
      </div>
      )}

      {/* ⭐ แถบตัวเลข 4 ตัว — ตัวที่ 4 "รอฝ่ายขายทำต่อ" คือของใหม่ทั้งหมดของหน้านี้
          วันนี้คิวนับทุกใบที่ยัง open เป็นงานค้างของฝ่าย ทั้งที่ครึ่งหนึ่งรอผู้ขอไปรับของ/
          ส่งลูกค้าอยู่ ⇒ ตัวเลขสูงกว่าความจริงตลอดเวลา และไม่มีใครเชื่อมันอีกเลย
          แยกออกมาแล้วตัวเลขที่เหลือถึงจะเป็นงานของฝ่ายจริง ๆ

          🐞 **เคยอยู่ข้างในสาขา "มีแถว"** ⇒ ลิสต์ว่างแล้วแถบหายทั้งแถว · **0 ก็เป็น
          ข้อมูล** — "ยังไม่รับเรื่อง 0 · เลยกำหนด 0" บอกว่างานไม่ค้าง ซึ่งเป็นสิ่งที่
          หัวหน้าเปิดมาดูเพื่อจะรู้ · ซ่อนตอนว่างทำให้แยกไม่ออกระหว่าง "ไม่มีงานค้าง"
          กับ "หน้ายังโหลดไม่เสร็จ" (ผู้ใช้เจอเองบนจอ)

          ⭐ **หน้าตาเดียวกับภาพรวมฝ่าย** (มติผู้ใช้ 2026-08-08) — เดิมที่นี่เป็นป้ายเล็ก
          (คลาส chip ของกลาง) ส่วน `/rd` เป็น `MetricStrip` กล่องใหญ่ ทั้งที่ตัวเลขชุดเดียวกัน
          และห่างกันคลิกเดียว ⇒ ย้ายมาใช้ `QueueCountStrip` ตัวเดียวกันทั้งสองหน้า */}
      {!loading && !loadError && (
        <>
          {showCounts && (
            <QueueCountStrip
              counts={counts}
              filter activeKey={countFilter}
              ariaLabel="ตัวเลขสรุปคิวคำร้อง — กดเพื่อกรอง"
              // กดตัวเดิมซ้ำ = ล้างตัวกรอง — ไม่ต้องไปหาปุ่ม "ล้าง" ที่อื่น
              onSelect={(key, on) => setCountFilter(on ? null : key)}
            />
          )}
          {/* ⚠️ ตัวสลับมุมมองอยู่นอกเงื่อนไขของแถบตัวเลข — หน้าที่ปิดแถบ (ภาพรวมฝ่าย
              ซึ่งมีแถบของตัวเองอยู่ข้างบนแล้ว) ยังต้องสลับตาราง/การ์ดบนจอแคบได้ */}
          <div className={styles.counts}>
            {countFilter && (
              /* 🪤 `.spacer` ดันขวาได้เฉพาะใน `.toolbar` (globals: `.toolbar > .spacer`)
                 — แถวนี้ไม่ใช่ toolbar ⇒ เคยใส่ไว้แล้วไม่มีผล · ดันด้วย margin ที่นี่แทน */
              <span className={`toolbar-label ${styles.filterNote}`}>
                แสดงเฉพาะ &quot;{QUEUE_COUNT_META.find((m) => m.key === countFilter)?.label}&quot;
                {" · "}
                <button type="button" className={styles.clearFilter} onClick={() => setCountFilter(null)}>
                  ล้างตัวกรอง
                </button>
              </span>
            )}
            <ViewSwitcher value={view} onChange={setView} modes={["table", "list"]} ariaLabel="มุมมองคิวคำร้อง" />
          </div>
        </>
      )}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className={`glass-panel ${styles.loadError}`}>{loadError}</div>
      ) : visibleRows.length === 0 ? (
        <EmptyState icon={ClipboardList}>
          {/* ⚠️ ว่างเพราะ "ไม่มีงาน" กับว่างเพราะ "ตัวกรองตัดหมด" ต้องอ่านคนละแบบ —
              ไม่งั้นคนจะปิดหน้าไปทั้งที่งานยังอยู่ แค่ถูกกรองอยู่ */}
          {countFilter
            ? `ไม่มีคำร้องที่ "${QUEUE_COUNT_META.find((m) => m.key === countFilter)?.label}" — กดตัวเลขซ้ำเพื่อดูทั้งหมด`
            : emptyText
              || (scope === "queue"
                ? `ไม่มีคำร้องรอ${REQUEST_DEPT_LABELS[dept] ? `ฝ่าย${REQUEST_DEPT_LABELS[dept].name}` : "ฝ่ายคุณ"}ตอบ`
                : "ยังไม่มีคำร้องของคุณ — กด \"เปิดคำร้อง\" เพื่อเริ่ม")}
        </EmptyState>
      ) : view === "list" ? (
        /* ── มุมมองการ์ด — จอตั้ง/จอแคบ ────────────────────────────────────
           ⚠️ **ข้อมูลชุดเดียวกับตาราง จัดกลุ่มด้วย groupQueueRows ตัวเดียวกัน** —
           การ์ดที่เลือกฟิลด์เองจะเพี้ยนจากตารางทันทีที่มีคนเพิ่มคอลัมน์
           ⚠️ ไม่มีแถบสีขอบการ์ด — ความเร่งด่วนบอกด้วยป้ายข้อความเหมือนในตาราง */
        <div className={styles.queueCards}>
          {groups.map((g) => (
            <Fragment key={g.group}>
              <div className={styles.cardGroupLabel}>{g.label} · {g.rows.length}</div>
              {g.rows.map((ask) => {
                const p = requestProgress(ask.items || []);
                const next = requestNextStep(ask);
                const due = requestDueText(ask, { todayIso: today });
                return (
                  <button
                    key={ask.id} type="button" className={styles.queueCard}
                    onClick={() => router.push(`/requests/${ask.id}`)}
                  >
                    {/* ⭐ ก้าวถัดไปขึ้นก่อน — เหมือนคอลัมน์แรกของตาราง · การ์ดกับตาราง
                        ต้องตอบคำถามเดียวกันด้วยลำดับเดียวกัน ไม่งั้นคนที่สลับมุมมอง
                        ต้องเรียนรู้สองแบบ */}
                    <span className={styles.cardTop}>
                      {next
                        ? (
                          <span className={`ui-badge ${styles.nextStep}`} data-owner={next.owner}>
                            {next.label}
                          </span>
                        )
                        : <span className={styles.muted}>จบแล้ว</span>}
                      {ask.urgent && <span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span>}
                    </span>
                    <span className={styles.cardTitle}>
                      {ask.title || ask.customerName || "ราคากลาง"}
                    </span>
                    <span className={styles.subText}>
                      {[
                        ask.docNo || "ร่าง",
                        requestKindLabel(ask.kind),
                        ask.title && ask.customerName ? ask.customerName : null,
                        ask.formulaCode ? `สูตร ${ask.formulaCode}` : null,
                      ].filter(Boolean).join(" · ")}
                      {` → ${ask.dept}`}
                    </span>
                    <span className={styles.cardMeta}>
                      {due && (
                        <span className={`ui-badge ${due.overdue ? styles.overdue : ""}`.trim()}>
                          กำหนด {fmtDate(due.date)}{due.note ? ` · ${due.note}` : ""}
                        </span>
                      )}
                      {p.total > 0 && (
                        <span className="ui-badge">{p.done} / {p.total} รายการ</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      ) : (
        <TableScroll cells="stacked">
          {/* ⭐ **4 คอลัมน์ ไม่ใช่ 8** (มติผู้ใช้ 2026-08-08) — ของเดิมวางทุกอย่างเป็น
              คอลัมน์ที่มีน้ำหนักเท่ากันหมด ⇒ ตาไม่รู้จะเริ่มที่ไหน และ "ก้าวถัดไป"
              ซึ่งเป็นเหตุผลที่คนเปิดคิว อยู่คอลัมน์ที่ 5 จาก 8
              ⇒ ยุบของที่คนอ่านเป็นก้อนเดียวกันอยู่แล้วเข้าเซลล์เดียวสองบรรทัด
              (เลขที่ + ชนิด + เรื่อง/ลูกค้า + ถึงฝ่าย = "ใบนี้คือใบอะไร") */}
          <table className="premium-table">
            <thead>
              <tr>
                {/* ⭐ คอลัมน์แรกคือคำตอบของคำถามแรก — "ฉันต้องทำอะไร"
                    มาจาก requestNextStep ตัวเดียวกับที่แถบตัวเลขใช้ ⇒ ตัวเลขข้างบน
                    กับคอลัมน์นี้ขัดกันไม่ได้เชิงโครงสร้าง
                    ⚠️ ลำดับหัวตารางต้องตรงกับลำดับ <td> ข้างล่างเป๊ะ ๆ — เคยสลับกัน
                    อยู่สองคอลัมน์ ("ความคืบหน้า" ลอยอยู่เหนือป้ายก้าวถัดไป) */}
                <th className={styles.colNext}>ต้องทำอะไร</th>
                <th>คำร้อง</th>
                {/* ⚠️ หัวชิดขวาตามเนื้อข้างล่าง (กฎ 4 · UI_DESIGN_SYSTEM.md) — หัวชิดซ้าย
                    แต่เนื้อชิดขวา = สองเส้นที่ไม่ตรงกันในคอลัมน์เดียว */}
                <th className={`${styles.colDue} num`}>กำหนดส่ง</th>
                <th className={`${styles.colProgress} num`}>คืบหน้า</th>
              </tr>
            </thead>
            <tbody>
              {/* ⭐ แถวคั่นกลุ่ม — ทำให้ลำดับที่ compareRequestUrgency จัดไว้
                  **มองเห็นได้** · เรียงถูกแล้วแต่คนอ่านไม่รู้ว่าเส้นแบ่งอยู่ตรงไหน
                  ⚠️ จัดกลุ่มจริงที่ groupQueueRows ไม่ใช่แทรกเส้นตอนคีย์เปลี่ยน
                  (ตัวเรียงไม่ได้เรียงตามลำดับกลุ่มเป๊ะ ๆ จะได้หัวข้อซ้ำกลางตาราง) */}
              {groups.map((g) => (
                <Fragment key={g.group}>
                  <tr className={styles.groupRow}>
                    <td colSpan={4}>{g.label} · {g.rows.length}</td>
                  </tr>
                  {g.rows.map((ask) => {
                const p = requestProgress(ask.items || []);
                const next = requestNextStep(ask);
                const due = requestDueText(ask, { todayIso: today });
                return (
                  <tr
                    key={ask.id} className={styles.rowLink}
                    onClick={() => router.push(`/requests/${ask.id}`)}
                  >
                    {/* ⚠️ สองโทน: ตาฝ่าย / รออีกฝั่ง — **สีสงวนให้เจ้าของก้าว**
                        ไม่ใช่ให้ชนิดคำร้อง (ชนิดอยู่บรรทัดรองของคอลัมน์ถัดไป)
                        ⭐ `ui-badge-cell` ทำให้ป้ายทุกแถวกว้างเท่ากัน ⇒ ขอบเรียงเป็น
                        เส้นตรงลงมา ตากวาดคอลัมน์ได้เป็นแนว (กฎ 1 · UI_DESIGN_SYSTEM.md) */}
                    <td>
                      {next
                        ? (
                          <span
                            className={`ui-badge ui-badge-cell ui-badge-w-nextstep ${styles.nextStep}`}
                            data-owner={next.owner}
                          >
                            {next.label}
                          </span>
                        )
                        : <span className={styles.muted}>—</span>}
                    </td>
                    {/* ⭐ "ใบนี้คือใบอะไร" — เรื่องเป็นตัวหลัก · เลขที่/ชนิด/ลูกค้า/ฝ่าย
                        เป็นบรรทัดรอง · สี่อย่างนี้คนอ่านเป็นก้อนเดียวอยู่แล้ว
                        ⚠️ ชนิดที่ไม่มีบรรทัดสื่อความด้วยหัวเรื่อง — ชนิดขอราคาสื่อด้วยลูกค้า */}
                    <td>
                      <div className={styles.docCell}>
                        {ask.title || ask.customerName
                          || <span className={styles.muted}>ราคากลาง</span>}
                        {ask.urgent && (
                          <span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span>
                        )}
                      </div>
                      <div className={styles.subText}>
                        {[
                          ask.docNo || "ร่าง",
                          requestKindLabel(ask.kind),
                          ask.title && ask.customerName ? ask.customerName : null,
                          ask.formulaCode ? `สูตร ${ask.formulaCode}` : null,
                        ].filter(Boolean).join(" · ")}
                        {` → ${ask.dept}`}
                      </div>
                    </td>
                    {/* ⭐ กำหนดส่งเคยต้องเข้าใบถึงจะเห็น ทั้งที่ "เลยกำหนดไหม" คือ
                        คำถามที่สองของหัวหน้า · `.num` ให้ชิดขวา + tabular-nums
                        ⇒ หลักวันตรงกันทุกแถว เทียบข้ามแถวได้ (กฎ 3) */}
                    <td className="num">
                      {due
                        ? (
                          <>
                            <div className={due.overdue ? styles.overdue : undefined}>
                              {fmtDate(due.date)}
                            </div>
                            {due.note && (
                              <div className={`${styles.subText} ${due.overdue ? styles.overdue : ""}`.trim()}>
                                {due.note}
                              </div>
                            )}
                          </>
                        )
                        : <span className={styles.muted}>—</span>}
                    </td>
                    <td className="num">
                      {p.total > 0
                        ? (
                          <>
                            <div>{p.done} / {p.total}</div>
                            <div className={styles.subText}>รายการ</div>
                          </>
                        )
                        : <span className={styles.muted}>—</span>}
                    </td>
                  </tr>
                );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

    </>
  );
}

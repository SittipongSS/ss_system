"use client";
// ── ก้าวถัดไปของทุกแถว — วางท้ายเธรด (P3a · ม-36 ก) ──────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-07**: *"มันจะเป็นตามขั้นตอน และตอบโต้ได้หากมีอะไรเพิ่มเติม …
// หรือหากสงสัย จะมีระบบถามตอบ เธรด **แต่สถานะก็รวมในเธรดด้วย**"*
//
// ⇒ เธรดเป็นแกนของหน้า และ **ปุ่มของก้าวถัดไปอยู่ท้ายเธรด** เหมือนกล่องพิมพ์ —
// คนอ่านไล่เรื่องจากบนลงล่างแล้วเจอ "แล้วต้องทำอะไรต่อ" ตรงที่สายตาหยุดพอดี
//
// ⚠️ **เลิกใช้รางแนวตั้งรายแถว** (`RowStageRail`) — รางเป็นแหล่งความจริงที่สอง
// สำหรับ "ผ่านอะไรมาแล้ว" ซึ่งเธรดเล่าอยู่แล้ว · สองที่เมื่อไรก็เพี้ยนกันเมื่อนั้น
//
// ⚠️ ขั้น/เจ้าของก้าว อ่านจาก `rowStage.js` + `hops.js` ที่เดียว — ตัวเดียวกับที่คิว
// ใช้ ⇒ ปุ่มที่นี่กับคอลัมน์ "ก้าวถัดไป" บนคิวขัดกันไม่ได้เชิงโครงสร้าง
import Button from "@/components/ui/Button";
import { ROW_STAGE_LABELS, rowStage } from "@/lib/requests/rowStage";
import { HOP_OWNER, ROW_OUTCOMES, hopLabel, hopLabelFor } from "@/lib/requests/hops";
import { isDocLineKind } from "@/lib/requests/docTypes";
import styles from "./NextStepBar.module.css";

// ขั้นของแถว → ก้าวที่เดินได้จากขั้นนั้น
//
// ⚠️ `awaiting_price` ไม่ได้อยู่ใน `ROW_HOPS` — ใส่ราคาเป็น endpoint ของตัวเอง
// (`/items/[itemId]/price`) ไม่ใช่ hop · แต่บนจอมันคือ "ก้าวถัดไป" เหมือนกัน
const HOP_AT_STAGE = {
  awaiting_ack: "ack",
  developing: "ready",
  ready: "pickup",
  picked_up: "send",
  sent: "outcome",
  awaiting_price: "price",
};

// ⭐ สายเอกสารสั้นกว่า (ม-85) — จบที่ผู้ขอกด "ได้รับแล้ว" · ไม่มีส่งลูกค้า/ราคา
// 🐞 เดิมใช้ตารางบนกับทุกแถว ⇒ แถวเอกสารถูกพาเดินถึง "ใส่ราคา" แล้วตอบ 400
// ค้างที่ "รอใส่ราคา" ถาวร ปิดใบไม่ได้
// ⚠️ picked_up/sent = แถวเก่าที่เคยหลงเดินสายพัฒนา — ให้จบทาง receive ได้เหมือนกัน
const HOP_AT_STAGE_DOC = {
  awaiting_ack: "ack",
  developing: "ready",
  ready: "receive",
  picked_up: "receive",
  sent: "receive",
};

const hopAtStage = (row, stage) => (isDocLineKind(row?.lineKind)
  ? HOP_AT_STAGE_DOC[stage]
  : HOP_AT_STAGE[stage]);

const OWNER_OF = { ...HOP_OWNER, price: "dept" };

// คอนเฟิร์มเป็นทางหลัก · อีกสองทางเป็นเส้นขอบ — เห็นครบแต่ไม่แย่งน้ำหนักกัน
const OUTCOME_BUTTON = {
  confirmed: { tone: "primary", variant: "filled" },
  revise: { tone: undefined, variant: "outline" },
  rejected: { tone: "danger", variant: "outline" },
};

/* ⚠️ **ป้ายพูดชื่อฝ่ายจริงเมื่อผู้เรียกส่งมาให้** (มติผู้ใช้ 2026-08-20) — คำว่า
   "ฝ่ายปลายทาง"/"ฝ่ายขาย" เป็นคำถอยของผู้เรียกที่ไม่มีใบอยู่ในมือเท่านั้น
   (ฝั่งผู้ขอไม่ใช่ฝ่ายขายเสมอไป — RD เปิดใบขอเอกสารจาก FN ก็มี) */
const waitingText = (owner, { deptLabel, requesterLabel }) => (owner === "dept"
  ? `รอ ${deptLabel || "ฝ่ายปลายทาง"}`
  : `รอ ${requesterLabel || "ผู้ขอ"}`);

/* ── ชิปบอกว่าก้าวนี้เป็นของใคร (มติผู้ใช้ 2026-08-26) ─────────────────────
   🐞 **ปุ่มที่กดได้ไม่เคยบอกว่าเป็นของใคร** — ป้าย "รอ RD" ขึ้นเฉพาะตอนก้าวนั้น
   *ไม่ใช่* ของคนที่กำลังดู ⇒ คนที่มีสิทธิ์ทั้งสองฝั่ง (แอดมิน · คนที่ตอบแทนฝ่าย)
   เห็นปุ่มสดทุกแถวโดยไม่มีอะไรบอกว่าแถวไหนควรเป็นงานของ RD แถวไหนของ SA ·
   และคนที่เพิ่งเข้าระบบอ่านปุ่มจางได้แค่ว่า "ไม่ใช่ของฉัน" ไม่ได้ว่า "เป็นของใคร"

   ⚠️ **ขึ้นเฉพาะตอนปุ่มกดได้** — กิ่ง `!isMine` เขียน "รอ RD" อยู่แล้ว ติดชิปซ้ำ
   คือข้อเท็จจริงเดียวกันสองที่ในบรรทัดเดียว
   ⚠️ **ใช้ชื่อฝ่ายจริงจาก props ชุดเดียวกับ `waitingText`** ไม่ใช่คิดเอง — ฝั่งผู้ขอ
   ไม่ใช่ SA เสมอไป (RD เปิดใบขอเอกสารจาก FN ก็มี) */
export const ownerTag = (owner, { deptLabel, requesterLabel } = {}) => (owner === "dept"
  ? (deptLabel || "ฝ่าย")
  : (requesterLabel || "ผู้ขอ"));

// ── ปุ่ม/ป้ายก้าวถัดไปของ "แถวเดียว" — ก้อนกลางที่สองที่วางใช้ร่วมกัน ──────
//
// ⭐ แยกออกมาเพื่อให้ **ตารางเอกสาร** วางปุ่มติดแถวได้ (มติผู้ใช้ 2026-08-09:
// "ก้าวถัดไปก็อยากในรายการเอกสารเลย") โดยไม่โคลนกติกา hop/เจ้าของ/ปฏิเสธ —
// สองที่ประกอบเองเมื่อไรก็เพี้ยนกันเมื่อนั้น (โรคเดิมของฟอร์มสร้าง/แก้)
// คืน null = แถวจบแล้ว ไม่มีก้าวให้เดิน
/* ⚠️ **ปุ่มลงมือทุกตัวในตารางเดียวกันต้องติดชิปเหมือนกัน** — ปุ่มระดับก้อน (ส่งงาน
   รายบรีฟ) ไม่ได้ผ่าน `RowStepActions` ⇒ ต้องใช้ชิปตัวเดียวกันนี้ ไม่งั้นตารางเดียว
   มีปุ่มติดชิปกับไม่ติดชิปปนกัน ซึ่งอ่านเหมือนชิปมีความหมายพิเศษ */
export function OwnerTag({ owner = "dept", deptLabel = null, requesterLabel = null }) {
  return <span className={styles.owner}>{ownerTag(owner, { deptLabel, requesterLabel })}</span>;
}

export function RowStepActions({
  row, canDept = false, canRequester = false, busy = false, onHop, onPrice,
  deptLabel = null, requesterLabel = null,
  /* ⭐ **ใบต้องถูกรับเรื่องก่อน** (มติผู้ใช้ 2026-08-20: *"ปุ่มรับเรื่องมันเป็นระดับใบ
     ไม่ใช่ระดับรายการ"*) — ของเดิมทุกแถวมีปุ่ม "รับเรื่อง" ของตัวเอง แล้วแถวแรกที่กด
     ดันสถานะทั้งใบให้เอง ⇒ มีสองทางที่ทำสิ่งเดียวกัน
     ⚠️ บอกว่ารออะไร ไม่ใช่ปล่อยช่องว่าง — ด่านจริงอยู่ที่ API ตัวเดียวกัน */
  requestPending = false,
}) {
  const stage = rowStage(row);
  if (requestPending) return <span className={styles.waiting}>รอรับเรื่องที่ใบก่อน</span>;
  const hop = hopAtStage(row, stage);
  if (!hop) return null;
  const owner = OWNER_OF[hop];
  const isMine = owner === "dept" ? canDept : canRequester;
  /* ⭐ **ดึงกลับ — ก้าวถอยก้าวเดียวของระบบ** (มติผู้ใช้ 2026-08-20: *"คำร้องขอเอกสาร
     FN RD อยากให้สามารถดึงกลับ หรือลบได้ เผื่อแนบผิด"*)
     🐞 ที่มา: ฝ่ายแนบไฟล์ผิดแล้วกดส่ง แถวเด้งไปขั้น "รอไปรับ" ซึ่งเป็นตาของผู้ขอ ⇒
     ฝ่ายไม่มีปุ่มอะไรเหลือเลย (การ์ดไฟล์ก็อ่านอย่างเดียวตาม ม-90) · ทางเดียวคือรอให้
     ผู้ขอกดรับของผิด แล้วค่อยเปิดใบใหม่
     ⚠️ **โผล่คู่กับป้าย "รออีกฝั่ง" ไม่ใช่แทนที่** — ตายังเป็นของผู้ขอเหมือนเดิม
     ปุ่มนี้เป็นทางถอยของฝ่าย ไม่ใช่ก้าวถัดไปของงาน ⇒ วางเป็นเส้นขอบ ไม่ใช่ปุ่มหลัก */
  const canUnready = canDept && stage === "ready" && isDocLineKind(row.lineKind);
  if (!isMine) {
    return (
      <div className={styles.actions}>
        <span className={styles.waiting}>{waitingText(owner, { deptLabel, requesterLabel })}</span>
        {canUnready && (
          <Button
            tone="warning" variant="outline" disabled={busy}
            onClick={() => onHop?.(row, "unready")}
          >
            {hopLabel("unready")}
          </Button>
        )}
      </div>
    );
  }
  const tag = <OwnerTag owner={owner} deptLabel={deptLabel} requesterLabel={requesterLabel} />;
  if (hop === "outcome") {
    return (
      <div className={styles.actions}>
        {tag}
        {ROW_OUTCOMES.map((outcome) => (
          <Button
            key={outcome} disabled={busy}
            tone={OUTCOME_BUTTON[outcome].tone}
            variant={OUTCOME_BUTTON[outcome].variant}
            onClick={() => onHop?.(row, "outcome", outcome)}
          >
            {hopLabel("outcome", outcome)}
          </Button>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.actions}>
      {tag}
      <Button
        tone="primary" disabled={busy}
        onClick={() => (hop === "price" ? onPrice?.(row) : onHop?.(row, hop))}
      >
        {hop === "price" ? "ใส่ราคา" : hopLabelFor(row, hop)}
      </Button>
      {/* สายเอกสารมีทางจบที่สองของฝ่าย: "ปฏิเสธ" + เหตุผลบังคับ (ม-85 · ม-89) */}
      {hop === "ready" && isDocLineKind(row.lineKind) && (
        <Button
          tone="danger" variant="outline" disabled={busy}
          onClick={() => onHop?.(row, "refuse")}
        >
          {hopLabelFor(row, "refuse")}
        </Button>
      )}
      {/* คนที่เป็นทั้งฝ่ายและผู้ขอในใบเดียวกัน (admin ตอบแทน) เห็นก้าวของผู้ขอเป็น
          ปุ่มจริง ⇒ ทางถอยของฝ่ายต้องมาด้วย ไม่งั้นหายไปเฉพาะกับสิทธิ์นี้ */}
      {canUnready && hop !== "unready" && (
        <Button
          tone="warning" variant="outline" disabled={busy}
          onClick={() => onHop?.(row, "unready")}
        >
          {hopLabel("unready")}
        </Button>
      )}
    </div>
  );
}

export default function NextStepBar({
  rows = [], canDept = false, canRequester = false, busy = false,
  onHop, onPrice,
  // ⭐ **ก้าวของ "ใบ" สำหรับหัวข้อที่ไม่มีแถว** (P6 · สอบถามข้อมูล) — หัวข้อพวกนี้
  // ทั้งหน้าคือเธรด · ปุ่มอยู่บนหัวใบอย่างเดียวแปลว่าคนอ่านเธรดจนจบแล้วต้องเงยหน้า
  // กลับขึ้นไปหาปุ่ม ⇒ ขัดกับ ม-49 ที่ให้เธรดเป็นแกน
  //
  // ⚠️ **รับ object เดียวกับที่หัวใบใช้** ไม่ประกอบเอง — สองที่ประกอบเองเมื่อไรก็
  // เพี้ยนกันเมื่อนั้น · หน้าแม่เป็นคนตัดสินว่าจะโชว์ที่ไหน (ดู `primaryAction`)
}) {
  const pending = rows
    .map((row) => ({ row, stage: rowStage(row) }))
    .map(({ row, stage }) => ({ row, stage, hop: hopAtStage(row, stage) }))
    .filter((r) => r.hop);

  // ⚠️ **ก้าวระดับใบไม่อยู่ที่นี่แล้ว** — อยู่บนการ์ดจัดการ (`DocumentControlCard`)
  // ที่เดียวทุกหัวข้อ (ม-122) · แถบนี้เหลือหน้าที่เดียว: ก้าว **รายแถว**
  if (!pending.length) return null;

  return (
    <div className={styles.bar}>
      <div className="toolbar-label">ก้าวถัดไป</div>
      {pending.map(({ row, stage }) => (
        <div key={row.id} className={styles.row}>
          <div className={styles.label}>
            <strong>{row.label}</strong>
            <span className={styles.stage}>{ROW_STAGE_LABELS[stage]}</span>
          </div>
          {/* ⚠️ ปุ่ม/ป้าย "รอใคร" มาจาก RowStepActions ก้อนเดียว — ฝั่งที่ไม่ใช่
              ตาตัวเองเห็นป้ายว่ารอใคร ไม่ใช่ปุ่มจาง ๆ (กับดักที่แผนบันทึกไว้) */}
          <RowStepActions
            row={row} canDept={canDept} canRequester={canRequester}
            busy={busy} onHop={onHop} onPrice={onPrice}
          />
        </div>
      ))}
    </div>
  );
}

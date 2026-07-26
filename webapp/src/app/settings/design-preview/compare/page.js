"use client";

/* หน้าเทียบ "ของจริงวันนี้" กับ "ค่าจากต้นแบบ Balanced Warm Workspace" ทีละข้อ

   ผู้ใช้ขอดูทีละข้อก่อนตัดสิน (2026-07-26) — แต่ละข้อจึงเปลี่ยนโทเคน *เฉพาะเรื่องนั้น*
   ฝั่งขวา (ครอบด้วยคลาส .candidate-* จาก globals.css) ตัวแปรอื่นคงเดิมทั้งหมด
   จะได้เห็นผลของตัวแปรทีละตัวจริง ๆ ไม่ใช่เห็นสองธีมทั้งชุดแล้วเดาว่าอะไรทำให้ต่าง

   ⚠️ หน้านี้และคลาส .candidate-* เป็นของชั่วคราว — ตัดสินครบแล้วให้ย้ายค่าที่เลือกขึ้น
   :root แล้วลบทั้งหน้านี้และบล็อก candidate ใน globals.css ทิ้ง */

import { useEffect, useRef, useState } from "react";
import { Columns2, Plus } from "lucide-react";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import styles from "./page.module.css";

/* อ่านค่าโทเคนจาก CSS จริงตอนรันแทนการพิมพ์ค่าซ้ำในหน้านี้ — ป้ายค่าจะตรงกับ
   globals.css เสมอ ถ้ามีคนแก้โทเคนแล้วลืมแก้หน้านี้ก็ไม่มีทางเพี้ยน
   (และหน้านี้ก็ไม่ต้องมีค่าสีดิบอยู่ในไฟล์ ซึ่ง audit:ui ห้ามไว้อยู่แล้ว) */
function TokenValues({ names }) {
  const ref = useRef(null);
  const [values, setValues] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const computed = getComputedStyle(ref.current);
    setValues(names.map((name) => `${name}: ${computed.getPropertyValue(name).trim() || "—"}`));
  }, [names]);

  return <p ref={ref} className={styles.values}>{values ? values.join("\n") : names.join("\n")}</p>;
}

const ROWS = [
  { code: "QT-26070128", customer: "บริษัท สหมิตร โปรดักส์ จำกัด", amount: "485,000.00", tone: "warning", status: "รออนุมัติ" },
  { code: "QT-26070096", customer: "Bright Living Co., Ltd.", amount: "920,000.00", tone: "success", status: "อนุมัติแล้ว" },
  { code: "QT-26070087", customer: "Maison Life Co., Ltd.", amount: "780,000.00", tone: "neutral", status: "ฉบับร่าง" },
];

function Item({ n, title, note, tokens, nowNote, protoNote, candidateClass, sample, protoSample }) {
  return (
    <WorkspaceSection title={`${n} · ${title}`} subtitle={note}>
      <div className={styles.pair}>
        <div className={styles.side}>
          <div className={styles.sideHead}>
            <span>ของจริงวันนี้</span>
            <span className={styles.sideTag}>คงไว้</span>
          </div>
          {sample}
          {tokens ? <TokenValues names={tokens} /> : <p className={styles.values}>{nowNote}</p>}
        </div>
        <div className={`${styles.side} ${candidateClass || ""}`.trim()}>
          <div className={styles.sideHead}>
            <span>ต้นแบบ</span>
            <span className={styles.sideTag}>เปลี่ยนตามนี้</span>
          </div>
          {protoSample ?? sample}
          {tokens ? <TokenValues names={tokens} /> : <p className={styles.values}>{protoNote}</p>}
        </div>
      </div>
    </WorkspaceSection>
  );
}

function DemoTable({ proto = false }) {
  return (
    <div className={styles.tableWrap}>
      <TableScroll className={proto ? styles.protoTable : ""}>
        <table>
          <thead>
            <tr><th>เลขที่</th><th>ลูกค้า</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.code}>
                <td>{row.code}</td>
                <td>{row.customer}</td>
                <td><StatusBadge tone={row.tone} label={row.status} dot /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function SummaryCard({ bar = false }) {
  return (
    <div className={`${styles.summaryCard} ${bar ? styles.withBar : ""}`.trim()}>
      <div className={styles.summaryBody}>
        <small>ยอดสุทธิใบเสนอราคา</small>
        <div className={styles.summaryTotal}>฿485,000.00</div>
      </div>
    </div>
  );
}

function ScaleColumn({ title, rows }) {
  return (
    <div className={styles.side}>
      <div className={styles.sideHead}><span>{title}</span></div>
      {rows.map((row) => (
        <div key={row.name} className={styles.scaleRow}>
          <span className={styles.scaleName}>{row.name}</span>
          <span className={styles[row.cls]}>{row.sample}</span>
          <span className={styles.scaleSize}>{row.size}</span>
        </div>
      ))}
    </div>
  );
}

const SCALE_ROWS = (sizes) => [
  { name: "หัวเรื่องหน้า", cls: sizes.h1, sample: "ภาพรวมฝ่ายขาย", size: sizes.h1Label },
  { name: "หัวข้อส่วน", cls: sizes.h2, sample: "ยอดขายเทียบเป้าหมาย", size: sizes.h2Label },
  { name: "ตัวเลข KPI", cls: sizes.kpi, sample: "฿4.82M", size: sizes.kpiLabel },
  { name: "เนื้อความ", cls: sizes.body, sample: "ติดตามยอดขายและงานที่ต้องทำ", size: sizes.bodyLabel },
  { name: "ช่องข้อมูลตาราง", cls: sizes.td, sample: "บริษัท สหมิตร โปรดักส์ จำกัด", size: sizes.tdLabel },
  { name: "หัวตาราง", cls: sizes.th, sample: "กำหนดปิด", size: sizes.thLabel },
  { name: "ข้อความรอง", cls: sizes.small, sample: "3 รายการใกล้เลยกำหนด", size: sizes.smallLabel },
  { name: "ป้ายสถานะ", cls: sizes.badge, sample: "รออนุมัติ", size: sizes.badgeLabel },
];

export default function DesignComparePage() {
  return (
    <Workspace
      icon={<Columns2 size={22} />}
      title="เทียบต้นแบบทีละข้อ"
      subtitle="ค่าจริงวันนี้ vs ต้นแบบ Balanced Warm Workspace — ตอบกลับเป็นหมายเลขว่าข้อไหนเอาแบบต้นแบบ"
      back={{ href: "/settings/design-preview", label: "กลับหน้าต้นแบบ" }}
    >
      <div className={styles.stack}>
        <StatusNotice tone="info" title="วิธีอ่านหน้านี้">
          <p className={styles.intro}>
            แต่ละข้อเปลี่ยน<strong>เฉพาะเรื่องนั้นเรื่องเดียว</strong> ตัวแปรอื่นคงเดิมทั้งหมด
            ดูเทียบได้ทั้งโหมดสว่างและมืด (สลับที่แถบบน) แล้วบอกมาว่าข้อไหน &quot;เอาแบบต้นแบบ&quot;
            ข้อที่ไม่พูดถึงคือคงของเดิมไว้
          </p>
        </StatusNotice>

        <Item
          n={1}
          title="สีแบรนด์ (--accent)"
          note="สีของปุ่มหลัก แท็บที่เลือก และเส้นกราฟ"
          candidateClass="candidate-accent"
          tokens={["--accent", "--accent-soft"]}
          sample={
            <>
              <div className={styles.sampleRow}>
                <Button tone="accent" icon={<Plus size={14} />}>สร้างใบเสนอราคา</Button>
                <StatusBadge tone="accent" label="ฉบับใหม่" dot />
              </div>
              <div className={styles.card}>พื้นเน้นอ่อนใช้กับแถวที่เลือกและป้ายสีแบรนด์</div>
            </>
          }
        />

        <Item
          n={2}
          title="ระดับสีตัวอักษร"
          note="ข้อความรองของต้นแบบอ่อนกว่าของเราชัดเจน — จุดนี้กระทบการอ่านทั้งระบบ"
          candidateClass="candidate-ink"
          tokens={["--text", "--text-2", "--text-3"]}
          sample={
            <div className={styles.inkSample}>
              <p className="lead">ใบเสนอราคา QT-26070128</p>
              <p className="second">บริษัท สหมิตร โปรดักส์ จำกัด · ยืนราคาถึง 25/08/2569</p>
              <p className="third">แก้ไขล่าสุดเมื่อ 2 ชั่วโมงที่แล้ว โดย Admin S.</p>
            </div>
          }
        />

        <Item
          n={3}
          title="สีสถานะ"
          note="ต้นแบบใช้สีหม่นลงทั้งชุด (เขียว/เหลือง/แดง/น้ำเงิน/ม่วง)"
          candidateClass="candidate-status"
          tokens={["--green", "--amber", "--red", "--blue"]}
          sample={
            <div className={styles.sampleRow}>
              <StatusBadge tone="success" label="อนุมัติแล้ว" dot />
              <StatusBadge tone="warning" label="รออนุมัติ" dot />
              <StatusBadge tone="danger" label="เกินกำหนด" dot />
              <StatusBadge tone="info" label="พัฒนาตัวอย่าง" dot />
            </div>
          }
        />

        <Item
          n={4}
          title="พื้นผิวและเส้นขอบ"
          note="ต้นแบบทำพื้นรองเป็นสีทึบ ไม่ใช่สีโปร่ง"
          candidateClass="candidate-surface"
          tokens={["--panel", "--panel-2", "--border"]}
          sample={
            <>
              <div className={styles.card}>พื้นรอง — หัวตารางและแถบเครื่องมือ</div>
              <div className={styles.floatCard}>การ์ดลอย — ใช้พื้นหลักและเงา</div>
            </>
          }
        />

        <Item
          n={5}
          title="ความสูงตัวควบคุมและความมน"
          note="ปุ่ม/ช่องกรอกสูงขึ้น 2px และการ์ดมนขึ้น 1px"
          candidateClass="candidate-shape"
          tokens={["--ctl-h", "--radius-lg"]}
          sample={
            <>
              <div className={styles.sampleRow}>
                <input className={styles.control} defaultValue="ค้นหาใบเสนอราคา" aria-label="ตัวอย่างช่องค้นหา" />
                <Button>ตัวกรอง</Button>
              </div>
              <div className={styles.card}>มุมการ์ดใช้ --radius-lg</div>
            </>
          }
        />

        <Item
          n={6}
          title="เงา"
          note="เงาของต้นแบบหนากว่าและฟุ้งกว่าของเรามาก"
          candidateClass="candidate-shadow"
          tokens={["--shadow-sm", "--shadow-md"]}
          sample={<div className={styles.floatCard}>การ์ดที่ลอยเหนือพื้นหน้า</div>}
        />

        <Item
          n={7}
          title="จังหวะแถวตาราง"
          note="ต้นแบบตรึงหัวตาราง 42px แถว 52px และ hover เป็นสีแบรนด์จาง (ของเราเป็นสีพื้นรอง)"
          nowNote={"หัว/แถวสูงตามเนื้อหา (padding 10px)\nhover: --panel-2"}
          protoNote={"หัว 42px · แถว 52px คงที่\nhover: accent-soft 25%"}
          sample={<DemoTable />}
          protoSample={<DemoTable proto />}
        />

        <Item
          n={8}
          title="แถบไล่สีบนการ์ดสรุป"
          note="ต้นแบบเติมแถบ 4px ไล่จากสีแบรนด์ไป navy บนหัวการ์ดฝั่งขวา"
          nowNote="ไม่มีแถบ"
          protoNote="แถบ 4px: accent → navy"
          sample={<SummaryCard />}
          protoSample={<SummaryCard bar />}
        />

        <Item
          n={9}
          title="ปุ่มแบ่งหน้า"
          note="ของเราเป็นลูกศรหน้า/หลัง + ข้อความ ต้นแบบเป็นปุ่มเลขหน้า"
          nowNote="‹ หน้า 1 / 4 ›"
          protoNote="‹ 1 2 3 4 ›  (กดข้ามหน้าได้)"
          sample={
            <div className={styles.pagerRow}>
              <button type="button" className={styles.pageButton}>‹</button>
              <span>หน้า 1 / 4</span>
              <button type="button" className={styles.pageButton}>›</button>
            </div>
          }
          protoSample={
            <div className={styles.pagerRow}>
              <button type="button" className={styles.pageButton}>‹</button>
              <button type="button" className={`${styles.pageButton} ${styles.active}`}>1</button>
              <button type="button" className={styles.pageButton}>2</button>
              <button type="button" className={styles.pageButton}>3</button>
              <button type="button" className={styles.pageButton}>4</button>
              <button type="button" className={styles.pageButton}>›</button>
            </div>
          }
        />

        <WorkspaceSection
          title="10 · ชั้นขนาดตัวอักษร"
          subtitle="ต้นแบบตั้งไว้เล็กมากสำหรับภาษาไทย (หัวตาราง 9.5px) — คอลัมน์ขวาคือชุดที่ผมเสนอ"
        >
          <div className={styles.scaleGrid}>
            <ScaleColumn
              title="ต้นแบบ"
              rows={SCALE_ROWS({
                h1: "size24", h1Label: "24",
                h2: "size15", h2Label: "15",
                kpi: "size27", kpiLabel: "27",
                body: "size14", bodyLabel: "14",
                td: "tiny11", tdLabel: "11",
                th: "tiny95", thLabel: "9.5",
                small: "tiny105", smallLabel: "10.5",
                badge: "tiny95", badgeLabel: "9.5",
              })}
            />
            <ScaleColumn
              title="ของจริงวันนี้"
              rows={SCALE_ROWS({
                h1: "size24", h1Label: "24",
                h2: "size15", h2Label: "15",
                kpi: "size28", kpiLabel: "28",
                body: "size14", bodyLabel: "14",
                td: "size13", tdLabel: "13",
                th: "size12", thLabel: "12",
                small: "size12", smallLabel: "12",
                badge: "size12", badgeLabel: "12",
              })}
            />
            <ScaleColumn
              title="ที่ผมเสนอ"
              rows={SCALE_ROWS({
                h1: "size24", h1Label: "24",
                h2: "size16", h2Label: "16",
                kpi: "size28", kpiLabel: "28",
                body: "size14", bodyLabel: "14",
                td: "size13", tdLabel: "13",
                th: "size12", thLabel: "12",
                small: "size12", smallLabel: "12",
                badge: "tiny11", badgeLabel: "11",
              })}
            />
          </div>
          <p className={styles.intro}>
            ที่เสนอ = คงตัวอักษรอ่านง่ายไว้เท่าเดิม ขยับแค่สองจุด: หัวข้อส่วน 15 → 16px
            ให้ห่างจากเนื้อความชัดขึ้น และป้ายสถานะ 12 → 11px ให้เล็กกว่าข้อมูลจริงในแถว
            <strong> ข้อสำคัญกว่าตัวเลขคือตอนนี้ขนาดพวกนี้กระจายอยู่ในโค้ดหลายร้อยจุด</strong> —
            ขั้นถัดไปคือยกเป็นโทเคนชุดเดียวแล้วไล่แทน ไม่ใช่ตั้งตัวเลขใหม่แล้วปล่อยกระจายเหมือนเดิม
          </p>
        </WorkspaceSection>
      </div>
    </Workspace>
  );
}

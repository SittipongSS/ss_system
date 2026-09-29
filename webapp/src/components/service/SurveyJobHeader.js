"use client";
// ── หัวงานของจอหน้างาน (แผน §10.5 จอหน้างานแบบ A · §4 · ม็อก A-1 · AT-1 · AT-3 · AW-1 · AW-2 · ชุด S9) ─────────────
//
// ⭐ แทนหัวใบ 470px ของจอเดิม (pain B1) — ของที่ช่างต้องใช้ก่อนเดินเข้าตึก: ไซต์ "รหัส · ชื่อ" + ที่อยู่บรรทัดเดียว ·
//   โทร/นำทาง (ปุ่ม 44px — ถือมือถือมือเดียว) · นัด · ทีม · ช่วงที่ไซต์ให้เข้า (เตือนอำพันก่อนเริ่มงาน) · ของที่ฝากมา
// 🔑 **วาดอย่างเดียว** — คำทุกคำมาจาก `surveyJobHeaderView` (ชิ้นที่อ่านไม่สำเร็จเขียน "ไม่ทราบ" · ตัวเองเป็น "คุณ")
// ⭐ **ที่อยู่บรรทัดเดียวทุกจอ** (มติเจ้าของข้อ 4) · ปุ่มกางขึ้น **เฉพาะตอนที่อยู่ถูกตัดจริง** (วัดด้วย ResizeObserver) —
//   ปุ่มที่กดแล้วไม่มีอะไรกางเพิ่มคือปุ่มที่โกหก · ไม่มี ResizeObserver = มีปุ่มเสมอ (อ่านที่อยู่เต็มได้แน่ ๆ ดีกว่าเดา)
// ⭐ **สองทรง ข้อมูลชุดเดียวกัน** (`layout` — JS ตัดสินจากเส้น 1000 ตัวเดียวกับสองบาน · ไม่มีอะไรหายตามขนาดจอ):
//   "card" (<1000) การ์ดบนหน้า ข้อเท็จจริงคอลัมน์เดียว ≤680 สองคอลัมน์ 681–999 · "band" (≥1000) แถบบางเหนือสองบาน
//   ไซต์ + ปุ่มแถวบน ข้อเท็จจริงเรียงแถวล่าง (ทรงของ AT-3 — ดูเหตุที่ไม่ใช่แถวเดียวแบบ AW-1 ใน §10.5 S9)
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Navigation, Phone } from "lucide-react";
import Button from "@/components/ui/Button";
import styles from "./SurveyJobHeader.module.css";

/* ค่าของข้อเท็จจริงหนึ่งช่อง — ทีม (วงอักษรย่อ · "คุณ" · ผู้ช่วย) · นัด (+ เวลาจริง) · ให้เข้า (+ คำเตือน) · ที่เหลือเป็นข้อความ */
function FactValue({ fact }) {
  if (fact.key === "crew" && fact.people?.length) {
    return (
      <dd className={styles.team}>
        {/* ⚠️ จุดคั่นติดท้ายคนก่อนหน้า ไม่ใช่หัวคนถัดไป — จอ 360 ห่อชื่อลงบรรทัดใหม่แล้วบรรทัดต้องไม่ขึ้นต้นด้วย "·" */}
        {fact.people.map((person, index) => (
          <span key={person.id} className={styles.person}>
            {person.initials ? <span className={styles.avatar} aria-hidden="true">{person.initials}</span> : null}
            <span className={person.you ? styles.you : undefined}>{person.text}</span>
            {person.helper ? <span className={styles.muted}>(ผู้ช่วย)</span> : null}
            {index < fact.people.length - 1 ? <span className={styles.sep} aria-hidden="true">·</span> : null}
          </span>
        ))}
      </dd>
    );
  }
  return (
    <dd>
      {fact.value}
      {/* เวลาจริงไม่หักกลางช่วง ("10:12–" / "11:46") — ทั้งก้อนลงบรรทัดใหม่แทน
          ⚠️ จุดคั่นติดท้ายค่าก่อนหน้าด้วย NBSP (กติกาเดียวกับแถวทีม) — 🐞 UAT 25/09 จอ 390: บรรทัดที่สองขึ้นต้นด้วย "· เข้าแล้ว …" */}
      {fact.sub ? <>{"\u00a0· "}<span className={styles.stamp}>{fact.sub}</span></> : null}
      {/* ⚠️ คำเตือนช่วงเข้าไซต์เป็นประโยคเต็ม ("นัด 10:00 อยู่นอกช่วงนี้ — โทรเช็กคุณแหวนก่อน") — ไม่พึ่งสีอย่างเดียว */}
      {fact.warn ? (
        <span className={styles.warn}>
          <AlertTriangle size={13} aria-hidden="true" />
          {fact.warn}
        </span>
      ) : null}
    </dd>
  );
}

/**
 * @param view   `surveyJobHeaderView(...)` — `{ site, call, nav, facts }`
 * @param layout "card" (<1000) | "band" (≥1000)
 */
export default function SurveyJobHeader({ view, layout = "card" }) {
  const addressId = useId();
  const addressRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const address = view?.site?.address || null;

  /* ⭐ ถูกตัดจริงไหม = วัดตอนพับอยู่เท่านั้น (กางแล้ววัดได้ "ไม่ถูกตัด" เสมอ ⇒ ปุ่มหุบหายไปใต้นิ้ว)
     ⚠️ ความกว้างเปลี่ยนเมื่อ: หมุนจอ · ข้ามเส้น 1000 (ทรงเปลี่ยน) · ฟอนต์ไทยโหลดเสร็จ (ตัวอักษรกว้างขึ้นแต่กล่องเท่าเดิม
        ⇒ ResizeObserver ไม่ยิง ต้องวัดซ้ำหลัง `document.fonts.ready`) */
  useEffect(() => {
    const node = addressRef.current;
    if (!node || open) return undefined;
    let live = true;
    const measure = () => { if (live) setClipped(node.scrollWidth - node.clientWidth > 1); };
    if (typeof ResizeObserver !== "function") {
      setClipped(true);
      return () => { live = false; };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    document.fonts?.ready?.then(measure, () => {});
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [open, address, layout]);

  if (!view) return null;
  const { site, call, nav, facts } = view;
  const showToggle = !!address && (clipped || open);

  return (
    <section className={styles.job} data-layout={layout} aria-label="ไซต์และนัด">
      <div className={styles.top}>
        <div className={styles.site}>
          {/* ทะเบียนไซต์ (หัวใบเดิมลิงก์ไว้) — ลิงก์ออกนอกใบ ⇒ ตัวเฝ้าค่าค้างถามก่อนทิ้งเหมือนลิงก์อื่นของแอป */}
          <p className={styles.siteTitle}>
            {site.href ? <Link className={styles.siteLink} href={site.href}>{site.title}</Link> : site.title}
          </p>
          {address ? (
            <p id={addressId} ref={addressRef} className={styles.address} data-open={open ? "" : undefined}>
              {address}
            </p>
          ) : null}
        </div>
        {showToggle ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={addressId}
            aria-label={open ? "ย่อที่อยู่ไซต์" : "ดูที่อยู่ไซต์เต็ม"}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        ) : null}
        {/* ⭐ ปุ่มจริงสองปุ่ม ไม่ใช่ลิงก์ในบรรทัด — เบอร์คือของชิ้นเดียวที่ช่างต้องกดทันทีเมื่อหาทางเข้าตึกไม่เจอ
            · นำทางเปิดแท็บใหม่ (แอปแผนที่) ⇒ ใบนี้ยังอยู่ที่เดิมพร้อมค่าที่พิมพ์ค้าง · ไม่มีเบอร์/ลิงก์แผนที่ = ไม่มีปุ่ม */}
        {call || nav ? (
          <div className={styles.acts}>
            {call ? (
              /* ป้ายตัดท้ายได้ (ชื่อผู้ติดต่อยาว) — ชื่อเต็มอยู่ใน title · 🐞 review 26/09 จอ 360: ป้ายล้นทับปุ่มนำทาง */
              <Button as="a" href={call.href} className={styles.act} title={call.label} icon={<Phone size={16} aria-hidden="true" />}>
                <span className={styles.actLabel}>{call.label}</span>
              </Button>
            ) : null}
            {nav ? (
              <Button
                as="a" href={nav.href} target="_blank" rel="noopener noreferrer" className={styles.act}
                icon={<Navigation size={16} aria-hidden="true" />}
              >
                {nav.label}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <dl className={styles.facts}>
        {facts.map((fact) => (
          <div key={fact.key} className={styles.fact} data-key={fact.key}>
            <dt>{fact.label}</dt>
            <FactValue fact={fact} />
          </div>
        ))}
      </dl>
    </section>
  );
}

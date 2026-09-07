"use client";
// ── จัดคนเข้าทีมขาย / ย้ายทีม — โมดัลตัวเดียวสองทางเรียก ────────────────────
//
// ⭐ **กฎข้อแรกของ repo**: ปุ่ม "แก้ไข" ต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง — ที่นี่คือ
//   "จัดเข้าทีมครั้งแรก" (จากถังยังไม่อยู่ทีมไหน บนหน้าทะเบียน) กับ "ย้ายทีม"
//   (จากแถวคนบนหน้าทีม) ซึ่งเป็นคำถามชุดเดียวกันเป๊ะ
//
// 🐞 **บั๊กที่ทำให้ต้องยกออกมา** (พบตอนตรวจย้อน 2026-09-07): ตอนรื้อหน้าทะเบียน
//   ปุ่ม "จัดเข้าทีม" ในถัง "ยังไม่อยู่ทีมไหน" หายไป ⇒ ตั้งแต่หน้าผู้ใช้ถอดช่องทีมออก
//   (บัญชีขายเกิดมาไม่มีทีมเสมอ) **ไม่มีทางไหนในระบบเลย**ที่จะให้ทีมแรกกับเขาได้ —
//   และโมดัลหลังสร้างบัญชีก็พามาหน้านี้พร้อมคำสัญญาว่าจัดต่อได้ที่นี่
//
// ⚠️ ทีมขายเท่านั้น — ทีมปฏิบัติงานจัดทั้งทีมทีเดียวที่หน้าทีม (คนละท่าโดยเจตนา
//    เพราะสมาชิกเก็บคนละที่ · docs/team-management-plan.md §2)
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/Modal";
import OptionTiles from "@/components/ui/OptionTiles";
import StatusNotice from "@/components/ui/StatusNotice";
import { ROLE_LABELS } from "@/lib/permissions";
import { naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";
import styles from "./TeamManager.module.css";

export default function TeamAssignModal({ person, teams, saving, onClose, onSave }) {
  const [picked, setPicked] = useState([]);
  const [primary, setPrimary] = useState("");
  const [impact, setImpact] = useState([]);
  const [impactFailed, setImpactFailed] = useState(false);

  useEffect(() => {
    if (!person) return;
    const current = person.teams?.length ? person.teams : [];
    setPicked(current);
    setPrimary(person.team || current[0] || "");
    setImpact([]);
    setImpactFailed(false);
    /* ⭐ บอกของที่จะค้างอยู่ทีมเดิม **ก่อนกด** — ระบบไม่ย้ายดีล/เป้าให้โดยเจตนา
       ⚠️ ดึงไม่สำเร็จต้อง **บอกว่าไม่รู้** ไม่ใช่เงียบ — จอที่ดึงพลาดจะหน้าตาเหมือน
          "ไม่มีอะไรต้องเตือน" เป๊ะ ซึ่งเป็นคนละเรื่องกัน */
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/users/${person.id}/team/impact`);
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && Array.isArray(body?.effects)) setImpact(body.effects);
        else setImpactFailed(true);
      } catch { if (alive) setImpactFailed(true); }
    })();
    return () => { alive = false; };
  }, [person]);

  if (!person) return null;
  const first = !(person.teams || []).length;

  return (
    <Modal
      open
      onClose={onClose}
      title={first ? `จัดเข้าทีม — ${person.name}` : `ย้ายทีมของ ${person.name}`}
      subtitle={`${ROLE_LABELS[person.role] || person.role} · ตอนนี้อยู่ ${naText((person.teams || []).join(" · "))}`}
      size="md"
      footer={(
        <>
          <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" disabled={saving || !picked.length}
            onClick={() => onSave({ teams: picked, team: primary || picked[0] })}>
            {first ? "จัดเข้าทีม" : "ย้ายทีม"}
          </Button>
        </>
      )}
    >
      <div className={styles.field}>
        <span>ทีมที่สังกัด * <small>— เห็นข้อมูลของทุกทีมที่ติ๊ก</small></span>
        <OptionTiles
          multiple
          ariaLabel="ทีมที่สังกัด"
          value={picked}
          onChange={(next) => {
            setPicked(next);
            if (!next.includes(primary)) setPrimary(next[0] || "");
          }}
          options={teams.map((t) => ({ value: t.code, label: t.name, description: t.code }))}
        />
      </div>

      {/* ⭐ ทีมหลักถามเฉพาะตอนที่มันมีคำตอบให้เลือกจริง — ทีมเดียวก็คือทีมหลักอยู่แล้ว
          🐞 ของเดิมส่ง `teams[0]` ตามลำดับที่วาด ⇒ ยอดกับดีลใหม่ไปขึ้นทีมที่ไม่มีใครเลือก */}
      {picked.length > 1 && (
        <div className={styles.field}>
          <span>ทีมหลัก * <small>— ดีลและยอดใหม่จะขึ้นทีมนี้</small></span>
          <OptionTiles
            ariaLabel="ทีมหลัก"
            value={primary}
            onChange={setPrimary}
            options={teams.filter((t) => picked.includes(t.code))
              .map((t) => ({ value: t.code, label: t.name, description: t.code }))}
          />
        </div>
      )}

      {impact.length > 0 && (
        <StatusNotice tone="warning" title="ของที่ค้างอยู่จะไม่ย้ายตามให้">
          <ul className={styles.impact}>
            {impact.map((row) => <li key={row.key}>{row.text}</li>)}
          </ul>
        </StatusNotice>
      )}
      {impactFailed && (
        <StatusNotice tone="warning">
          ดูรายการที่ค้างอยู่ไม่ได้ตอนนี้ — ทำต่อได้ตามปกติ แต่ให้ไปไล่ดีล/เป้าที่ค้างเองหลังจากนี้
        </StatusNotice>
      )}
    </Modal>
  );
}

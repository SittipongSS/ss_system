"use client";
// ── ช่องมาตรฐาน มล./เดือนของรอบขาย (PR-C · C-D8/C-D9/C-D10) ────────────────────────────────────
//
// ⭐ ใช้สองที่: รายละเอียดโซนของแถว "รอตั้งรอบ" (งานเข้าใหม่) · แท็บ "งานบริการ" ของใบสั่งขาย
//   props `term` = รูปรายการรอบขายชุดเดียวทั้งระบบ (IMPL_PLAN_C §4.3) — ช่องนี้อ่านแค่
//   `id, packageQty, unit, rounds, periodMonths, standardMlPerMonth` · ผู้เรียกส่งมาตรง ๆ ไม่ต้องแปลง
// ⭐ แก้ได้เฉพาะ TS (`canEditService`) — คนอื่นเห็นค่า "2,000 มล." / "—" (ไม่มีสิทธิ์ = ไม่โชว์ตัวแก้)
// ⭐ **ไม่มีบันทึกเอง** — พิมพ์แล้วต้องกด "บันทึก" (หรือ Enter) · ออกจากช่องไม่เขียน · ปุ่ม "ใช้" แค่เติมร่าง
//   (ระบบไม่เติมมาตรฐานให้เอง — ข้อเสนอผิดที่ถูกกดรับโดยไม่คิดจะกลายเป็นฐานเทียบยอดใช้จริง)
// ⚠️ ทุกอย่างเป็น inline (`span`/`input`/`button`) — ผู้เรียกวางในเซลล์ตารางหรือบรรทัดข้อความได้ (house rule 20)
// ⚠️ ค่าใหม่จากหน้าพ่อ (โหลดใหม่ · อีกแท็บบันทึก) ตามไปเอง แต่ร่างที่พิมพ์ค้างไว้ไม่ถูกทับ
//    ใช้ท่า "ปรับ state ระหว่าง render" (ไม่ใช่ useEffect) — ค่าเก่าไม่แวบขึ้นหนึ่งเฟรม
import { useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import {
  STANDARD_ML_MESSAGES, STANDARD_ML_RANGE_ERROR, standardMlDraft, standardMlSuggestion, standardMlText,
} from "@/lib/service/termStandardMl";
import styles from "./TermStandardMlCell.module.css";

const draftOf = (value) => (value === null || value === undefined || value === "" ? "" : String(Number(value)));

export default function TermStandardMlCell({ term, canEdit, stamped = false, onSaved, ariaLabel }) {
  const incoming = term?.standardMlPerMonth ?? null;
  const termId = term?.id ?? null;
  const [seenId, setSeenId] = useState(termId);
  const [seenValue, setSeenValue] = useState(incoming);
  const [savedValue, setSavedValue] = useState(incoming);
  const [draft, setDraft] = useState(() => draftOf(incoming));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const errorId = useId();

  /* หน้าพ่อส่งค่าใหม่มา — ตามไป · รอบขายเดิมที่มีร่างค้าง = เก็บร่างไว้ (ปุ่มบันทึกยังขึ้น) */
  if (seenId !== termId || seenValue !== incoming) {
    const keepDraft = seenId === termId && standardMlDraft(draft, savedValue).dirty;
    setSeenId(termId);
    setSeenValue(incoming);
    setSavedValue(incoming);
    if (!keepDraft) {
      setDraft(draftOf(incoming));
      setError("");
    }
  }

  const draftState = standardMlDraft(draft, savedValue);
  const suggestion = standardMlSuggestion(term, { stamped });

  const save = async () => {
    if (saving || !term?.id) return;
    // ช่องตัวเลขที่พิมพ์ค้างครึ่งทาง ("1e") ส่งค่าว่างมา — ห้ามอ่านเป็น "ล้าง"
    if (inputRef.current?.validity?.badInput) {
      setError(STANDARD_ML_RANGE_ERROR);
      return;
    }
    if (draftState.error) {
      setError(draftState.error);
      return;
    }
    if (!draftState.dirty) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiJson(`/api/service/terms/${encodeURIComponent(term.id)}`, {
        method: "PATCH",
        json: { standardMlPerMonth: draftState.value },
        fallbackError: "บันทึกมาตรฐานไม่สำเร็จ",
      });
      const next = res?.term?.standardMlPerMonth ?? null;
      setSavedValue(next);
      setDraft(draftOf(next));
      notifyToast.success(STANDARD_ML_MESSAGES.saved);
      onSaved?.({ ...term, ...res.term });
    } catch (e) {
      setError(e?.message || "บันทึกมาตรฐานไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(draftOf(savedValue));
    setError("");
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    setDraft(String(suggestion.value));
    setError("");
  };

  if (!canEdit) {
    return <span className={styles.value}>{standardMlText(savedValue)}</span>;
  }

  const label = ariaLabel || "มาตรฐาน มล./เดือน";
  return (
    <span className={styles.cell}>
      <span className={styles.row}>
        <span className={styles.field}>
          <Input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            autoComplete="off"
            className={styles.input}
            value={draft}
            disabled={saving}
            invalid={Boolean(error)}
            aria-label={label}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              // Enter = กดบันทึก (ตั้งใจ) · กันฟอร์มแม่ถูกส่งไปด้วย
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
          <span className={styles.unit} aria-hidden="true">มล.</span>
        </span>
        {draftState.dirty && (
          <span className={styles.actions}>
            <Button size="sm" tone="primary" onClick={save} disabled={saving} aria-busy={saving || undefined}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>ยกเลิก</Button>
          </span>
        )}
      </span>
      {suggestion && (
        <span className={styles.suggestion}>
          <span className={styles.suggestionText}>{suggestion.label}</span>
          <button
            type="button"
            className={styles.use}
            onClick={applySuggestion}
            disabled={saving}
            aria-label={`ใช้ข้อเสนอ ${suggestion.label}`}
          >
            ใช้
          </button>
        </span>
      )}
      {error && <span id={errorId} role="alert" className={styles.error}>{error}</span>}
    </span>
  );
}

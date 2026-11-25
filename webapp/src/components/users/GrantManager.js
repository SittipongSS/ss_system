"use client";
// ── จัดการสิทธิ์เสริมของผู้ใช้หนึ่งคน (รื้อระบบสิทธิ์งวด 2 · mig 0440 · มติเจ้าของ 25/11/2026) ──────────
//
// ⭐ สองชิ้นที่ใช้คู่กัน:
//   - `GrantSummary` — สรุปอ่านอย่างเดียวท้ายโมดัลแก้ผู้ใช้ + ปุ่ม "จัดการสิทธิ์เสริม" (มติข้อ 4)
//   - `GrantDialog`  — ทางเดียวที่ให้/ถอนสิทธิ์เสริม: เลือกสิทธิ์ · เหตุผล (บังคับ) · หมดอายุ (ต้องเลือก ไม่มีค่าตั้งต้น)
// ⚠️ งวด 3 (แท็บสิทธิ์ในหน้า /users) จะเรียก `GrantDialog` ตัวนี้ซ้ำ — อย่าเขียนฟอร์มให้สิทธิ์ชุดที่สอง
// ⚠️ ตัวตรวจฝั่งจอคือ `validateGrantRequest` ตัวเดียวกับ API — ข้อความ "ยังขาด" จึงตรงกับที่ API จะตีกลับ
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldPlus, ShieldOff } from "lucide-react";
import Modal from "@/components/Modal";
import OptionTiles from "@/components/ui/OptionTiles";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import Button from "@/components/ui/Button";
import { notifyToast } from "@/components/ui/Toast";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiJson } from "@/lib/apiFetch";
import { GRANTABLE_CAPS, can, grantableNow } from "@/lib/permissions";
import { activeCapsFromRows, capLabel, fmtDay, validateGrantRequest } from "@/lib/capabilityGrants";
import useThaiToday from "@/lib/ui/useThaiToday";

/* คำอธิบายสั้นของแต่ละสิทธิ์ — บอก "ได้อะไร" ก่อนกด (กฎฟอร์ม: ผลของการเลือกต้องเห็นก่อนกด) */
const CAP_EFFECT = {
  "ra:view": "เห็นสถานะภาษีบนดีล/ใบสั่งขายทุกทีม · ส่วน RA บนหน้าลูกค้าศูนย์รวม",
  "products:margin": "เห็นวัตถุดิบ/ค่าแรง/ค่าส่ง/กำไรโรงงาน และราคาผลิตบนหน้าสินค้า",
  "mgmt:view": "เมนูงานบริหาร",
  "mgmt:edit": "เพิ่ม/แก้ข้อมูลในงานบริหาร",
  "audit:view": "เมนูบันทึกการใช้งาน (อ่านอย่างเดียว)",
  "users:view": "เมนูผู้ใช้งาน รวมแท็บสิทธิ์ (อ่านอย่างเดียว)",
  "team:manage": "จัดทีมของฝ่ายตัวเองที่หน้าจัดทีม",
};

const expiryText = (g) => (g.expiresOn ? `ถึง ${fmtDay(g.expiresOn)}` : "ไม่มีกำหนด");

export function useUserGrants(userId) {
  const [grants, setGrants] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await apiJson(`/api/users/${userId}/grants`, { fallbackError: "โหลดสิทธิ์เสริมไม่สำเร็จ" });
      setGrants(data.grants || []);
      setError("");
    } catch (e) {
      setError(e.message || "โหลดสิทธิ์เสริมไม่สำเร็จ");
    }
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);
  return { grants, error, reload };
}

/** สรุปท้ายโมดัลแก้ผู้ใช้ — อ่านอย่างเดียว · ปุ่มเปิด GrantDialog (เฉพาะคนแก้ได้) */
export function GrantSummary({ user, canManage, onChanged }) {
  const { grants, error, reload } = useUserGrants(user?.id);
  const [open, setOpen] = useState(false);
  const active = (grants || []).filter((g) => !g.revokedAt);
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p className="text-[length:var(--fs-5)] text-[var(--red)]">{error}</p>
      ) : grants === null ? (
        <p className="text-[length:var(--fs-5)] text-[var(--text-3)]">กำลังโหลด…</p>
      ) : active.length === 0 ? (
        <p className="text-[length:var(--fs-5)] text-[var(--text-3)]">ไม่มีสิทธิ์เสริม — ทำได้ตามตำแหน่งอย่างเดียว</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {active.map((g) => (
            <li key={g.id} className="text-[length:var(--fs-7)]">
              <span className="font-semibold text-[var(--text)]">{capLabel(g.cap)}</span>
              <span className="text-[var(--text-3)]"> · {expiryText(g)} · {g.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div>
          <Button size="sm" tone="neutral" onClick={() => setOpen(true)}>
            <ShieldPlus size={14} aria-hidden="true" />จัดการสิทธิ์เสริม
          </Button>
        </div>
      )}
      {open && (
        <GrantDialog
          user={user}
          grants={grants || []}
          onClose={() => setOpen(false)}
          onChanged={async () => { await reload(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

/** ให้/ถอนสิทธิ์เสริม — ทางเดียว (มติข้อ 2–4) */
export function GrantDialog({ user, grants = [], onClose, onChanged }) {
  // seed: ตัวตรวจต้องรู้วันนี้ตั้งแต่เฟรมแรก (วันหมดอายุห้ามย้อนหลัง) · หน้าต่างเปิดฝั่ง client เสมอ
  const today = useThaiToday({ seed: true });
  const activeRows = grants.filter((g) => !g.revokedAt);
  const activeCaps = activeCapsFromRows(activeRows);
  const [caps, setCaps] = useState([]);
  const [reason, setReason] = useState("");
  const [expiryKind, setExpiryKind] = useState(null); // ⚠️ ไม่มีค่าตั้งต้น — ต้องเลือก (มติข้อ 3)
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => GRANTABLE_CAPS.map((cap) => {
    const why = can(user?.role, cap) ? "ตำแหน่งนี้มีอยู่แล้ว"
      : activeCaps.includes(cap) ? "ถืออยู่แล้ว — ถอนด้านล่างก่อนถ้าจะเปลี่ยน"
      : !grantableNow(cap) ? "ระบบนี้ปิดอยู่ทั้งระบบ — แจกใหม่ไม่ได้"
      : "";
    return { value: cap, label: capLabel(cap), description: why || CAP_EFFECT[cap], disabled: !!why };
  }), [user?.role, activeCaps]);

  const expiry = expiryKind === "none" ? { kind: "none" } : expiryKind === "date" ? { kind: "date", date: expiryDate } : null;
  const check = validateGrantRequest({ caps, reason, expiry }, { role: user?.role, activeCaps, today });

  const save = async () => {
    if (check.errors.length) return;
    setSaving(true);
    try {
      await apiJson(`/api/users/${user.id}/grants`, {
        method: "POST", json: { caps, reason, expiry }, fallbackError: "ให้สิทธิ์เสริมไม่สำเร็จ",
      });
      notifyToast.success(`ให้สิทธิ์เสริมแล้ว ${caps.length} ข้อ`);
      setCaps([]); setReason(""); setExpiryKind(null); setExpiryDate("");
      await onChanged?.();
    } catch (e) {
      notifyToast.error(e.message || "ให้สิทธิ์เสริมไม่สำเร็จ");
    }
    setSaving(false);
  };

  const revoke = async (g) => {
    const ok = await confirmAction({
      title: "ถอนสิทธิ์เสริม",
      message: `ถอน "${capLabel(g.cap)}" ของ ${personOf(user)} — มีผลตอนผู้ใช้โหลดหน้าครั้งถัดไป · ประวัติการให้ยังเก็บไว้`,
      confirmLabel: "ถอนสิทธิ์",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await apiJson(`/api/users/${user.id}/grants/${g.id}`, { method: "DELETE", fallbackError: "ถอนสิทธิ์ไม่สำเร็จ" });
      notifyToast.success(`ถอน "${capLabel(g.cap)}" แล้ว`);
      await onChanged?.();
    } catch (e) {
      notifyToast.error(e.message || "ถอนสิทธิ์ไม่สำเร็จ");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`สิทธิ์เสริม: ${personOf(user)}`}
      subtitle="สิทธิ์เพิ่มจากตำแหน่ง มีผลข้ามทุกทีม · ใช้เมื่อจำเป็นเท่านั้น"
      size="md"
      footer={(
        <>
          {/* ปุ่มที่กดไม่ได้ต้องบอกเหตุ (กฎฟอร์ม) — ข้อความเดียวกับที่ API จะตีกลับ */}
          {check.errors.length > 0 && (caps.length > 0 || reason || expiryKind) && (
            <span className="mr-auto text-[length:var(--fs-5)] text-[var(--amber)]">ยังขาด: {check.errors.join(" · ")}</span>
          )}
          <Button variant="quiet" onClick={onClose} disabled={saving}>ปิด</Button>
          <Button tone="primary" onClick={save} disabled={saving || check.errors.length > 0}>
            {saving ? "กำลังให้สิทธิ์…" : "ให้สิทธิ์"}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {activeRows.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[length:var(--fs-8)] font-semibold">ถืออยู่ตอนนี้</h3>
            <ul className="flex flex-col gap-2">
              {activeRows.map((g) => (
                <li key={g.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[length:var(--fs-7)]">{capLabel(g.cap)}</div>
                    <div className="text-[length:var(--fs-5)] text-[var(--text-3)]">
                      {expiryText(g)} · ให้โดย {g.grantedByName} · {g.reason}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" tone="danger" onClick={() => revoke(g)}>
                    <ShieldOff size={14} aria-hidden="true" />ถอน
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h3 className="text-[length:var(--fs-8)] font-semibold">ให้สิทธิ์เพิ่ม</h3>
          <div className="form-group">
            <label>สิทธิ์ที่ให้ <span className="text-[var(--red)]">*</span></label>
            <OptionTiles multiple value={caps} onChange={setCaps} options={options} ariaLabel="สิทธิ์ที่ให้" />
          </div>
          <div className="form-group">
            <label>เหตุผล <span className="text-[var(--red)]">*</span></label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="เช่น ช่วยงาน RA ช่วงขาดคน ถึงสิ้นเดือน" maxLength={500} />
          </div>
          <div className="form-group">
            <label>หมดอายุ <span className="text-[var(--red)]">*</span></label>
            <OptionTiles
              value={expiryKind}
              onChange={setExpiryKind}
              ariaLabel="หมดอายุ"
              options={[
                { value: "none", label: "ไม่มีกำหนด", description: "ถือไปจนกว่าจะมีคนถอน" },
                { value: "date", label: "ถึงวันที่", description: "ใช้ได้ถึงสิ้นวันนั้น · ระบบถอดเองเช้าวันถัดไป + แจ้งกระดิ่ง" },
              ]}
            />
            {expiryKind === "date" && (
              <DateInput value={expiryDate} onChange={setExpiryDate} min={today} ariaLabel="ใช้ได้ถึงวันที่" />
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}

const personOf = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "ผู้ใช้";

"use client";
// ── หน้าต่าง "เพิ่มหลายโซน" ของงานบริการ (D27 · ม็อก SoBulkZonesModal · r2 S5) ──────────────────────────────────
//
// ⭐ **generic** — ไม่รู้จักใบสั่งขาย: รับทะเบียนไซต์ของลูกค้า + โซนที่ติดอยู่แล้ว แล้วคืนแถว `{ zoneId, packsPerRound }`
//   ⇒ ตารางงานบริการของใบสั่งขายใช้วันนี้ · PR-D ห่อให้ฟอร์มใบย้อนหลังใช้ต่อ (HistoricalBulkZonesModal ยังไม่แปลงใน PR-A)
// ⭐ แพ็คต่อรอบ [ตามผลประเมินของแต่ละโซน | เท่ากันทุกโซน: __] → ค้น (รหัส/ชื่อไซต์ + ชื่อ/รหัสโซน) → ติ๊กทีละโซน/ทั้งไซต์/
//   ทุกโซนที่เห็น → ท้ายหน้าต่างบอกผลก่อนกด ("จะเพิ่ม n โซนใต้รายการ k · …")
// ⭐ แถวแสดงผลมาจาก `zoneBrowserRows` ตัวเดียวกับช่องเลือกโซน — ไซต์/โซนปิดใช้งาน และโซนที่อยู่ในรายการนี้แล้ว
//   **เห็นแต่ติ๊กไม่ได้ พร้อมเหตุ** (กฎบ้าน: ติดด่าน = โชว์แล้วบอกเหตุ) · อยู่รายการอื่นของใบ = แค่บอก ติ๊กได้
// 🔴 ข้อความติดด่าน ("ยังเพิ่มไม่ได้ — ยังไม่ได้เลือกโซน" · เพดาน 500 โซน) ขึ้น **หลังกด** เท่านั้น (กฎ 3)
// ⚠️ ช่องค้นหา `autoComplete="off"` (กฎบ้าน search input)
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import { fmtNumber } from "@/lib/format";
import { ZONE_TAKEN_SAME_LINE, registryIndex, zoneBrowserRows } from "@/lib/service/zonePickerOptions";
import { ZONES_BULK_PACKS_INVALID, zonesBulkConsequence, zonesBulkPlan } from "./zonesBulkPlan";
import styles from "./ZonesBulkModal.module.css";

const MODE_OPTIONS = [
  { value: "assessed", label: "ตามผลประเมินของแต่ละโซน" },
  { value: "equal", label: "เท่ากันทุกโซน" },
];
const EMPTY_TAKEN = new Map();

const assessedOf = (zone) => {
  const n = Number(zone?.assessedPackages);
  return zone?.assessedPackages !== null && zone?.assessedPackages !== undefined && Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * @param open · @param onClose · @param lineLabel "รายการ n: …" (หัวหน้าต่าง) · @param lineNo เลขรายการ (ท้ายหน้าต่าง)
 * @param registrySites ทะเบียนของลูกค้า (รูปของ GET /api/service/customers/[id]/zones) · @param loading / loadError / onRetry
 * @param taken Map zoneId → เหตุ (`zoneTakenMap` — รายการนี้ = ติด · รายการอื่น = แค่บอก)
 * @param existingCount โซนที่รายการถืออยู่แล้ว · @param cap เพดานโซนต่อรายการ (500)
 * @param onAdd `(rows: [{ zoneId, packsPerRound|null }]) => void`
 */
export default function ZonesBulkModal({
  open, onClose, lineLabel = "", lineNo = null, registrySites = [], loading = false, loadError = "", onRetry,
  taken = EMPTY_TAKEN, existingCount = 0, cap = 500, onAdd,
}) {
  const [mode, setMode] = useState("assessed");
  const [equalPacks, setEqualPacks] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => []);
  const [pressed, setPressed] = useState(false);

  /* เปิดใหม่ = เริ่มใหม่ทั้งหน้าต่าง — ติ๊กค้างจากรอบก่อน (ซึ่งเพิ่มไปแล้ว) คือโซนซ้ำที่รอเกิด */
  useEffect(() => {
    if (!open) return;
    setMode("assessed");
    setEqualPacks("");
    setQuery("");
    setPicked([]);
    setPressed(false);
  }, [open]);

  const index = useMemo(() => registryIndex(registrySites), [registrySites]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const rows = useMemo(
    () => zoneBrowserRows({ registrySites, query, taken, picked: pickedSet }),
    [registrySites, query, taken, pickedSet],
  );
  const visibleIds = useMemo(() => new Set(rows.flatMap((row) => row.zones.map((zone) => String(zone.id)))), [rows]);
  const selectable = rows.flatMap((row) => row.selectableIds);
  const hiddenPicked = picked.filter((id) => !visibleIds.has(id)).length;
  const shownZones = rows.reduce((sum, row) => sum + row.zones.length, 0);
  const plan = zonesBulkPlan({ selectedIds: picked, zonesById: index.zonesById, mode, equalPacks, existingCount, cap });
  const blocked = pressed && plan.error;

  const toggle = (ids, on) => setPicked((current) => {
    if (!on) {
      const drop = new Set(ids);
      return current.filter((id) => !drop.has(id));
    }
    const have = new Set(current);
    return [...current, ...ids.filter((id) => !have.has(id))];
  });
  const confirm = () => {
    setPressed(true);
    if (plan.error) return;
    onAdd?.(plan.rows);
  };

  const countText = loading || loadError
    ? "ยังอ่านทะเบียนไซต์ไม่ได้"
    : query.trim()
      ? `ตรงคำค้น ${fmtNumber(rows.length)} ไซต์ · ${fmtNumber(shownZones)} โซน (จาก ${fmtNumber(index.zonesById.size)} โซน)`
      : `${fmtNumber(index.sites.length)} ไซต์ · ${fmtNumber(index.zonesById.size)} โซนในทะเบียน`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      sheetOnPhone
      title={`เพิ่มหลายโซน — ${lineLabel}`}
      subtitle="ติ๊กโซนแล้วใส่แพ็คต่อรอบครั้งเดียว — ได้หนึ่งแถวต่อโซนใต้รายการนี้ · แก้ทีละแถวต่อได้ในตาราง · แถวที่มีอยู่แล้วไม่ถูกแตะ"
      footer={(
        <div className={styles.foot}>
          <span className={styles.consequence} data-blocked={blocked ? "" : undefined} role={blocked ? "alert" : undefined}>
            {blocked ? `ยังเพิ่มไม่ได้ — ${plan.error}` : zonesBulkConsequence(plan, { lineNo, mode })}
          </span>
          <Button tone="neutral" onClick={onClose}>ยกเลิก</Button>
          <Button tone="primary" onClick={confirm}>{plan.count ? `เพิ่ม ${fmtNumber(plan.count)} โซน` : "เพิ่มโซน"}</Button>
        </div>
      )}
    >
      <p className={styles.lead}>{`ในรายการตอนนี้ ${fmtNumber(existingCount)} โซน · เพิ่มได้อีก ${fmtNumber(Math.max(0, cap - existingCount))} โซน`}</p>

      <div className={styles.packs}>
        <span className={styles.packsLabel}>แพ็คต่อรอบ<span className={styles.req} aria-hidden="true">*</span></span>
        <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="วิธีใส่แพ็คต่อรอบ" />
        {mode === "equal" ? (
          <span className={styles.equal}>
            <Input
              type="number" min="1" max="9999" step="1" inputMode="numeric" autoComplete="off" placeholder="—"
              value={equalPacks}
              invalid={blocked && plan.error === ZONES_BULK_PACKS_INVALID}
              onChange={(event) => setEqualPacks(event.target.value)}
              aria-label="แพ็คต่อรอบเท่ากันทุกโซน"
            />
            แพ็ค
          </span>
        ) : (
          <span className={styles.count}>โซนที่ยังไม่เคยประเมินเว้นว่างไว้ — ใส่ทีละแถวในตาราง</span>
        )}
      </div>

      <div className={styles.tools}>
        <div className={`search-glass ${styles.search}`}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหารหัส/ชื่อไซต์ หรือชื่อ/รหัสโซน"
            aria-label="ค้นหาไซต์หรือโซนของลูกค้ารายนี้"
          />
        </div>
        <span className={styles.count}>{countText}</span>
        <Button size="sm" variant="quiet" disabled={!picked.length} onClick={() => setPicked([])}>ล้างที่เลือก</Button>
        <Button size="sm" tone="neutral" disabled={!selectable.length} onClick={() => toggle(selectable, true)}>
          เลือกทุกโซนที่เห็น{selectable.length ? ` (${fmtNumber(selectable.length)})` : ""}
        </Button>
      </div>

      {loading ? <p className={styles.hint}>กำลังโหลดทะเบียนไซต์…</p> : null}
      {loadError ? (
        <p className={styles.hint}>
          {loadError}{" "}
          {onRetry ? <Button size="sm" onClick={() => onRetry()}>ลองโหลดอีกครั้ง</Button> : null}
        </p>
      ) : null}
      {!loading && !loadError && !index.sites.length ? (
        <p className={styles.hint}>ลูกค้ารายนี้ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้</p>
      ) : null}
      {!loading && index.sites.length > 0 && !rows.length ? (
        <p className={styles.hint}>{`ไม่มีไซต์หรือโซนที่ตรงคำค้น “${query}”`}</p>
      ) : null}
      {hiddenPicked > 0 ? (
        <p className={styles.hint}>{`คำค้นนี้ซ่อนโซนที่ติ๊กไว้แล้ว ${fmtNumber(hiddenPicked)} โซน — ยังนับอยู่ในปุ่มเพิ่ม`}</p>
      ) : null}

      {rows.length ? (
        <ul className={styles.sites} aria-label="ไซต์และโซนของลูกค้า">
          {rows.map(({ site, zones, selectableIds }) => {
            const on = selectableIds.filter((id) => pickedSet.has(id)).length;
            const all = selectableIds.length > 0 && on === selectableIds.length;
            return (
              <li key={site.id} className={styles.site}>
                <label className={styles.siteName}>
                  <input
                    type="checkbox"
                    checked={all}
                    ref={(node) => { if (node) node.indeterminate = on > 0 && !all; }}
                    disabled={!selectableIds.length}
                    onChange={() => toggle(selectableIds, !all)}
                    aria-label={`ทั้งไซต์ ${site.code || site.name}`}
                  />
                  <span className={styles.siteText}>
                    <b>{site.name || site.code}</b>
                    {site.code ? <span className={styles.siteCode}>{site.code}</span> : null}
                  </span>
                </label>
                <span className={styles.zones}>
                  {zones.map((zone) => {
                    const assessed = assessedOf(zone);
                    return (
                      <label
                        key={zone.id}
                        className={styles.zone}
                        data-on={zone.picked ? "" : undefined}
                        data-off={zone.disabled ? "" : undefined}
                        title={zone.why || undefined}
                      >
                        <input
                          type="checkbox"
                          checked={zone.picked || (zone.disabled && zone.why === ZONE_TAKEN_SAME_LINE)}
                          disabled={zone.disabled}
                          onChange={(event) => toggle([String(zone.id)], event.target.checked)}
                        />
                        <span>{zone.name || zone.code}</span>
                        {zone.code ? <span className={styles.zoneCode}>{zone.code}</span> : null}
                        {assessed ? <span className={styles.zoneNote}>· ประเมินไว้ {fmtNumber(assessed)} แพ็ค</span> : null}
                        {zone.why ? <span className={styles.zoneNote}>· {zone.why}</span> : null}
                      </label>
                    );
                  })}
                  {!zones.length ? <span className={styles.empty}>ไซต์นี้ยังไม่มีโซนในทะเบียน</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Modal>
  );
}

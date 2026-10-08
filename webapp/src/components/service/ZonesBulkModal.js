"use client";
// ── หน้าต่าง "เพิ่มหลายโซน" ของงานบริการ (D27 · ม็อก SoBulkZonesModal · r2 S5) ──────────────────────────────────
//
// ⭐ **generic** — ไม่รู้จักใบสั่งขาย: รับทะเบียนไซต์ของลูกค้า + โซนที่ติดอยู่แล้ว แล้วคืนแถว `{ zoneId, packsPerRound }`
//   ⇒ ตารางงานบริการของใบสั่งขาย + หน้าต่างเพิ่มหลายโซนของใบย้อนหลัง (`HistoricalBulkZonesModal` = ตัวห่อ · PR-D)
// ⭐ PR-D (DD4): prop เสริมล้วน ค่าตั้งต้น = หน้าตาเดิมทุกตัวอักษร — `title` · `subtitle` · `lead` (undefined = ประโยคเดิม ·
//   null = ซ่อน) · `packsLabel` · `renderFields({ pressed, plan })` (ช่องของผู้เรียก เหนือแถวรอบละกี่แพ็ค) ·
//   `renderAfterPacks({ pressed, plan })` (ช่องของผู้เรียก **ใต้** แถวรอบละกี่แพ็ค — ใบย้อนหลังวางช่องจำนวนรอบบริการตรงนี้ ·
//   มติเจ้าของ 08/10 รอบสอง "แพ็คก่อนจำนวนรอบบริการ" · ไม่ส่ง = ไม่วาดอะไร ตารางงานบริการของใบสั่งขายเห็นหน้าตาเดิม) · `extraError`
//   (ด่านของช่องผู้เรียก — มาก่อนด่านของตัวนี้) · `consequence(plan, { lineNo, mode })` · `confirmLabel(count)` ·
//   `emptyRegistryText` · ไซต์ที่พก `loadError` (ผู้เรียกอ่านโซนของไซต์นั้นไม่สำเร็จ) = ประโยคแทนชิปโซน และขึ้นเสมอแม้คำค้นไม่ตรง
//   · `assessedHint` (review 29/09) ประโยคข้างโหมด "ตามผลประเมิน" (undefined = ประโยคเดิม · null = ซ่อน — ผู้เรียกที่ผลประเมิน
//   ยังโหลด/อ่านไม่ได้ ซึ่งทุกโซนจะว่าง ไม่ใช่เฉพาะโซนที่ไม่เคยประเมิน)
// ⭐ รอบละกี่แพ็ค [ตามผลประเมินของแต่ละโซน | เท่ากันทุกโซน: __] → ค้น (รหัส/ชื่อไซต์ + ชื่อ/รหัสโซน) → ติ๊กทีละโซน/ทั้งไซต์/
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
import { ZONES_BULK_PACKS_INVALID, ZONES_BULK_PACKS_LABEL, zonesBulkConsequence, zonesBulkPlan } from "./zonesBulkPlan";
import styles from "./ZonesBulkModal.module.css";

const MODE_OPTIONS = [
  { value: "assessed", label: "ตามผลประเมินของแต่ละโซน" },
  { value: "equal", label: "เท่ากันทุกโซน" },
];
const EMPTY_TAKEN = new Map();
const countLabel = (count) => (count ? `เพิ่ม ${fmtNumber(count)} โซน` : "เพิ่มโซน");

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
 * @param extraError ด่านของช่องผู้เรียก (ข้อความไทย | null) — ขึ้นท้ายหน้าต่างหลังกดเท่านั้น และมาก่อน `plan.error` (M1)
 * @param renderFields `({ pressed, plan }) => node` ช่องของผู้เรียก (วาดเหนือแถวแพ็คต่อรอบ · แดงหลังกดด้วย `pressed`)
 * @param renderAfterPacks `({ pressed, plan }) => node` ช่องของผู้เรียกที่ต้องอยู่ใต้แถวแพ็คต่อรอบ — ไม่ส่ง = ไม่วาด (ค่าตั้งต้น)
 * @param assessedHint ประโยคข้างโหมด "ตามผลประเมินของแต่ละโซน" — ไม่ส่ง = ประโยคเดิม · null = ซ่อน
 */
export default function ZonesBulkModal({
  open, onClose, lineLabel = "", lineNo = null, registrySites = [], loading = false, loadError = "", onRetry,
  taken = EMPTY_TAKEN, existingCount = 0, cap = 500, onAdd,
  title = `เพิ่มหลายโซน — ${lineLabel}`,
  subtitle = "ติ๊กโซนแล้วใส่รอบละกี่แพ็คทีเดียว — ได้หนึ่งแถวต่อโซนใต้รายการนี้ · แก้ทีละแถวต่อได้ในตาราง · แถวที่มีอยู่แล้วไม่ถูกแตะ",
  lead, packsLabel = ZONES_BULK_PACKS_LABEL, renderFields = null, renderAfterPacks = null, extraError = null,
  consequence = zonesBulkConsequence, confirmLabel = countLabel,
  emptyRegistryText = "ลูกค้ารายนี้ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้",
  assessedHint = "โซนที่ยังไม่เคยประเมินเว้นว่างไว้ — ใส่ทีละแถวในตาราง",
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
  const rows = useMemo(() => {
    const shown = zoneBrowserRows({ registrySites, query, taken, picked: pickedSet });
    /* 🔴 ไซต์ที่ผู้เรียกอ่านโซนไม่สำเร็จ (`loadError`) ต้องเห็นเสมอ — ค้นหาโซนที่อาจอยู่ในไซต์นั้นแล้วไซต์หายจากลิสต์
       = อ่านเหมือน "ไม่มีโซนนี้" (N1 ของใบย้อนหลัง: คำขอที่พังชั่วคราวต้องไม่กลายเป็นคำตอบ) · ไม่มีไซต์พัง = ผลเดิม */
    if (!index.sites.some((site) => site.loadError)) return shown;
    const bySite = new Map(shown.map((row) => [row.site.id, row]));
    return index.sites
      .filter((site) => bySite.has(site.id) || site.loadError)
      .map((site) => bySite.get(site.id) || { site, zones: [], selectableIds: [] });
  }, [registrySites, query, taken, pickedSet, index]);
  const visibleIds = useMemo(() => new Set(rows.flatMap((row) => row.zones.map((zone) => String(zone.id)))), [rows]);
  const selectable = rows.flatMap((row) => row.selectableIds);
  const hiddenPicked = picked.filter((id) => !visibleIds.has(id)).length;
  const shownZones = rows.reduce((sum, row) => sum + row.zones.length, 0);
  const plan = zonesBulkPlan({ selectedIds: picked, zonesById: index.zonesById, mode, equalPacks, existingCount, cap });
  /* 🔴 M1: ด่านของช่องผู้เรียกมาก่อน (ลำดับช่องบนจอ: ช่องผู้เรียกอยู่เหนือแถวแพ็คต่อรอบ) · ขึ้นหลังกดเท่านั้น (กฎ 3) ·
     ไม่มีทั้งสองข้อ = ไม่ติด (ท้ายหน้าต่างไม่เคยพิมพ์ "null") */
  const reason = pressed ? (extraError || plan.error) : null;
  const blocked = Boolean(reason);

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
    if (extraError || plan.error) return;
    onAdd?.(plan.rows);
  };
  const leadText = lead === undefined
    ? `ในรายการตอนนี้ ${fmtNumber(existingCount)} โซน · เพิ่มได้อีก ${fmtNumber(Math.max(0, cap - existingCount))} โซน`
    : lead;

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
      title={title}
      subtitle={subtitle}
      footer={(
        <div className={styles.foot}>
          <span className={styles.consequence} data-blocked={blocked ? "" : undefined} role={blocked ? "alert" : undefined}>
            {blocked ? `ยังเพิ่มไม่ได้ — ${reason}` : consequence(plan, { lineNo, mode })}
          </span>
          <Button tone="neutral" onClick={onClose}>ยกเลิก</Button>
          <Button tone="primary" onClick={confirm}>{confirmLabel(plan.count)}</Button>
        </div>
      )}
    >
      {leadText ? <p className={styles.lead}>{leadText}</p> : null}

      {renderFields ? renderFields({ pressed, plan }) : null}

      <div className={styles.packs}>
        <span className={styles.packsLabel}>{packsLabel}<span className={styles.req} aria-hidden="true">*</span></span>
        <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel={`วิธีใส่${packsLabel}`} />
        {mode === "equal" ? (
          <span className={styles.equal}>
            <Input
              type="number" min="1" max="9999" step="1" inputMode="numeric" autoComplete="off" placeholder="—"
              value={equalPacks}
              invalid={blocked && plan.error === ZONES_BULK_PACKS_INVALID}
              onChange={(event) => setEqualPacks(event.target.value)}
              aria-label={`${packsLabel} เท่ากันทุกโซน`}
            />
            แพ็ค
          </span>
        ) : assessedHint ? (
          <span className={styles.count}>{assessedHint}</span>
        ) : null}
      </div>

      {renderAfterPacks ? renderAfterPacks({ pressed, plan }) : null}

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
        <p className={styles.hint}>{emptyRegistryText}</p>
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
                {site.loadError ? (
                  <span className={styles.siteError}>{site.loadError}</span>
                ) : (
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
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Modal>
  );
}

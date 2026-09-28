"use client";
// ── ตารางโซนของบรรทัดแพ็คเกจ: "ไซต์ · โซน" | "แพ็คต่อรอบ" | "ผลประเมิน" | ลบ (ม็อก SoMultiZoneLine · D1) ─────────────
//
// ⭐ หนึ่งบรรทัดของใบ → หลายโซน · แต่ละโซนมี "แพ็คต่อรอบ" ของตัวเอง (จำนวนเต็ม 1–9999)
// ⭐ ตัวเลือกโซนมาจากทะเบียนของลูกค้าผ่าน `zonePickerOptions` ตัวเดียว (หัวกลุ่ม = ไซต์) — ไซต์/โซนที่ปิดใช้งาน และโซนที่
//   อยู่ในบรรทัดนี้แล้ว **ยังอยู่ในลิสต์แต่เลือกไม่ได้ พร้อมเหตุ** · อยู่บรรทัดอื่นของใบ = แค่บอก เลือกได้
// ⭐ เกิน 8 แถวย่อเป็น "แสดงอีก n โซน" — **กางเองเมื่อมีช่องที่ขึ้นแดง/ถูกพาไป** ในแถวที่ซ่อน (ปุ่ม "ไปแก้" โฟกัสได้เสมอ)
// ⚠️ ข้อความข้อมูล (รอบขายของใบอื่นที่ยังมีผล · อยู่รายการอื่นด้วย) ไม่เคยแดง — แดงเฉพาะหลังกดเท่านั้น
// ⚠️ ไม่เติมแพ็คต่อรอบจากผลประเมินให้เอง — ปุ่ม "ใช้" ข้างผลประเมินคือการเลือกของคน (ไม่มีค่าตั้งต้นเงียบ ๆ)
import { useEffect, useMemo, useState } from "react";
import { ListPlus, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { NA, fmtNumber } from "@/lib/format";
import { SERVICE_SETUP_LIMITS } from "@/lib/sales/serviceSetup";
import { zonePickerOptions, zoneTakenMap } from "@/lib/service/zonePickerOptions";
import { zonesBulkCapText } from "@/components/service/zonesBulkPlan";
import { SERVICE_SETUP_REVEAL_EVENT, lineFieldId, positiveIntOrNull, zonePacksFieldId } from "./serviceSetupDraft";
import styles from "./ServiceLineSetupBlock.module.css";

const COLLAPSE_AT = 8;
const NO_SITE_TEXT = "ลูกค้ารายนี้ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้";

let rowSeq = 0;
/** key ของแถวใหม่ (ยังไม่มีโซน) — แถวจากฐานใช้ `z:<zoneId>` */
export const newZoneRowKey = () => {
  rowSeq += 1;
  return `n:${rowSeq}`;
};

const siteText = (site) => [site?.code, site?.name].filter(Boolean).join(" ") || null;
/** "ST-… ชื่อไซต์ · ชื่อโซน" — ป้ายของโซนในโหมดอ่านและตัวเลือกที่ทะเบียนไม่มี */
export const zoneReadLabel = (zone, site, zoneId) => `${siteText(site) || NA} · ${zone?.name || zone?.code || zoneId || NA}`;

function selectOption(option) {
  if (option.group) return option;
  return {
    ...option,
    label: option.missing ? option.label : `${option.siteName || option.siteCode || NA} · ${option.zoneName}`,
    title: option.why || undefined,
    render: (
      <span className={styles.zoneOption}>
        <span>{option.zoneName}</span>
        {option.zoneCode ? <span className={styles.zoneOptionCode}>{option.zoneCode}</span> : null}
        {option.why ? <span className={styles.zoneOptionWhy}>· {option.why}</span> : null}
      </span>
    ),
  };
}

function ZoneRow({
  line, row, index, zone, site, registry, takenLines, liveOrders, otherLineNos, packsError, zoneError, blockedNote, onPick, onPacks, onRemove,
}) {
  const registryNote = registry.loading ? " (กำลังโหลดทะเบียนไซต์…)" : registry.error ? " (โหลดทะเบียนไซต์ไม่สำเร็จ)" : "";
  const missingNote = row.zoneId ? `${zoneReadLabel(zone, site, row.zoneId)}${registryNote}` : null;
  const options = useMemo(() => zonePickerOptions({
    registrySites: registry.sites,
    taken: zoneTakenMap({ lines: takenLines, lineId: line.lineId, rowIndex: index }),
    currentZoneId: row.zoneId || null,
    missingNote,
  }).map(selectOption), [registry.sites, takenLines, line.lineId, index, row.zoneId, missingNote]);

  const zoneName = zone?.name || zone?.code || row.zoneId || "";
  const assessed = positiveIntOrNull(zone?.assessedPackages);
  const packsId = row.zoneId ? zonePacksFieldId(line.lineId, row.zoneId) : undefined;
  const codes = [site?.code, zone?.code].filter(Boolean).join(" · ");
  const emptyText = registry.loading
    ? "กำลังโหลดทะเบียนไซต์…"
    : registry.error
      ? "โหลดทะเบียนไซต์ไม่สำเร็จ — กด “ลองโหลดอีกครั้ง” ด้านบนตาราง"
      : (query) => (query ? `ไม่พบไซต์หรือโซนที่ตรง “${query}”` : "ลูกค้ารายนี้ยังไม่มีโซนในทะเบียน");

  return (
    <div className={styles.zoneRow}>
      <div className={styles.zoneSelect} data-invalid={zoneError ? "" : undefined}>
        <SearchableSelect
          size="sm"
          value={row.zoneId || ""}
          onChange={(next) => onPick(index, next)}
          options={options}
          placeholder="เลือกไซต์ · โซน"
          searchPlaceholder="ค้นหารหัส/ชื่อไซต์ หรือชื่อ/รหัสโซน"
          ariaLabel={`ไซต์ · โซน รายการ ${line.lineNo} แถว ${index + 1}`}
          emptyText={emptyText}
        />
        {codes ? <span className={styles.zoneCodes}>{codes}</span> : null}
      </div>
      <span className={styles.numField}>
        <Input
          id={packsId}
          type="number" min="1" max="9999" step="1" inputMode="numeric" autoComplete="off" placeholder="—"
          value={row.packsPerRound}
          invalid={!!packsError}
          onChange={(event) => onPacks(index, event.target.value)}
          aria-label={`แพ็คต่อรอบ ${zoneName || `แถว ${index + 1}`} รายการ ${line.lineNo}`}
        />
        <span className={styles.numUnit}>แพ็ค</span>
      </span>
      <span className={styles.assessed} data-empty={assessed === null ? "" : undefined}>
        {assessed === null ? "—" : (
          <>
            ประเมินไว้ {fmtNumber(assessed)} แพ็ค
            {String(assessed) !== String(row.packsPerRound).trim() ? (
              <Button size="sm" variant="quiet" onClick={() => onPacks(index, String(assessed))}>ใช้</Button>
            ) : null}
          </>
        )}
      </span>
      <Button
        iconOnly size="sm" variant="quiet"
        icon={<Trash2 size={14} aria-hidden="true" />}
        onClick={() => onRemove(index)}
        aria-label={`ลบโซน ${zoneName || `แถว ${index + 1}`} ออกจากรายการ ${line.lineNo}`}
      />
      {blockedNote ? <span className={styles.zoneInfo} role="status">{blockedNote}</span> : null}
      {zoneError ? <span className={styles.zoneInfo} data-tone="error" role="alert">{zoneError}</span> : null}
      {packsError ? <span className={styles.zoneInfo} data-tone="error" role="alert">{packsError}</span> : null}
      {liveOrders?.length ? (
        <span className={styles.zoneInfo}>โซนนี้มีรอบขายของ {liveOrders.join(", ")} ที่ยังมีผล — ถ้าเป็นการต่อสัญญาไม่เป็นไร</span>
      ) : null}
      {otherLineNos?.length ? (
        <span className={styles.zoneInfo}>โซนนี้อยู่ในรายการ {otherLineNos.join(", ")} ของใบนี้ด้วย</span>
      ) : null}
    </div>
  );
}

/**
 * @param line บรรทัดที่จอวาด (`mergedLines`) · @param editable โหมดแก้
 * @param zonesById / sitesById Map รวม (ก้อน GET + ทะเบียน) · @param registry `setup.registry`
 * @param takenLines `[{ lineId, lineNo, zones }]` ของทั้งใบ (บอก "อยู่รายการอื่นด้วย" · กันซ้ำในบรรทัด)
 * @param liveTerms Map zoneId → เลขใบอื่นที่ยังมีรอบขาย · @param highlightOf `(fieldId) => ข้อความ|null` (หลังกดเท่านั้น)
 * @param zoneErrors Map "lineId:zoneId" → ข้อความ (บันทึกไม่ผ่านรายโซน) · @param noSites ลูกค้าไม่มีไซต์ที่ใช้งาน
 * @param onChange `(zones, touchedFieldIds) => void` · @param onOpenBulk เปิดหน้าต่าง "เพิ่มหลายโซน…"
 */
export default function ServiceZoneRows({
  line, editable = false, zonesById = new Map(), sitesById = new Map(), registry, takenLines = [], liveTerms = new Map(),
  highlightOf = () => null, zoneErrors = new Map(), noSites = false, onChange, onOpenBulk,
}) {
  const [expanded, setExpanded] = useState(false);
  const [capHit, setCapHit] = useState(false);
  /* แถวที่กดลบระหว่างทะเบียนโหลดไม่ขึ้น — บอกเหตุที่แถวนั้น (ปุ่มยังโชว์ · บอกเหตุตอนกด) */
  const [blockedRow, setBlockedRow] = useState(null);
  const rows = useMemo(() => (Array.isArray(line?.zones) ? line.zones : []), [line?.zones]);
  const lineId = line.lineId;
  const zonesFieldId = lineFieldId(lineId, "zones");
  const packsErrorOf = (row) => (row.zoneId ? highlightOf(zonePacksFieldId(lineId, row.zoneId)) : null);
  const zoneErrorOf = (row) => (row.zoneId ? zoneErrors.get(`${lineId}:${row.zoneId}`) || null : null);

  /* ปุ่ม "ไปแก้" ชี้เข้าแถวที่ซ่อนอยู่ = กางก่อน (ผู้ยิงรอเฟรมถัดไปแล้วค่อยโฟกัส) */
  useEffect(() => {
    const onReveal = (event) => {
      const fieldId = event?.detail?.fieldId;
      if (!fieldId) return;
      if (fieldId === zonesFieldId || rows.some((row) => row.zoneId && zonePacksFieldId(lineId, row.zoneId) === fieldId)) setExpanded(true);
    };
    window.addEventListener(SERVICE_SETUP_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(SERVICE_SETUP_REVEAL_EVENT, onReveal);
  }, [lineId, zonesFieldId, rows]);

  const hiddenHasError = rows.slice(COLLAPSE_AT).some((row) => packsErrorOf(row) || zoneErrorOf(row));
  const showAll = expanded || hiddenHasError || rows.length <= COLLAPSE_AT;
  const visible = showAll ? rows : rows.slice(0, COLLAPSE_AT);
  const hidden = rows.length - visible.length;

  const picked = rows.filter((row) => row.zoneId);
  const siteCount = new Set(picked.map((row) => zonesById.get(row.zoneId)?.siteId).filter(Boolean)).size;
  const countText = `${fmtNumber(picked.length)} โซนใน ${fmtNumber(siteCount)} ไซต์`;

  /* โซนเดียวกันในบรรทัดอื่นของใบ → เลขรายการ (แค่บอก ไม่ห้าม) */
  const otherLinesByZone = useMemo(() => {
    const map = new Map();
    for (const other of takenLines) {
      if (other.lineId === lineId) continue;
      for (const row of other.zones || []) {
        if (!row.zoneId) continue;
        if (!map.has(row.zoneId)) map.set(row.zoneId, []);
        if (!map.get(row.zoneId).includes(other.lineNo)) map.get(row.zoneId).push(other.lineNo);
      }
    }
    return map;
  }, [takenLines, lineId]);

  if (!editable) {
    return (
      <div className={styles.field} id={zonesFieldId}>
        <span className={styles.label}>ไซต์ · โซน · แพ็คต่อรอบ</span>
        {rows.length ? (
          <ul className={styles.readZones}>
            {visible.map((row) => {
              const zone = zonesById.get(row.zoneId);
              const packs = positiveIntOrNull(row.packsPerRound);
              return (
                <li key={row.key}>
                  {zoneReadLabel(zone, sitesById.get(zone?.siteId), row.zoneId)} — {packs ? `${fmtNumber(packs)} แพ็ค/รอบ` : "ยังไม่ใส่แพ็คต่อรอบ"}
                </li>
              );
            })}
          </ul>
        ) : <span className={styles.hint}>ยังไม่เลือกโซน</span>}
        {hidden > 0 ? (
          <Button size="sm" variant="quiet" onClick={() => setExpanded(true)}>แสดงอีก {fmtNumber(hidden)} โซน</Button>
        ) : null}
      </div>
    );
  }

  const cap = SERVICE_SETUP_LIMITS.zonesPerLine;
  const emit = (next, touched = []) => {
    setCapHit(false);
    onChange?.(next, touched);
  };
  const addRow = () => {
    if (picked.length >= cap) { setCapHit(true); return; }
    emit([...rows, { key: newZoneRowKey(), zoneId: "", packsPerRound: "" }]);
  };
  const openBulk = () => {
    if (picked.length >= cap) { setCapHit(true); return; }
    setCapHit(false);
    onOpenBulk?.();
  };
  const pick = (index, zoneId) => emit(rows.map((row, i) => (i === index ? { ...row, zoneId: zoneId || "" } : row)), [zonesFieldId]);
  const setPacks = (index, value) => emit(
    rows.map((row, i) => (i === index ? { ...row, packsPerRound: value } : row)),
    rows[index]?.zoneId ? [zonePacksFieldId(lineId, rows[index].zoneId)] : [],
  );
  /* 🔴 ทะเบียนโหลดไม่ขึ้น/ยังโหลด = ลบแถวไม่ได้ (§2.7) — แถวที่ลบแล้วเลือกกลับไม่ได้เพราะตัวเลือกว่าง (ทางเดียวคือทิ้งร่างทั้งหมด)
     ⭐ ปุ่มยังโชว์ กดแล้วบอกเหตุที่แถว (กติกา "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด") */
  const removeBlocked = registry.error
    ? "โหลดทะเบียนไซต์ไม่สำเร็จ — ลองโหลดอีกครั้งก่อนลบโซน"
    : (registry.loading && !(registry.sites || []).length ? "กำลังโหลดทะเบียนไซต์… — รอก่อนลบโซน" : null);
  const remove = (index) => {
    if (removeBlocked) {
      setBlockedRow(rows[index]?.key ?? null);
      return;
    }
    setBlockedRow(null);
    emit(
      rows.filter((_, i) => i !== index),
      [zonesFieldId, ...(rows[index]?.zoneId ? [zonePacksFieldId(lineId, rows[index].zoneId)] : [])],
    );
  };
  const zonesError = highlightOf(zonesFieldId);

  return (
    <div className={styles.zones} id={zonesFieldId} data-invalid={zonesError ? "" : undefined}>
      <div className={styles.zoneHead} aria-hidden="true">
        <span>ไซต์ · โซน<span className={styles.req}>*</span></span>
        <span>แพ็คต่อรอบ<span className={styles.req}>*</span></span>
        <span>ผลประเมิน</span>
        <span />
      </div>
      {visible.map((row, index) => {
        const zone = row.zoneId ? zonesById.get(row.zoneId) : null;
        return (
          <ZoneRow
            key={row.key}
            line={line}
            row={row}
            index={index}
            zone={zone}
            site={zone ? sitesById.get(zone.siteId) : null}
            registry={registry}
            takenLines={takenLines}
            liveOrders={row.zoneId ? liveTerms.get(row.zoneId) : null}
            otherLineNos={row.zoneId ? otherLinesByZone.get(row.zoneId) : null}
            packsError={packsErrorOf(row)}
            zoneError={zoneErrorOf(row)}
            blockedNote={removeBlocked && blockedRow === row.key ? removeBlocked : null}
            onPick={pick}
            onPacks={setPacks}
            onRemove={remove}
          />
        );
      })}
      {hidden > 0 ? (
        <div className={styles.zoneMore}>
          <Button size="sm" variant="quiet" onClick={() => setExpanded(true)}>แสดงอีก {fmtNumber(hidden)} โซน</Button>
        </div>
      ) : null}
      {!rows.length ? (
        <div className={styles.zoneEmpty}>{noSites ? NO_SITE_TEXT : "ยังไม่เลือกโซน — กด “เพิ่มโซน” หรือ “เพิ่มหลายโซน…”"}</div>
      ) : null}
      <div className={styles.zoneFoot}>
        <Button size="sm" icon={<Plus size={14} aria-hidden="true" />} disabled={noSites} onClick={addRow}>เพิ่มโซน</Button>
        <Button size="sm" icon={<ListPlus size={14} aria-hidden="true" />} disabled={noSites} onClick={openBulk}>เพิ่มหลายโซน…</Button>
        <span className={styles.grow} />
        <span className={styles.zoneCount}>{countText}</span>
        {noSites && rows.length ? <span className={styles.zoneBlocked}>{NO_SITE_TEXT}</span> : null}
        {capHit ? <span className={styles.zoneBlocked} data-tone="error" role="alert">{zonesBulkCapText(cap)}</span> : null}
        {zonesError ? <span className={styles.zoneBlocked} data-tone="error" role="alert">{zonesError}</span> : null}
      </div>
    </div>
  );
}

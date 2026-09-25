"use client";
// ── หน้าต่าง "เพิ่มหลายโซน" ของขั้น ② (มติเจ้าของ 25/09) ──────────────────────────────────────
//
// ⭐ แทนช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" ที่ถอดแล้ว — ช่องนั้นไม่บันทึกอะไร เททับแพ็คเกจของ **ทุกบรรทัดที่มีอยู่**
//   เงียบ ๆ และตอนเปิดแก้ใบอ่านค่าจากบรรทัดแรก · หน้าต่างนี้ทำงานเดียวที่ช่องนั้นตั้งใจทำ (ลูกค้าโซนเยอะ ไม่ต้องเลือก
//   แพ็คเกจ 43 ครั้ง) โดย **เพิ่มบรรทัดใหม่เท่านั้น** ไม่แตะบรรทัดที่คีย์ไว้แล้ว
// ⭐ ค้น → ติ๊ก (ทีละโซน / ทั้งไซต์ / ทุกโซนที่เห็น) → แพ็คเกจ + จำนวนครั้งเดียว → หนึ่งบรรทัดต่อโซน
//   · ค้นด้วยคำเดียวกินรหัส/ชื่อไซต์ + ชื่อ/รหัสโซน (`historicalZoneBrowser` ตัวเดียวกับกองกำพร้า)
//   · โซนที่อยู่ในใบแล้ว / ปิดใช้งาน **เห็นแต่ติ๊กไม่ได้ พร้อมเหตุ** (กฎบ้าน: ติดด่าน = โชว์แล้วบอกเหตุ)
//   · ปุ่มยืนยันบอกผลก่อนกด ("จะเพิ่ม N บรรทัด · บรรทัดละ …") · ติดด่าน = ปุ่มปิดพร้อมเหตุข้างปุ่ม (form-design-rules)
// ⚠️ จำนวนเว้นว่างได้ (ใส่ทีละบรรทัดทีหลัง) แต่ใส่แล้วต้องเป็นจำนวนเต็ม > 0 — ด่านเดียวกับแผน (ไม่เดาจำนวนแทนผู้คีย์)
// ⚠️ แพ็คเกจเติมที่ขั้น ② ด้วย `quoteLineFromProduct` ตัวเดียวกับช่องเลือกในบรรทัด (ผู้เรียกทำใน `onAdd`)
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import MoneyInput from "@/components/ui/MoneyInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { fmtMoney, fmtNumber, naText } from "@/lib/format";
import { QUOTE_PRICE_FIELD } from "@/lib/sales/quoteLines";
import {
  REGISTRY_LOAD_FAILED, historicalBulkAddRows, historicalBulkConsequence, historicalBulkQtyIssue, historicalZoneBrowser,
} from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

export default function HistoricalBulkZonesModal({
  open, onClose, sites = [], zonesBySite = {}, siteErrors = {}, loading = false, loadError = "",
  rows = [], packageOptions = [], productsById = new Map(), productsError = "", onAdd,
}) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  /* เปิดใหม่ = เริ่มใหม่ทั้งหน้าต่าง — ติ๊กค้างจากรอบก่อน (ซึ่งเพิ่มไปแล้ว) คือบรรทัดซ้ำที่รอเกิด */
  useEffect(() => {
    if (!open) return;
    setProductId("");
    setQty("");
    setQuery("");
    setSelected(new Set());
  }, [open]);

  /* โซนที่ใบผูกไว้แล้ว → เลขบรรทัด (เหตุที่ติ๊กไม่ได้ต้องชี้บรรทัดที่ตาเห็นในคอลัมน์ "#") */
  const taken = useMemo(() => {
    const map = new Map();
    rows.forEach((row, index) => { if (row?.zoneId && !map.has(row.zoneId)) map.set(row.zoneId, index + 1); });
    return map;
  }, [rows]);
  const browser = useMemo(() => historicalZoneBrowser({
    sites, zonesBySite, siteErrors, query, pickedZoneIds: [...selected],
  }), [sites, zonesBySite, siteErrors, query, selected]);
  const whyNot = (zone) => {
    if (taken.has(zone.id)) return `อยู่ในใบแล้ว (รายการ ${taken.get(zone.id)})`;
    if (zone.isActive === false) return "ปิดใช้งานในทะเบียน";
    return null;
  };
  const visible = browser.rows.flatMap((row) => row.zones.filter((zone) => !whyNot(zone)).map((zone) => zone.id));

  const product = productId ? productsById.get(productId) || null : null;
  const unitPrice = product ? Number(product[QUOTE_PRICE_FIELD]) : null;
  const qtyIssue = historicalBulkQtyIssue(qty);
  const count = selected.size;
  const blocked = !productId
    ? "เลือกแพ็คเกจก่อน"
    : (qtyIssue || (count ? null : "ยังไม่ได้เลือกโซน"));

  const toggle = (ids, on) => setSelected((current) => {
    const next = new Set(current);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next;
  });
  const confirm = () => {
    if (blocked) return;
    const newRows = historicalBulkAddRows({ zoneIds: [...selected], sites, zonesBySite, rows, qty });
    onAdd?.(newRows, productId);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      sheetOnPhone
      title="เพิ่มหลายโซน"
      subtitle="ติ๊กโซนแล้วใส่แพ็คเกจกับจำนวนครั้งเดียว — ได้หนึ่งบรรทัดต่อโซน แก้ทีละบรรทัดต่อได้ในตาราง · บรรทัดที่มีอยู่แล้วไม่ถูกแตะ"
      footer={(
        <div className={styles.bulkFoot}>
          <span className={styles.bulkConsequence} data-blocked={blocked ? "yes" : undefined}>
            {blocked ? `ยังเพิ่มไม่ได้ — ${blocked}` : historicalBulkConsequence({ count, qty, unitPrice })}
          </span>
          <Button tone="neutral" variant="quiet" onClick={onClose}>ยกเลิก</Button>
          <Button tone="primary" disabled={Boolean(blocked)} onClick={confirm}>
            {count ? `เพิ่ม ${fmtNumber(count)} บรรทัด` : "เพิ่มบรรทัด"}
          </Button>
        </div>
      )}
    >
      <div className={styles.bulkFields}>
        <div className={styles.field}>
          <span>แพ็คเกจ <b className={styles.req}>*</b></span>
          <SearchableSelect
            entity="product"
            value={productId}
            onChange={setProductId}
            options={packageOptions}
            ariaLabel="แพ็คเกจของทุกบรรทัดที่จะเพิ่ม"
            placeholder="เลือก FG / สินค้า..."
            searchPlaceholder="ค้นหารหัส FG หรือชื่อแพ็คเกจ"
            emptyText={productsError ? REGISTRY_LOAD_FAILED : "ลูกค้ารายนี้ยังไม่มีแพ็คเกจบริการ (หมวด 02-001) ในทะเบียนสินค้า"}
          />
        </div>
        <div className={styles.field}>
          <span>จำนวน (ต่อบรรทัด)</span>
          <MoneyInput min="0" value={qty} onChange={(value) => setQty(value ?? "")} aria-label="จำนวนต่อบรรทัด" aria-invalid={qtyIssue ? "true" : undefined} />
          <small data-bad={qtyIssue ? "yes" : undefined}>
            {qtyIssue || `หน่วย: ${naText(product?.saleUnit)} · เว้นว่างได้ — ใส่ทีละบรรทัดทีหลัง`}
          </small>
        </div>
        <div className={styles.field}>
          <span>ราคา/หน่วย</span>
          <div className={styles.derived} data-empty={product ? undefined : "yes"}>
            {product ? fmtMoney(unitPrice) : "เลือกแพ็คเกจก่อน"}
          </div>
          <small>จากฐานข้อมูลสินค้า</small>
        </div>
      </div>

      <div className={styles.bulkTools}>
        <label className={styles.bulkSearch}>
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหารหัส/ชื่อไซต์ หรือชื่อ/รหัสโซน"
            aria-label="ค้นหาไซต์หรือโซนของลูกค้ารายนี้"
          />
        </label>
        {/* 🔴 R9 (#1817): ยังโหลด/โหลดพัง = ยังไม่รู้จำนวน — "0 ไซต์ · 0 โซน" อ่านเป็นทะเบียนว่าง */}
        <span className={styles.bulkCount}>
          {loading || loadError ? "ยังอ่านทะเบียนไซต์ไม่ได้" : (query
            ? `ตรงคำค้น ${fmtNumber(browser.rows.length)} ไซต์ · ${fmtNumber(browser.shownZones)} โซน (จาก ${fmtNumber(browser.zoneTotal)} โซน)`
            : `${fmtNumber(browser.siteTotal)} ไซต์ · ${fmtNumber(browser.zoneTotal)} โซนในทะเบียน`)}
        </span>
        <span className={styles.bulkGrow} />
        <Button size="sm" variant="quiet" disabled={!count} onClick={() => setSelected(new Set())}>ล้างที่เลือก</Button>
        <Button size="sm" tone="neutral" disabled={!visible.length} onClick={() => toggle(visible, true)}>
          เลือกทุกโซนที่เห็น{visible.length ? ` (${fmtNumber(visible.length)})` : ""}
        </Button>
      </div>

      {loading ? <p className={styles.hint}>กำลังโหลดทะเบียนไซต์…</p> : null}
      {loadError ? <p className={styles.hint}>{loadError}</p> : null}
      {!loading && !loadError && !sites.length ? (
        <p className={styles.hint}>ลูกค้ารายนี้ยังไม่มีไซต์ที่ใช้งานอยู่ในทะเบียน — แจ้งฝ่าย TS เพิ่มไซต์ก่อน</p>
      ) : null}
      {!loading && sites.length > 0 && !browser.rows.length ? (
        <p className={styles.hint}>ไม่มีไซต์หรือโซนที่ตรงคำค้น “{query}”</p>
      ) : null}
      {browser.hiddenPicked > 0 ? (
        <p className={styles.hint}>คำค้นนี้ซ่อนโซนที่ติ๊กไว้แล้ว {fmtNumber(browser.hiddenPicked)} โซน — ยังถูกนับในปุ่มเพิ่มบรรทัด</p>
      ) : null}

      {browser.rows.length ? (
        <ul className={styles.bulkList} aria-label="ไซต์และโซนของลูกค้า">
          {browser.rows.map(({ site, zones, error }) => {
            const choosable = zones.filter((zone) => !whyNot(zone)).map((zone) => zone.id);
            const on = choosable.filter((id) => selected.has(id)).length;
            const all = choosable.length > 0 && on === choosable.length;
            return (
              <li key={site.id} className={styles.bulkSite}>
                <label className={styles.bulkSiteName}>
                  <input
                    type="checkbox"
                    checked={all}
                    ref={(node) => { if (node) node.indeterminate = on > 0 && !all; }}
                    disabled={!choosable.length}
                    onChange={() => toggle(choosable, !all)}
                    aria-label={`ทั้งไซต์ ${site.code || site.name}`}
                  />
                  <span>
                    <b>{site.name}</b>
                    <small className={styles.cellSub}>{site.code}</small>
                  </span>
                </label>
                {error ? (
                  <span className={styles.cellBad}>{error} — ปิดหน้าต่างแล้วกด “ลองอ่านไซต์ที่พังอีกครั้ง”</span>
                ) : (
                  <span className={styles.bulkZones}>
                    {zones.map((zone) => {
                      const why = whyNot(zone);
                      return (
                        <label key={zone.id} className={styles.bulkZone} data-on={selected.has(zone.id) ? "yes" : undefined} data-off={why ? "yes" : undefined} title={why || undefined}>
                          <input
                            type="checkbox"
                            checked={Boolean(why && taken.has(zone.id)) || selected.has(zone.id)}
                            disabled={Boolean(why)}
                            onChange={(event) => toggle([zone.id], event.target.checked)}
                          />
                          <span>{zone.name}</span>
                          <small>{zone.code}</small>
                          {why ? <small>· {why}</small> : null}
                        </label>
                      );
                    })}
                    {!zones.length ? <span className={styles.muted}>ไซต์นี้ยังไม่มีโซนในทะเบียน</span> : null}
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

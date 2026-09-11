"use client";
// ── ช่องของฟอร์มโซนบริการ — ชุดเดียวที่ทุกโมดัลของโซนใช้ ───────────────────────
//
// กฎ AGENTS.md "ฟอร์มแก้ = ฟอร์มสร้าง": ยกออกจาก `ServiceZoneModal` ตอนมีผู้ใช้ที่สอง
// (โมดัล "เพิ่มไซต์ย้อนหลัง" — มติผู้ใช้ 2026-09-11) พร้อมกับที่โซนมีจุดติดตั้งเป็นครั้งแรก
// (mig 0354) ⇒ แก้โซนที่หน้าไซต์ก็แก้จุดได้ด้วยตัวแก้ชุดเดียวกัน ไม่ใช่มีจุดเฉพาะตอนคีย์ของเก่า
//
// ⚠️ "โซน" = พื้นที่ย่อยในไซต์ (Lobby / Reception) — คนละเรื่องกับ "เขตวิ่งงาน"
// (routeZone) ที่อยู่บนฟอร์มไซต์ · "จุดติดตั้ง" = ตำแหน่งวางเครื่อง *ข้างใน* โซน (มติ 29/08)
import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { naText } from "@/lib/format";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import { SPECIAL_FLOORS, normalizeFloor } from "@/lib/service/zoneCode";
import {
  ZONE_SPOT_LABEL_MAX, ZONE_SPOT_MAX, ZONE_SPOT_NOTE_MAX, spotBatchLabels, spotBatchStart,
} from "@/lib/service/zones";
import styles from "./ServiceSiteModal.module.css";
import spotStyles from "./ServiceZoneFields.module.css";

export const ZONE_FORM_EMPTY = { name: "", floor: "", building: "", note: "", isActive: true, spots: [] };

/** แถวโซนจากฐาน → ค่าในฟอร์ม (โหมดแก้) */
export function zoneFormFromRow(zone) {
  return {
    name: zone.name || "",
    floor: zone.floor || "",
    building: zone.building || "",
    note: zone.note || "",
    isActive: zone.isActive !== false,
    // ⚠️ ส่ง id เดิมกลับไปทุกจุด — วันหนึ่งเครื่องจะชี้จุดด้วย id นี้ (lib/service/zones.js)
    spots: Array.isArray(zone.spots)
      ? zone.spots.map((s) => ({ id: s.id, label: s.label || "", note: s.note || "" }))
      : [],
  };
}

/* id ชั่วคราวของจุดที่เพิ่งเพิ่มบนจอ — `new-…` = server ออก id จริงให้ตอนบันทึก
   (กติกาเดียวกับแถวใหม่ในใบประเมิน · normalizeZoneSpots) */
let spotSeq = 0;
const tempSpotId = () => {
  spotSeq += 1;
  return `new-${spotSeq}`;
};

/**
 * ตัวแก้รายการจุดติดตั้งของโซนหนึ่ง
 * ⭐ แก้ตรงในรายการ (ไม่มีร่างแยก) — ฟอร์มยังไม่บันทึกจนกดปุ่มของโมดัล ⇒ ลบ/แก้ที่นี่ย้อนได้ด้วยการปิดโมดัล
 */
function ZoneSpotsEditor({ spots, onChange }) {
  const [openId, setOpenId] = useState(null);
  const [freshId, setFreshId] = useState(null);     // จุดที่เพิ่งกด "เพิ่มจุด" — ปุ่มพูดว่า "เพิ่มจุดนี้"
  const [missingId, setMissingId] = useState(null); // กดปิดทั้งที่ยังไม่มีชื่อ
  const [batch, setBatch] = useState("");

  const list = Array.isArray(spots) ? spots : [];
  const room = Math.max(0, ZONE_SPOT_MAX - list.length);
  const batchCount = Math.floor(Number(batch) || 0);
  const batchStart = spotBatchStart(list);
  const batchLabels = batchCount > 0 ? spotBatchLabels(batchStart, Math.min(batchCount, room)) : [];

  const patch = (id, field, value) => {
    onChange(list.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    if (field === "label" && missingId === id) setMissingId(null);
  };

  const addOne = () => {
    if (!room) return;
    const id = tempSpotId();
    onChange([...list, { id, label: "", note: "" }]);
    setOpenId(id);
    setFreshId(id);
  };

  const addBatch = () => {
    if (!batchLabels.length) return;
    onChange([...list, ...batchLabels.map((label) => ({ id: tempSpotId(), label, note: "" }))]);
    setBatch("");
  };

  const close = (spot) => {
    if (!String(spot.label || "").trim()) { setMissingId(spot.id); return; }
    setOpenId(null);
    setFreshId(null);
  };

  const remove = (id) => {
    onChange(list.filter((s) => s.id !== id));
    if (openId === id) setOpenId(null);
  };

  return (
    <div className={`${styles.field} ${styles.wide}`}>
      <span>จุดติดตั้ง · {list.length} จุด</span>
      {list.length > 0 && (
        <ol className={spotStyles.list}>
          {list.map((spot, index) => {
            const open = openId === spot.id;
            const label = String(spot.label || "").trim();
            return (
              <li key={spot.id} className={spotStyles.row} data-open={open ? "yes" : undefined}>
                <div className={spotStyles.head}>
                  <span className={spotStyles.no}>{index + 1}</span>
                  <span className={spotStyles.label} data-empty={label ? undefined : "yes"}>
                    {open && freshId === spot.id ? "จุดที่กำลังเพิ่ม" : label || "ยังไม่มีชื่อ"}
                  </span>
                  {!open && <span className={spotStyles.note}>{naText(spot.note)}</span>}
                  <span className={spotStyles.tools}>
                    {!open && (
                      <Button iconOnly size="sm" tone="neutral" variant="quiet"
                        aria-label={`แก้จุด ${label || index + 1}`}
                        onClick={() => { setOpenId(spot.id); setFreshId(null); }}
                        icon={<Pencil size={14} aria-hidden="true" />} />
                    )}
                    <Button iconOnly size="sm" tone="danger" variant="quiet"
                      aria-label={`ลบจุด ${label || index + 1}`}
                      onClick={() => remove(spot.id)}
                      icon={<Trash2 size={14} aria-hidden="true" />} />
                  </span>
                </div>
                {open && (
                  <div className={spotStyles.body}>
                    <label className={styles.field}>
                      <span>ชื่อจุด *</span>
                      <Input
                        value={spot.label}
                        onChange={(e) => patch(spot.id, "label", e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); close(spot); } }}
                        placeholder="ข้างประตูทางเข้า"
                        maxLength={ZONE_SPOT_LABEL_MAX}
                        invalid={missingId === spot.id}
                        autoFocus
                      />
                      <small>{missingId === spot.id ? "ใส่ชื่อจุดก่อน — หรือกดถังขยะถ้าไม่ใช้จุดนี้" : "ชื่อที่ช่างใช้หาตำแหน่งตอนเข้าไซต์"}</small>
                    </label>
                    <label className={styles.field}>
                      <span>หมายเหตุ</span>
                      <Input
                        value={spot.note || ""}
                        onChange={(e) => patch(spot.id, "note", e.target.value)}
                        placeholder="ผนังฝั่งซ้าย เหนือชั้นวางโบรชัวร์"
                        maxLength={ZONE_SPOT_NOTE_MAX}
                      />
                    </label>
                    <div className={spotStyles.bodyActions}>
                      <Button size="sm" onClick={() => close(spot)} icon={<Check size={14} aria-hidden="true" />}>
                        {freshId === spot.id ? "เพิ่มจุดนี้" : "เสร็จ"}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* ⭐ ทางลัด "เพิ่มหลายจุด" — ชีตเก่ามักมีแค่ **จำนวนจุด** ไม่มีชื่อ (ม็อก legacy-site ข้อ ②)
          ได้ชื่อ "จุดที่ N" นับต่อจากที่มี ⇒ กดสองรอบไม่ได้ "จุดที่ 1" ซ้ำ · แก้ชื่อทีหลังได้ */}
      <div className={spotStyles.addRow}>
        <Button size="sm" tone="neutral" variant="quiet" onClick={addOne} disabled={!room}
          icon={<Plus size={14} aria-hidden="true" />}>
          เพิ่มจุด
        </Button>
        <span className={spotStyles.or}>หรือ</span>
        <Input
          className={spotStyles.batchInput}
          mono
          inputMode="numeric"
          value={batch}
          onChange={(e) => setBatch(e.target.value.replace(/\D/g, "").slice(0, 3))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBatch(); } }}
          placeholder="5"
          aria-label="จำนวนจุดที่จะเพิ่ม"
        />
        <Button size="sm" onClick={addBatch} disabled={!batchLabels.length}>เพิ่มหลายจุด</Button>
        <small className={spotStyles.addHint}>
          {!room
            ? `ครบ ${ZONE_SPOT_MAX} จุดต่อโซนแล้ว — แยกเป็นอีกโซน`
            : batchLabels.length
              ? `ได้ “${batchLabels[0]}${batchLabels.length > 1 ? `–${batchStart + batchLabels.length}` : ""}” — แก้ชื่อทีหลังได้`
              : "ใช้ตอนชีตมีแค่จำนวนจุดไม่มีชื่อ — ได้ “จุดที่ 1…N” ไว้แก้ชื่อทีหลัง"}
        </small>
      </div>
      <small>เครื่องยังไม่ผูกกับจุด — การเลือกว่าเครื่องตั้งอยู่จุดไหนเป็นงานรอบถัดไป</small>
    </div>
  );
}

/**
 * ช่องทั้งหมดของโซน
 *
 * @param form / setForm ค่าในฟอร์ม (`ZONE_FORM_EMPTY` / `zoneFormFromRow`)
 * @param editing        โหมดแก้ = มีช่องสถานะ · รหัสเดิมไม่เปลี่ยนตามชั้น
 * @param zoneCode       รหัสที่ออกไปแล้ว (โหมดแก้)
 * @param floorHint      ข้อความใต้ช่องชั้นในโหมดสร้าง (ผู้เรียกที่รู้รหัสไซต์โชว์รหัสโซนเต็มได้)
 */
export default function ServiceZoneFields({ form, setForm, editing = false, zoneCode = null, floorHint = null }) {
  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className={styles.grid}>
      <label className={`${styles.field} ${styles.wide}`}>
        <span>ชื่อโซน *</span>
        <Input value={form.name} onChange={set("name")} placeholder="Lobby / ห้องน้ำชั้น 2" maxLength={150} />
        <small>พื้นที่ย่อยในไซต์ที่ติดตามการใช้/รอบบริการแยกกัน — ไม่ใช่เขตวิ่งงานของเจ้าหน้าที่</small>
      </label>

      {/* ── ชั้น (mig 0315) ───────────────────────────────────────────────
          ⭐ **ชั้นเป็นท่อนหนึ่งของรหัสโซน** `ZN-CCCC-FF-DDDDD` ⇒ บังคับกรอก
          ⭐ ชั้นตัวเลขพิมพ์เอง (มี 99 ค่า) · ชั้นพิเศษเป็นชิปให้กด (มี 5 ค่าตายตัว)
             — กติกา "ชุดเล็กกางให้เห็น ชุดยาวค่อยเป็นช่องพิมพ์"
          ⚠️ แก้ชั้นทีหลัง **ไม่เปลี่ยนรหัสที่ออกไปแล้ว** */}
      <label className={styles.field}>
        <span>ชั้น *</span>
        <Input value={form.floor} onChange={set("floor")} placeholder="4" maxLength={10} />
        <OptionTiles
          options={SPECIAL_FLOORS}
          value={SPECIAL_FLOORS.some((f) => f.value === form.floor) ? form.floor : ""}
          onChange={(value) => setForm((prev) => ({ ...prev, floor: value }))}
          ariaLabel="ชั้นพิเศษ"
        />
        <small>
          {editing
            ? `รหัสโซนที่ออกไปแล้วไม่เปลี่ยนตามชั้นที่แก้ — ${zoneCode || "รหัสเดิม"} ยังเป็นตัวเดิม`
            /* ⚠️ โชว์ **ค่าที่จะลงรหัสจริง** (`normalizeFloor`) ไม่ใช่ป้ายที่คนอ่าน
               (`floorLabel`) — พิมพ์ "4" แล้วรหัสได้ `04` · พิมพ์ "G" แล้วได้ `GF` */
            : floorHint || `ตัวเลข 1–99 หรือกดเลือกชั้นพิเศษ — จะเข้าไปอยู่ในรหัสโซนเป็น ${normalizeFloor(form.floor).value || "FF"}`}
        </small>
      </label>

      <label className={styles.field}>
        <span>อาคาร</span>
        <Input value={form.building} onChange={set("building")} placeholder="ตึก A" maxLength={60} />
        <small>ไซต์ที่มีหลายตึก — ไม่อยู่ในรหัส แก้ได้ตลอด</small>
      </label>

      {/* โหมดสร้างไม่มีสถานะ — โซนใหม่เริ่มที่ "ใช้งาน" เสมอ (กฎ AGENTS.md) */}
      {editing && (
        <label className={styles.field}>
          <span>สถานะ</span>
          {/* สองค่า = ปุ่มติ๊กตรง ๆ ไม่ใช่ dropdown (กติกา direct controls) */}
          <label className={styles.inlineCheck}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            <span>ใช้งานอยู่ — ปิดเมื่อพื้นที่นี้เลิกให้บริการ (ประวัติยังอยู่)</span>
          </label>
        </label>
      )}

      <label className={`${styles.field} ${styles.wide}`}>
        <span>หมายเหตุ</span>
        <Input as="textarea" rows={2} value={form.note} onChange={set("note")} maxLength={1000} />
      </label>

      <ZoneSpotsEditor
        spots={form.spots}
        onChange={(spots) => setForm((prev) => ({ ...prev, spots }))}
      />
    </div>
  );
}

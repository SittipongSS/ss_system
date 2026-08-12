# แผนรวม Design System และ Shared Components ทั้งระบบ

สถานะ: แผนสำหรับตรวจทานก่อนเริ่มพัฒนา

ฐานที่ตรวจ: `origin/main @ ef330683` (หลัง PR #743)

วันที่ตรวจ: 26 กรกฎาคม 2026

ภาพอ้างอิงหลัก: หน้าสร้างใบเสนอราคาที่ผู้ใช้เลือกเป็นทิศทางหลัก

## 1. เป้าหมาย

ทำให้ SS System ใช้ภาษาภาพและพฤติกรรมเดียวกันทั้งระบบ โดยครอบคลุม:

- Page shell, navigation, page header และ back navigation
- หน้า list, detail, create/edit และ document workflow
- Card, section, right rail และ summary
- Button, toolbar, form control, tab, filter และ status
- Toast, dialog, confirm, loading, empty และ error state
- Month/date selector และรูปแบบวันที่
- ตารางทั่วไป ตารางแก้ไข ตาราง matrix และ pagination
- Dashboard, KPI, chart, graph, legend และ tooltip
- Responsive, dark mode, keyboard accessibility และ print view

แผนนี้เป็นงาน frontend และ integration ฝั่งหน้าเว็บเป็นหลัก:

- ไม่เปลี่ยน database schema
- ไม่เปลี่ยน API response โดยตั้งใจ
- ไม่เปลี่ยน permission หรือ business workflow
- ไม่เปลี่ยนสูตรคำนวณ KPI/กราฟ
- การเปลี่ยน component ต้องรักษาค่า input/output และ callback contract เดิม

## 2. Design north star จากภาพอ้างอิง

ภาพอ้างอิงกำหนดทิศทางหลักดังนี้:

### 2.1 Brand และสี

- Navy เป็นโครงระบบ: top navigation, brand anchor และบริบทระดับระบบ
- Terracotta/accent ใช้กับ active state และ primary action ที่สำคัญที่สุด
- พื้นหลัง warm cream ใช้เฉพาะระดับ page
- Card และ content surface ใช้สีขาว/`--panel`
- สี success, warning, danger, info ใช้สื่อความหมาย ไม่ใช้ตกแต่ง
- ทุกสีมาจาก token ใน `webapp/src/app/globals.css`
- ห้ามเพิ่ม Material library ภายนอก

### 2.2 Layout

- Navigation หลักเป็น top bar สองแถวตามระบบปัจจุบัน
- เนื้อหาอยู่ใน `Workspace` ที่มีความกว้างและ page padding คงที่
- Page title เป็น surface แยก อ่านง่าย และมี subtitle สั้น
- หน้า detail/create/document ใช้โครง:
  1. Back row
  2. Page header
  3. Overview/hero พร้อม quick facts
  4. Main content
  5. Contextual right rail สำหรับ summary และ action
- Desktop ใช้ content + right rail
- Tablet/mobile ย้าย right rail ลงใน content flow โดยไม่ทำ action สำคัญหาย

### 2.3 Visual hierarchy

- หนึ่งบริบทมี filled primary action เพียงหนึ่งรายการ
- Heading, body, supporting text และ metadata ต้องมีระดับชัดเจน
- ใช้ surface ladder แทนการใส่เส้นขอบซ้อนหลายชั้น
- Card ใหญ่ใช้ `--radius-lg`; control ใช้ `--radius`
- ใช้ shadow เฉพาะ outer surface; ไม่ซ้อน shadow ใน card ย่อย

### 2.4 Density

- Page gap หลัก 16–24px
- Card padding 14–18px
- Toolbar control สูง `--ctl-h`
- Table row padding 10–12px
- Mobile touch target อย่างน้อย 40px
- ตัวเลขใช้ tabular figures; mono ใช้เฉพาะรหัสที่ต้อง scan

### 2.5 Alignment contract ทั้งระบบ

Alignment เป็นส่วนหนึ่งของ component contract ไม่ใช่งานเก็บรายละเอียดท้ายโครงการ ทุกหน้าต้องยึดเส้นอ้างอิงและจังหวะเดียวกัน โดยครอบคลุมทั้ง layout, typography, controls, data visualization และ responsive

#### 2.5.1 Grid และเส้นอ้างอิงหลัก

- ใช้ spacing grid ฐาน 4px และจังหวะหลัก 8/12/16/24/32px
- `Workspace`, back row, page header, toolbar และ content section ต้องเริ่มและจบที่เส้นซ้าย–ขวาเดียวกัน
- ห้ามใช้ page padding เฉพาะหน้าถ้าไม่มี documented exception
- Card ที่อยู่ใน grid แถวเดียวกันต้องสูงเท่ากันเมื่อเป็นข้อมูลชนิดเดียวกัน
- Main content และ contextual right rail ต้องเริ่มที่เส้นบนเดียวกัน
- Section ที่ต่อเนื่องกันใช้ gap จาก token เดียว ห้ามชดเชยด้วย negative margin
- การเยื้องเพื่อแสดง hierarchy ใช้ระดับที่กำหนดไว้เท่านั้น ไม่สร้างค่าเฉพาะหน้า

#### 2.5.2 Typography และ icon alignment

- Heading, subtitle, label, value และ metadata ใช้ line-height ตาม type scale กลาง
- Icon กับข้อความจัดกึ่งกลางตาม optical center ไม่จัดจากขอบ glyph
- Icon container ใช้ขนาดมาตรฐาน 28px, 32px หรือ 40px ตามระดับ component
- Icon ในหัวข้อ section ทุกหน้าต้องมีขนาดและระยะห่างจากข้อความเท่ากัน
- ตัวเลข KPI, เงิน, จำนวน, เปอร์เซ็นต์และวันที่ใช้ tabular figures
- ค่าเงินและตัวเลขในตารางชิดขวา ข้อความชิดซ้าย และสถานะใช้ alignment ตามคอลัมน์เดียวกันทั้ง header/body
- Baseline ของชื่อ KPI และ baseline ของค่าหลักต้องตรงกันใน card แถวเดียวกัน แม้ supporting text จะยาวต่างกัน

#### 2.5.3 Buttons, controls และ toolbar

- Control ใน toolbar desktop สูง `--ctl-h` เท่ากันทั้งหมด
- Control ที่ใช้บน mobile มี touch target อย่างน้อย 40px
- ปุ่มใน action group จัดแนวข้อความและ icon จาก component กลาง ไม่ปรับ padding รายหน้า
- Primary action อยู่ด้านขวาสุดของ action row; secondary เรียงก่อนหน้าอย่างคงที่
- Search, filter, month selector, segmented control และ view toggle ต้องอยู่บน baseline เดียวกัน
- Badge/count ที่อยู่กับหัวข้อไม่ทำให้ตำแหน่งหัวข้อหรือ action ขยับเมื่อค่าจำนวนหลักเปลี่ยน

#### 2.5.4 Forms

- ทุก field ใช้ลำดับ `label → control → helper/error` และ vertical rhythm เดียวกัน
- Label ของ field ในแถวเดียวกันเริ่มที่ baseline เดียวกัน
- Input, select, date/month picker และ searchable select สูงเท่ากันใน density เดียวกัน
- Prefix, suffix, currency, unit และ clear/dropdown icon จัดกึ่งกลางใน control
- Validation message จองพื้นที่หรือ reflow ตาม contract เดียวกัน ห้ามทับ field ถัดไป
- Footer/action bar ของ form จัดตรงกับขอบ content ไม่ลอยออกนอก grid

#### 2.5.5 Tables และรายการ

- Table header และ body ใช้ column definition และ padding ชุดเดียวกัน
- Text column ชิดซ้าย; numeric/money/percent ชิดขวา; selection/status/action ใช้ alignment ที่กำหนด
- ปุ่ม action ในทุกแถวอยู่กึ่งกลางแนวตั้งและกินความกว้างคอลัมน์คงที่
- Sticky header/sticky column ต้องไม่คลาดจาก column หลัง scroll
- Empty, loading, error และ populated state ต้องรักษาความกว้างและตำแหน่ง toolbar/pager เดิม
- Pager summary และ page controls ใช้ตำแหน่งเดียวกันทุก list
- Mobile card view ใช้ label/value grid เดียวกัน และ action ไม่ทำให้ข้อมูลกระโดดเมื่อจำนวนปุ่มต่างกัน

#### 2.5.6 Dashboard, KPI, chart และ graph

- KPI card ใช้ grid, ความสูง, icon box, label baseline, value baseline และ supporting-text zone กลาง
- สี KPI อยู่ที่ icon/text/status เท่านั้น ไม่ใช้แถบสีตกแต่งที่ทำให้ visual weight เอียง
- Actual และข้อมูลที่วัดเป็นช่วงใช้เส้นตรงทึบ; Target ใช้เส้นตรงแบบประ
- เส้นโค้งใช้ได้เฉพาะ series ที่ระบุชัดว่าเป็น Trend/Forecast และเรียกผ่าน chart theme กลาง
- Chart card ใช้ header height, plot padding, legend position และ footer/summary zone เดียวกัน
- กราฟที่วางเทียบกันต้องมี plot area เริ่มตรงกัน โดยจองพื้นที่แกน Y และ legend ให้คงที่
- จุดศูนย์, baseline, tick, gridline และหน่วยแสดงผลใช้ตำแหน่ง/formatter กลาง
- Tooltip ต้องไม่ดัน layout และจัด label/value ตาม grid เดียวกัน
- Loading, empty และ no-permission state ต้องอยู่กึ่งกลาง plot area เดิม ไม่ทำให้ความสูง card เปลี่ยน

#### 2.5.7 Dialog, drawer, toast และ right rail

- Dialog header, content และ footer ใช้ขอบซ้าย–ขวาเดียวกัน
- Drawer section และ right-rail card ใช้ padding/heading alignment ชุดเดียวกับ content card
- Toast stack ใช้ตำแหน่งกลางที่กำหนดและไม่ทับ action bar หรือ document control
- Summary total, breakdown row และ status ใน right rail ใช้ numeric alignment เดียวกัน

#### 2.5.8 Responsive และ print

- Desktop ใช้ page gutter ตาม `Workspace`; tablet/mobile ลด gutter ตาม breakpoint กลางเท่านั้น
- เมื่อ grid ยุบคอลัมน์ ลำดับอ่านและ baseline ภายใน component ต้องคงเดิม
- ห้ามย่อ table จน column alignment เสีย: เลือก horizontal scroll หรือ mobile card ตาม contract
- Mobile heading/action ที่ wrap ต้อง wrap เป็น block ที่คาดการณ์ได้ ไม่จัดกึ่งกลางเฉพาะบางหน้า
- Print ใช้ margin, header, table grid, numeric alignment และ page-break contract กลาง

#### 2.5.9 Alignment QA และ tolerance

- ทำ alignment overlay สำหรับ component showcase และ representative routes
- Component ชนิดเดียวกันในแถวเดียวกันยอมให้คลาดไม่เกิน 1px จาก subpixel rendering
- ขอบ page/section ที่ควรใช้เส้นเดียวกันยอมให้คลาดไม่เกิน 2px ระหว่าง component ต่างชนิด
- ตรวจ long Thai text, ค่าตัวเลขขนาดใหญ่, badge หลายหลัก, validation error และ permission ที่ทำให้จำนวน action เปลี่ยน
- ตรวจทุก breakpoint ใน visual test matrix ทั้ง Light และ Dark
- ห้ามแก้ alignment ด้วย magic number, negative margin หรือ absolute positioning หากไม่มี comment และ documented exception

## 3. ภาพรวม inventory ปัจจุบัน

จาก `origin/main @ ef330683`:

| รายการ | สถานะปัจจุบัน |
|---|---:|
| Application routes | 70 หน้า |
| หน้าใช้ `Workspace` | 50 หน้า |
| หน้าใช้ `SaWorkspace` alias | 9 หน้า |
| Business pages ที่ยังเขียน shell เอง | Product Categories, กลุ่ม Management และ Settings hub |
| ไฟล์ที่มี `<table>` | 66 ไฟล์ |
| ใช้ `premium-table` | 41 ไฟล์ |
| ใช้ `premium-glass-table` | 23 ไฟล์ |
| ใช้ `fz-table` | 5 ไฟล์ |
| ใช้ `table-responsive` | 18 ไฟล์ |
| Recharts runtime renderer | 7 ไฟล์ |
| Custom SVG data visualization | Performance dashboard และ Carry panel |
| ใช้ `KpiCard` | 5 กลุ่มหน้า |
| ใช้ `SaMetric`/Metric strip | 9 กลุ่มหน้า |
| CSS Modules | 30 ไฟล์ |
| หน้า/Component ที่มี inline style | จำนวนมากและกระจายทุกโมดูล |
| `window.confirm` | 16 ไฟล์ |
| `alert()` | 25 ไฟล์ |
| Toast usage | 25 ไฟล์ |
| ConfirmDialog usage/definition | หลาย implementation |

### 3.1 ผลตรวจ `npm run audit:ui`

ผลปัจจุบันยังไม่ผ่าน:

- Design shell coverage รายงาน 69/70 เพราะนับ redirect route เป็นหน้า UI
- พบ raw color 6 จุดใน
  `webapp/src/app/settings/document-standards/page.module.css`
- Audit ปัจจุบันยอมรับเพียงว่าหน้ามี `premium-header` จึงยังไม่แยก
  canonical `Workspace` ออกจาก custom shell

ต้องปรับ audit ให้ตรวจ design contract จริง ไม่ใช่เพียงตรวจชื่อ class บางตัว

## 4. สิ่งที่ยังใช้หลายดีไซน์และมาตรฐานปลายทาง

| กลุ่ม | แบบที่มีอยู่ | มาตรฐานปลายทาง |
|---|---|---|
| Page shell | `Workspace`, `SaWorkspace`, custom `premium-header`, home shell | `Workspace` เป็น canonical; `SaWorkspace` เป็น alias ชั่วคราว; Home/Login เป็น documented exception |
| Detail hero | `SalesDetailOverview`, `detail-hero`, custom headers | ย้ายเป็น `ui/DetailOverview` และใช้ร่วมกับ `DetailPageLayout` |
| Content section | `.glass-panel`, `.ui-section`, `styles.card`, inline card | ใช้ `WorkspaceSection`/`DetailCard`; `.glass-panel` เป็น surface primitive |
| KPI | `KpiCard`, `Metric`, `SaMetric`, Performance KPI custom | คง 2 pattern: `KpiCard` สำหรับ dashboard grid และ `MetricStrip/Metric` สำหรับ summary strip |
| Table | `premium-table`, `premium-glass-table`, `fz-table`, inline table CSS | 3 semantic families: ListTable, EditableTable, MatrixTable แต่ใช้ token/density/status เดียวกัน |
| Pagination | `components/excise/Pager` แต่ถูกใช้ข้ามระบบ | ย้ายเป็น `components/ui/Pager` |
| Chart card | `.chart-card`, `.glass-panel` + inline style, CSS module card | `ChartCard` กลาง |
| Chart tooltip | พื้น `--panel`, `--bg`, `--bg-panel`; radius/shadow หลายแบบ | `ChartTooltip` และ `chartTheme` กลาง |
| Chart palette | palette แยกตามไฟล์ | semantic palette กลางและ series palette กลาง |
| Status | `.status-pill`, `.ui-badge`, `SalesStateBadge`, module badge | `StatusBadge`, `Tag`, `CountBadge` แยกตามความหมาย |
| Tabs | `Tabs`, `.tabs-header`, `.segmented`, custom kind/template tabs | Navigation = `Tabs`; filter/view mode = `SegmentedControl` |
| Buttons | `btn-primary`, `btn-accent`, status buttons, module buttons | action hierarchy เดียว; primary ต่อบริบทเพียงหนึ่ง |
| Dialog | `Modal`, dialog เฉพาะโมดูล, ConfirmDialog 3 แบบ | `Dialog` base + `ConfirmDialog` superset + domain content |
| Feedback | `alert`, Toast state รายหน้า, error panel, StatusNotice | global Toast queue + inline `StatusNotice` ตามประเภท |
| Month | `MonthPicker` ใน salesPlanning และ constants ใน UI file | `ui/MonthPicker` + `lib/datePeriods` |
| Loading | Skeleton, Spinner alias, ข้อความ “กำลังโหลด” | Skeleton สำหรับ content; progress เฉพาะ action |
| Empty | `EmptyState`, custom dash, blank table | `EmptyState`/TableEmpty/ChartEmpty ที่มี contract เดียว |
| Print font | builder เฉพาะ sales/tax/pm | neutral `lib/print/documentFonts` |

## 5. Component architecture เป้าหมาย

### 5.1 Foundation

ไฟล์หลัก:

- `webapp/src/app/globals.css`
- `webapp/src/components/ui/`
- `webapp/src/lib/format.js`
- `webapp/src/lib/ui/`

งาน:

- จัดกลุ่ม CSS เป็น token, foundation, primitives, patterns และ compatibility
- รวม selector ที่ประกาศซ้ำ เช่น `.btn`, `.premium-table`, `.page`,
  `.metric-card`, drawer และ status
- ห้ามลบ compatibility selector จนกว่าผู้ใช้ทั้งหมดจะถูกย้าย
- เพิ่ม static audit:
  - raw colors นอก allowlist
  - domain import ของ component กลาง
  - dead classes
  - page shell coverage
  - icon button ที่ไม่มี accessible name
  - chart ที่ไม่มี empty state/summary

### 5.2 Page และ layout

Canonical components:

- `Workspace`
- `WorkspaceSection`
- `DetailPageLayout`
- `DetailOverview`
- `ContextualRightRail`
- `DetailCard`
- `ContextCard`
- `DocumentSummaryCard`
- `DocumentControlCard`

Contract:

- Page list/dashboard ใช้ `Workspace`
- หน้า detail/create/document ใช้ `Workspace + DetailPageLayout`
- Header action ไม่เกิน action หลักหนึ่งรายการและ secondary actions ตามจำเป็น
- Right rail กว้างคงที่, sticky เฉพาะ desktop และไม่บัง footer/control
- Mobile DOM order ต้องเป็น overview → action summary → content หรือ
  overview → content → action ตามความเร่งด่วนของ workflow

### 5.3 Surface และ card

ไม่สร้าง generic Card component ที่รับ props จำนวนมากเกินไป ให้ใช้:

- `.glass-panel` เป็น surface primitive
- `WorkspaceSection` สำหรับ section ที่มี header/body
- `DetailCard` สำหรับข้อมูลหนึ่งหัวข้อในหน้า detail
- `KpiCard` สำหรับตัวเลขสำคัญ
- `ChartCard` สำหรับ visualization
- Navigation card สำหรับหน้า Home/Settings

กฎ:

- ห้าม nested border/shadow โดยไม่จำเป็น
- ห้ามใช้ KPI card เป็นเมนูหลัก
- Card clickable ต้อง render เป็น `<button>`/`<a>` และมี focus state

### 5.4 Action และ button

มาตรฐาน:

- Primary: `.btn.btn-accent`
- Brand/top-level primary: `.btn.btn-primary` เฉพาะบริบท navy/system
- Secondary: `.btn`
- Tertiary: `.btn.ghost`
- Icon: `.btn-icon` พร้อม `aria-label`
- Destructive: `.btn-danger`
- Approve/hold: ใช้ semantic action kind ผ่าน `ActionButtons`

ต้องแก้:

- หน้าที่มี filled action หลายปุ่มใน section เดียว
- ปุ่ม custom ใน CSS module ที่ซ้ำกับ shared class
- ปุ่มไม่มี `type="button"` ใน form
- icon-only button ที่มีเพียง `title`

### 5.5 Form controls

Canonical:

- `premium-input`
- `textarea-premium`
- `Select`
- `SearchableSelect`
- `DateInput`, `DateTimeInput`, `TimeInput`
- `MonthPicker`
- `MoneyInput`, `MaskedNumberInput`, `PhoneInput`, `NationalIdInput`
- `FormActions`

งาน:

- รวม label, hint, required, error และ disabled layout
- ใช้ create/edit form component เดียวตาม `webapp/AGENTS.md`
- ห้าม auto-save
- ทุก edit flow มี Cancel + Save และ confirm ตามระดับความเสี่ยง
- ตรวจ field width, paired fields และ mobile stacking
- `textarea` ทุกจุดใช้ sans font ยกเว้นข้อมูลที่เป็น code จริง

### 5.6 Status, badge, chip

สร้าง contract ที่แยกความหมาย:

- `StatusBadge`: workflow state พร้อม dot/icon และ label
- `Tag`: category/attribute ที่ไม่ใช่สถานะ
- `CountBadge`: ตัวเลขกำกับ tab/queue
- `FilterChip`: filter ที่ถอดออกได้

การย้าย:

- `SalesStateBadge` → `ui/StatusBadge`
- `components/excise/StatusBadge` → mapping data เท่านั้น
- `ApprovalStatus`, `OrderStatusPill`, `ProductStatusPill` ใช้ primitive เดียว
- `.pill`, `.status-pill`, `.ui-badge` คงเป็น compatibility ระหว่าง rollout

### 5.7 Tabs และ view switcher

- `Tabs`: เปลี่ยน section/page ในบริบทเดียวกัน ใช้ underline
- `SegmentedControl`: filter, scope, unit และ view mode
- `ViewSwitcher`: list/table/card/document view
- ห้ามทำ custom `kindTabs` หรือ `templateTabs` ใหม่
- Settings Commercial Presets และ Workflow Templates ต้องย้ายมาใช้ shared
  component เมื่อ behavior ตรงกัน

### 5.8 Toast, notice และ confirm

#### Toast

สร้าง:

- `ToastProvider`
- `useToast()`
- queue หลายข้อความ
- portal/layer กลาง
- placement ที่ไม่บัง Document Control และ action bar
- success/error/warning/info
- optional action
- pause เมื่อ hover/focus
- reduced motion

ไม่ควรเปลี่ยน `alert()` 25 ไฟล์เป็น local `useState` Toast ทีละหน้า เพราะจะ
เพิ่ม boilerplate และ toast ใหม่อาจทับข้อความเดิม

#### ConfirmDialog

รวม behavior ของ 3 implementation:

- controlled open/close
- tone: default/danger
- async confirm
- busy/disabled
- inline error
- optional cancel
- close-on-success configurable
- focus trap, Escape และ restore focus

แยก migration เป็น:

1. สร้าง superset API และ tests
2. ย้าย tax/excise variants
3. ย้าย native `window.confirm` ทีละโมดูล
4. ลบ compatibility หลังไม่มี consumer

### 5.9 Date และ Month

สร้าง:

- `webapp/src/lib/datePeriods.js`
- `webapp/src/components/ui/MonthPicker.js`

ย้ายออกจาก `components/salesPlanning/ui.js`:

- `MONTH_LABELS`
- `monthsForYear`
- `thisMonth`

MonthPicker v2 ต้องรองรับ:

- value เป็น `YYYY-MM`
- `min`/`max`
- disabled/readOnly
- configurable year range
- current month shortcut
- all-months mode เฉพาะหน้าที่ต้องใช้
- Thai labels
- keyboard navigation
- mobile layout
- พ.ศ./ค.ศ. ตาม decision กลาง โดยไม่เปลี่ยน API value

### 5.10 Dialog, drawer และ modal

สร้าง base contract เดียว:

- size: sm/md/lg/xl
- centered dialog หรือ right drawer
- header/body/footer slots
- internal scroll
- sticky footer ที่ไม่ทับ content
- close button ตำแหน่งเดียวกัน
- focus trap และ restore focus
- mobile full-screen

Domain dialog ยังคงอยู่ได้ แต่ต้องใช้ base เดียว เช่น:

- Excise approval/file/receive flows
- PM task/project form
- Sales quotation won/reason flow
- Management meeting/task form

## 6. ตาราง: แผนรวมโดยไม่ over-abstract

มีตาราง 66 ไฟล์และลักษณะต่างกันมาก จึงไม่สร้าง DataTable แบบ `columns + rows`
ตัวเดียวแล้วบังคับทุก use case

### 6.1 Table families

#### A. ListTable

ใช้กับ:

- Customer, Product, Product Category
- Lead, Deal, Quotation, Sales Order
- Project, Inquiry, Task
- Tax registration/filing/report
- Users และ Audit

ประกอบด้วย:

- `TableShell`
- `TableToolbar`
- `TableScroll`
- semantic `<table>`
- `TableEmpty`
- `Pager`

รองรับ:

- sticky header
- sortable header
- clickable row + keyboard
- row action
- numeric alignment
- server/client pagination
- mobile card alternative เมื่อการเทียบข้ามคอลัมน์ไม่สำคัญ

#### B. EditableTable

ใช้กับ:

- Quotation line items
- Installments
- Material price tiers
- Forecast/PO forms
- Costing request rows

กฎ:

- ไม่ใช้ clickable row ซ้อนกับ input
- error แสดงระดับ cell และ summary
- action column คงตำแหน่ง
- footer total อยู่ใน scroll context เดียวกัน
- keyboard order ต้องตามซ้ายไปขวา/บนลงล่าง
- mobile ใช้ row card editor เมื่อคอลัมน์แคบเกินไป

#### C. MatrixTable

ใช้กับ:

- Targets plan/history
- Forecast comparison
- Year heatmap
- Performance summary/morning board
- Po vs FC

กฎ:

- sticky first column และ header
- horizontal scroll เป็นพฤติกรรมที่ตั้งใจ
- มี scroll shadow/affordance
- column width คงที่
- total/variance ใช้ semantic color และ icon/text ร่วมกัน
- mobile ไม่บีบทุกเดือนลงจอ; ใช้ scroll หรือ period window

#### D. PrintTable

ใช้เฉพาะ HTML/PDF builders:

- Quotation/Sales Order
- Tax bill/report
- PM Gantt/document

ไม่ใช้ runtime UI table component แต่ใช้ formatter, font และ print tokens กลาง

### 6.2 Table CSS เป้าหมาย

ระหว่าง rollout:

- `.premium-table` → canonical list/editable base
- `.premium-glass-table` → compatibility alias แล้วค่อยเลิกใช้
- `.fz-table` → เปลี่ยนชื่อความหมายเป็น `.matrix-table`
- `.table-responsive` → `TableScroll`/`.scroll-x-container`

เกณฑ์สำเร็จ:

- ไม่มี page-level horizontal overflow
- wide table scroll ภายใน container
- header/footer ไม่ทับ row หรือ scrollbar
- empty/loading/error ไม่ render เป็นแถวข้อความแบบ ad hoc
- number/date/status formatter เป็นกลาง

## 7. Dashboard, KPI และกราฟ

### 7.1 Dashboard composition

โครงมาตรฐาน:

1. `Workspace` header
2. Global dashboard filters
3. `KpiGrid` หรือ `MetricStrip`
4. Primary chart grid
5. Work queue/action list
6. Supporting tables

Dashboard ต้องตอบคำถามตามลำดับ:

- ตอนนี้เกิดอะไรขึ้น
- เทียบกับเป้าหมาย/ช่วงก่อนเป็นอย่างไร
- อะไรต้องดำเนินการต่อ
- กดลงรายละเอียดได้ที่ไหน

### 7.2 KPI standards

ใช้เพียงสอง pattern:

#### `KpiCard`

- ใช้ใน dashboard grid
- label → value → comparison/hint
- clickable ได้เมื่อพาไป drill-down
- tone ใช้กับ accent/indicator ไม่ย้อมทั้ง card

#### `MetricStrip/Metric`

- ใช้เป็น summary strip ภายในหน้า list/detail
- เหมาะกับข้อมูล 3–6 ค่าในแนวนอน
- ยุบเป็น 2 คอลัมน์/1 คอลัมน์ตาม breakpoint

ต้องย้าย:

- Performance KPI custom ให้ใช้ visual contract เดียว
- `SaMetric` คงเป็น alias ระหว่าง rolloutแล้วค่อย import จาก `ui/Workspace`
- legacy `.metric-card`/`.stat-card` ตรวจ consumer ก่อนลดเหลือ compatibility

### 7.3 Chart primitives

เพิ่ม:

- `ChartCard`
- `ChartHeader`
- `ChartLegend`
- `ChartTooltip`
- `ChartEmptyState`
- `ChartSummary`
- `chartTheme`
- `chartSeriesPalette`

`chartTheme` กำหนด:

- axis tick: 11–12px `--text-3`
- grid: `--border`
- tooltip: `--panel`, `--border`, `--shadow-lg`, `--radius`
- legend: 12px `--text-2`
- focus/active cursor
- compact money/number/percent formatter
- animation off เมื่อ reduced motion

### 7.4 Semantic chart colors

- Actual/main series: `--accent` หรือ `--green` ตามความหมายที่ตกลง
- Target/reference: `--blue`
- Success/complete: `--green`
- Warning/gap: `--amber`
- Negative/overdue: `--red`
- Neutral/history: `--text-3`
- Category series: accent, blue, green, violet, amber, teal ตามลำดับคงที่

ห้ามใช้สีเดียวกันคนละความหมายใน dashboard เดียว

### 7.5 Chart accessibility

ทุกกราฟต้องมี:

- ชื่อและช่วงข้อมูล
- empty/loading/error state
- accessible summary
- table alternative เมื่อข้อมูลใช้ตัดสินใจสำคัญ
- tooltip ที่ keyboard/focus เข้าถึงได้ หรือ summary/table ทดแทน
- สีไม่เป็นสัญญาณเพียงอย่างเดียว

### 7.6 จุดที่ต้องรวมปัจจุบัน

#### Database dashboard

- ใช้ `KpiCard` แล้ว
- ย้าย 3 chart cards และ action queue เข้าสู่ dashboard grid กลาง
- ลบ tooltip/height/legend inline config ที่ซ้ำ
- chart height ใช้ responsive size token

#### Sahamit dashboard/analytics

- `DashboardCharts`, `FcRoundsView`, `FcVsPoView`, `GrowthView`
- รวม tooltip ที่ปัจจุบันใช้ทั้ง `--bg` และ custom shadow
- รวม round palette
- เพิ่ม chart summary และ mobile legend
- ตาราง follow-up ใช้ ListTable compact

#### PM Sales KPI

- ย้าย 2 Recharts graphs เข้า `ChartCard`
- ใช้ formatter กลาง
- ลบ hardcoded `rgba()` shadow
- ตรวจ click/drill-down และ keyboard

#### Tax/Excise

- `TaxDashboardCharts` ใช้ `--bg-panel` ซึ่งต้องตรวจ/เปลี่ยนเป็น token ที่มีจริง
- รวม status palette กับ `StatusBadge`
- chart ต้องใช้ Card/Tooltip/Legend กลาง

#### Sales performance

- `PerformanceCharts` และ `CarryPanel` เป็น custom SVG
- ไม่จำเป็นต้องย้ายเป็น Recharts หาก behavior ปัจจุบันเหมาะกว่า
- ต้องใช้ `ChartCard`, palette, axis typography, tooltip และ empty state กลาง
- `YearHeatmap` จัดเป็น MatrixTable ไม่ใช่ chart card ธรรมดา

## 8. แผนรายโมดูล

### 8.1 Global navigation และ Home

ไฟล์หลัก:

- `webapp/src/components/AppLayout.js`
- `webapp/src/app/home/page.js`
- `webapp/src/app/globals.css`

งาน:

- รักษา top navigation สองแถวตามภาพ
- ตรวจ active state, overflow และ mobile menu
- Home hub เป็น documented exception เพราะเป็น launchpad ไม่ใช่ application workspace
- Navigation card ใช้ surface/hover/focus/token กลาง
- ไม่เพิ่ม sidebar, bottom navigation หรือ FAB

### 8.2 Database

หน้าที่เกี่ยวข้อง: 7 หน้า

งาน:

- Dashboard: ChartCard/ChartTheme/KpiGrid
- Products/Customers list: ListTable + Pager + card/table view contract
- Product/Customer detail: DetailOverview + DetailPageLayout
- Product Categories: ย้าย custom header เข้า Workspace
- Product Category Import: ใช้ Tabs/Table/StatusNotice กลาง
- รวม status ของ approval/active/archive
- รักษา product identity formatter และ permission เดิม

### 8.3 Management

หน้าที่เกี่ยวข้อง: Overview, Calendar, Meetings, Rocks, Tasks, Trash

เป็นกลุ่มที่ drift มากที่สุด:

- หลายหน้าเขียน `premium-header` และ card inline
- Tasks ใช้ `<table>` พร้อม inline cell CSS
- Meeting/Rock cards มี button/pill/form layout เฉพาะหน้า

งาน:

- ย้ายทุกหน้ามาใช้ Workspace
- Overview ใช้ KpiCard + WorkspaceSection
- Tasks ใช้ toolbar + ListTable + Pager
- Meetings ใช้ responsive card list และ shared empty state
- Rocks ใช้ editable section/form action contract
- Calendar ใช้ toolbar/month navigation กลาง
- Trash ใช้ compact list + confirm dialog กลาง

### 8.4 Project Management

หน้าที่เกี่ยวข้อง: Task list/detail และ project components

งาน:

- Task list: MetricStrip, toolbar, list/table view และ Pager กลาง
- Task detail: DetailOverview/DetailPageLayout
- Forms: shared Dialog/Drawer และ form controls
- Project document/timeline: standard section/card/action hierarchy
- Sales KPI dashboard: ChartCard/ChartTheme
- Gantt: รักษา specialized visualization แต่ใช้ typography/status/print font กลาง

### 8.5 Sales Administration / SA

หน้าที่เกี่ยวข้อง: Dashboard, Project, Inquiry, Costing, Material

งาน:

- ลด `SaWorkspace` ให้เป็น compatibility alias แล้ว import canonical component
- Project/Inquiry list ใช้ MetricStrip + ListTable + Pager
- Detail pages ใช้ DetailOverview + ContextualRightRail แบบภาพ
- Costing และ Material Ask ใช้ DocumentSummary/Control pattern
- Material registry/asks ใช้ shared Tabs, toolbar, status และ editable table
- Project target/performance ใช้ MatrixTable/Chart system ตามประเภท

### 8.6 Sahamit

หน้าที่เกี่ยวข้อง: Dashboard, Forecast, PO, Material, Review, Reconcile

งาน:

- Dashboard และ analytics ใช้ chart system กลาง
- Forecast/PO/Material ใช้ MatrixTable/EditableTable ตามหน้าที่
- Forecast new/edit ใช้ form เดียวกัน
- PO new/edit ใช้ `PoForm` เดียวกัน
- Reconcile/Review ใช้ status, expandable row และ empty/error กลาง
- Pager ย้ายออกจาก excise namespace
- Date/month filters ใช้ date period utilities กลาง

### 8.7 Sales Planning

หน้าที่เกี่ยวข้อง: Lead, Deal, Quotation, Sales Order, Target

งาน:

- List pages ใช้ canonical Workspace, MetricStrip, toolbar, table และ Pager
- Detail/create pagesยึดหน้าสร้างใบเสนอราคาเป็น north star
- ย้าย `SalesDetailOverview` เป็น `ui/DetailOverview`
- Document right rail ใช้ DocumentSummary/Control อย่างสม่ำเสมอ
- Target plan/history ใช้ MatrixTable
- Performance dashboard ใช้ KPI/Chart system
- MonthPicker และ month constants ย้ายออกจาก sales domain
- Tabs, status และ workflow actions ใช้ shared components

### 8.8 Tax/Excise

หน้าที่เกี่ยวข้อง: Overview, Registrations, Filings, Reports

งาน:

- Overview ใช้ KpiCard/Section/Chart contract
- DataList ย้าย table shell ที่ generic ไป `ui`
- Pager ย้ายไป `ui/Pager`
- ConfirmModal/ConfirmDialog รวมเข้ากับ ConfirmDialog กลาง
- StatusBadge ใช้ primitive กลางแต่ mapping workflow อยู่ใน tax domain
- Detail pagesคง DocumentSummary/Control + right rail
- Print report/bill ใช้ print font module กลาง

### 8.9 Settings/Admin

หน้าที่เกี่ยวข้อง: Settings hub และ 9 หน้าย่อย

งาน:

- Settings hub คง navigation-card layout แต่ใช้ Workspace header contract
- Company/Commercial/Document/Workflow ใช้ VersionControlCard เดียว
- custom tabs ของ Commercial Presets และ Workflow Templates ย้ายไป Tabs/Segmented
- แก้ raw colors 6 จุดใน Document Standards CSS module
- Holidays ใช้ calendar controls, status และ table/list contract กลาง
- Signature coverage ใช้ KpiCard + ListTable
- Chat webhooks ใช้ StatusNotice/ConfirmDialog/Toast กลาง

### 8.10 Account, Users และ Audit

งาน:

- Account/Signature Vault รักษา security workflow แต่ใช้ form/dialog/status กลาง
- Users ใช้ ListTable + Pager + shared fields สำหรับ create/edit
- Transfer month ใช้ MonthPicker v2
- Audit ใช้ filter toolbar + ListTable + Pager
- Change password และ signature modal ใช้ Dialog base

### 8.11 Print และ generated documents

งาน:

- แยก font CSS ไป `webapp/src/lib/print/documentFonts.js`
- Sales, Tax และ PM import จาก neutral module
- ใช้ logo ผ่าน `lib/printHeader.js`
- ไม่บังคับ print table ใช้ runtime React table
- ตรวจ A4, page break, black-and-white และ Thai font

## 9. Rollout plan เป็นชุด PR

ห้ามรวมทั้งหมดใน PR เดียว

### PR UI-00 — Baseline, inventory และ design contracts

ขอบเขต:

- บันทึก route/component inventory
- สร้าง visual test matrix
- ระบุ documented exceptions: Home, Login, Redirect, Print
- อัปเดต `audit-ui.mjs` ให้รายงาน canonical/compatibility/custom
- เพิ่ม component showcase สำหรับสถานะทั้งหมด โดยไม่ expose production

เกณฑ์ผ่าน:

- มี baseline light/dark ที่ 1440px และ 390px สำหรับ representative pages
- audit ไม่ false positive กับ redirect route
- ยังไม่เปลี่ยน production UI

### PR UI-01 — CSS foundation และ token cleanup

ขอบเขต:

- แก้ raw colors 6 จุด
- รวม selector ซ้ำที่พิสูจน์ว่า cascade ไม่เปลี่ยน
- กำหนด compatibility section ใน globals.css
- เพิ่ม chart/table/layout tokens ที่จำเป็น
- เพิ่ม spacing, gutter, icon-box, control-height และ alignment tokens ที่ขาด
- เพิ่ม alignment showcase สำหรับ page, toolbar, form, KPI, table, chart, dialog และ right rail

เกณฑ์ผ่าน:

- `npm run audit:ui` ผ่าน
- dark mode ไม่ regression
- screenshot diff เฉพาะจุดที่ตั้งใจ
- alignment overlay ของ component กลางผ่าน tolerance ที่กำหนด

### PR UI-02 — Feedback foundation

ขอบเขต:

- ToastProvider/useToast/queue/portal
- ConfirmDialog superset API
- StatusNotice variants
- tests ของ busy/error/hide-cancel/queue/focus

ยังไม่ bulk replace consumer

### PR UI-03 — Date, Month, Status, Tabs และ Pager

ขอบเขต:

- `lib/datePeriods`
- `ui/MonthPicker`
- `ui/StatusBadge`, Tag, CountBadge
- shared Tabs/Segmented contract
- ย้าย `components/excise/Pager` → `components/ui/Pager`
- compatibility re-export ระหว่าง migration

เกณฑ์ผ่าน:

- Month API value ยังคง `YYYY-MM`
- min/max และ range behavior มี tests
- consumer เดิมไม่เสีย pagination state

### PR UI-04 — Detail/layout primitives

ขอบเขต:

- ย้าย SalesDetailOverview → ui/DetailOverview
- รวมกับ DetailPageLayout/ContextualRightRail
- responsive right rail
- compatibility export ชั่วคราว

Representative pages:

- New Quotation
- Quotation detail
- Sales Order detail
- Costing detail
- Tax filing detail

### PR UI-05 — Page shell migration

ขอบเขต:

- Product Categories
- Management Overview/Meetings/Rocks/Tasks/Trash
- Settings hub header

ไม่เปลี่ยน business logic

### PR UI-06 — Table foundation

ขอบเขต:

- TableShell, TableToolbar, TableScroll, TableEmpty
- ListTable/EditableTable/MatrixTable CSS contracts
- responsive and sticky behavior
- ไม่สร้าง data-driven columns API

### PR UI-07 — List tables wave A

ขอบเขต:

- Database lists
- Users
- Audit
- Settings lists
- Tax DataList

เกณฑ์ผ่าน:

- sorting/filter/pagination เหมือนเดิม
- keyboard row navigation
- empty/loading/error ครบ

### PR UI-08 — List tables wave B

ขอบเขต:

- Lead, Deal, Quotation, Sales Order
- Project, Inquiry, Task
- Sahamit PO/Material/Review/Reconcile

### PR UI-09 — Editable และ Matrix tables

ขอบเขต:

- Quotation lines/installments
- Material price tiers
- Forecast/PO forms
- Target plan/history
- YearHeatmap, MorningBoard (SummaryTable ถูกยุบรวมเข้า MorningBoard แล้ว 2026-08-12 — ตารางเดียว สลับงวดเป็น "ปี" ได้คอลัมน์ ต้องทำ/เดือน · YoY · สถานะ · ตัวคุมงวดกับสวิตช์ทบยอดย้ายไป `PeriodBar` ระดับแท็บ ใช้ `ui/Segmented` ทั้งหมด)

แยก sub-PR ได้หาก diff ใหญ่

### PR UI-10 — Dashboard foundation

ขอบเขต:

- KpiGrid contract
- KpiCard/MetricStrip alignment
- ChartCard/Header/Legend/Tooltip/Empty/Summary
- chartTheme และ palette
- accessibility contract

### PR UI-11 — Dashboard wave A

ขอบเขต:

- Database dashboard
- Tax/Excise dashboard
- Management overview
- Signature coverage

### PR UI-12 — Dashboard wave B

ขอบเขต:

- SA dashboard
- Sales performance
- PM Sales KPI

Custom SVG ยังใช้ได้ แต่ต้องอยู่ใน ChartCard และ theme กลาง

### PR UI-13 — Dashboard wave C

ขอบเขต:

- Sahamit DashboardCharts
- FcRoundsView
- FcVsPoView
- GrowthView
- supporting tables/queues

### PR UI-14 — Forms, dialogs และ module-specific cleanup

ขอบเขต:

- ย้าย dialog/drawer ไป base contract
- ย้าย create/edit ให้ใช้ fields component เดียว
- ลบ local button/status/tab styles ที่ไม่มี consumer
- แก้ ReasonDialog typography

### PR UI-15 — Native feedback migration

ขอบเขต:

- ย้าย `window.confirm` ทีละโมดูล
- ย้าย `alert()` ทีละโมดูล
- ใช้ ToastProvider
- ลบ compatibility dialog เมื่อ consumer เป็นศูนย์

ควรแยกย่อยตาม Database, Management, SA/Sales, Sahamit, Settings/Tax

### PR UI-16 — Print font และ final enforcement

ขอบเขต:

- neutral print font module
- อัปเดต print builders
- เพิ่ม CI guardrails
- ลบ CSS/component compatibility ที่ไม่มี consumer
- อัปเดต rulebook และ component map

## 10. Visual test matrix

Representative routes:

| Pattern | Route |
|---|---|
| Home/navigation | `/home` |
| Dashboard | `/database`, `/sa/dashboard`, `/sahamit`, `/tax` |
| List table | `/database/products`, `/sales-planning/deals`, `/users` |
| Matrix table | `/sales-planning/targets/plan`, forecast/performance |
| Create document | `/sales-planning/quotations/new` |
| Detail + right rail | quotation, sales order, tax filing, costing |
| Settings/versioned form | company, workflow templates, document standards |
| Dialog/drawer | task form, product form, approval/reason dialog |

Viewport:

- 1920×1080
- 1440×900
- 1024×768
- 768×1024
- 390×844

State:

- Light/Dark
- Default/Hover/Focus/Disabled
- Loading/Empty/Error/Partial data
- Long Thai text
- Large money/quantity values
- Permission with and without edit/action
- Badge/count ตั้งแต่ 1–4 หลัก
- Form ที่มีและไม่มี helper/validation error
- Table ที่มี row action ต่างจำนวนกัน
- Chart ที่ legend/แกน/หน่วยยาวต่างกัน

Alignment checks:

- เปิด overlay ตรวจ page gutter และเส้นเริ่มต้นของ back row/header/toolbar/content
- ตรวจ baseline ของ icon, label, heading, KPI value และ action ใน card แถวเดียวกัน
- ตรวจ column header/body, numeric alignment, sticky column และ pager
- ตรวจ plot-area alignment ของกราฟที่วางเทียบกัน
- ตรวจ dialog/drawer/right rail และ toast ไม่ทับ action area
- ตรวจ reflow หลังสลับ breakpoint โดยไม่มี magic offset หรือ page-level overflow

## 11. Automated acceptance

ทุก PR ต้องรัน:

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run audit:ui`

เพิ่ม tests สำหรับ:

- Toast queue และ placement contract
- ConfirmDialog async/busy/error/focus
- MonthPicker min/max/year range/value
- Pager page reset/page size
- format money/number/date/percent
- action hierarchy mapping
- table state helpers
- chart formatter/palette mapping

Static gates หลัง rollout:

- ไม่มี runtime raw hex/rgb นอก allowlist
- ไม่มี import `components/excise/Pager`
- ไม่มี import `components/salesPlanning/SalesDetailOverview`
- ไม่มี date constants อยู่ใน sales UI file
- ไม่มี native `window.confirm`
- ไม่มี native `alert()`
- ไม่มี dead classes
- redirect routes ไม่ถูกนับเป็น visual page

## 12. Definition of Done

- ทุก business page ใช้ canonical shell หรือมี documented exception
- ภาพรวมสี/spacing/type/action ตรงกับ north star
- Page edge, section edge, typography baseline และ component alignment ผ่าน contract ทั้งระบบ
- หน้า detail/document ใช้ overview + content + contextual rail ภาษาเดียวกัน
- Dashboard ใช้ KPI และ chart contract กลาง
- KPI, table และ chart ที่อยู่ในกลุ่มเดียวกันมีความสูง/แกน/column alignment ตาม tolerance
- ตารางทุกชนิดอยู่ใน family ที่ระบุและไม่มี page-level overflow
- Status, tab, filter, feedback และ form controls มีความหมายคงที่ทั้งระบบ
- Light/Dark/Desktop/Tablet/Mobile ผ่าน
- Keyboard และ focus ผ่าน
- ไม่มี API/schema/business-rule regression
- มี before/after evidence
- ผู้ใช้ UAT representative routes ครบทุก pattern

## 13. Decisions ที่ต้องยืนยันก่อน implementation

1. ปีที่แสดงต่อผู้ใช้ใช้ พ.ศ. ทั้งระบบหรือแยกตามบริบท
2. Actual/Target/Forecast จะใช้สี semantic ใดเป็นมาตรฐานข้ามทุก dashboard
3. Mobile list ใดต้องเป็น card view และ list ใดต้องรักษาตารางแบบ horizontal scroll
4. Toast default placement: bottom-center เหนือ action area หรือ top-right
5. Detail right rail บน mobile ควรขึ้นก่อน content หรือหลัง contentในแต่ละ workflow
6. Compatibility period: เก็บ alias หนึ่ง release หรือย้าย consumerทั้งหมดใน PR เดียวของแต่ละ component

คำแนะนำ:

- ใช้ พ.ศ. สำหรับ display ภาษาไทย แต่เก็บ/ส่ง API เป็น ISO/ค.ศ.
- Actual = accent/green ตามบริบท, Target = blue, Risk/Gap = amber/red
- ตารางที่ต้องเทียบหลายคอลัมน์ใช้ horizontal scroll; รายการที่เน้นอ่านทีละ record ใช้ card view
- Toast ใช้ bottom-center แต่ต้องคำนวณพื้นที่ Document Control/action bar
- Critical document action rail ขึ้นก่อน content บน mobile; informational rail อยู่หลัง content
- เก็บ compatibility alias หนึ่ง release แล้วลบด้วย static gate

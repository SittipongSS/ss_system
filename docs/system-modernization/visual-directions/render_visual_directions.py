from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from svglib.svglib import svg2rlg


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "output" / "pdf" / "quotation-visual-directions.pdf"
RENDER_DIR = ROOT / "docs" / "system-modernization" / "visual-directions" / "renders"
TMP_DIR = ROOT / "tmp" / "pdfs"
LOGO_SOURCE = ROOT / "webapp" / "public" / "scent-sense-logo.svg"

PAGE_W, PAGE_H = A4

NAVY = HexColor("#21385e")
NAVY_2 = HexColor("#304f79")
ACCENT = HexColor("#c17a52")
ACCENT_SOFT = HexColor("#f6e7dd")
INK = HexColor("#1a1e27")
TEXT_2 = HexColor("#505866")
TEXT_3 = HexColor("#777b84")
LINE = HexColor("#d8d4cc")
LINE_STRONG = HexColor("#a9a59d")
WARM = HexColor("#f7f3ec")
WARM_2 = HexColor("#eee7dc")
ROW_ALT = HexColor("#fbfaf7")

REGULAR = "Tahoma"
BOLD = "Tahoma-Bold"


ROWS = [
    {
        "name": "ก้านไม้หอมปรับอากาศ 100 ml",
        "detail": "FG-RD-100 · กลิ่น Signature Bloom · บรรจุกล่องมาตรฐาน",
        "qty": "1,000",
        "price": "185.00",
        "amount": "185,000.00",
    },
    {
        "name": "สเปรย์ปรับอากาศ 250 ml",
        "detail": "FG-RS-250 · กลิ่น Signature Bloom · ฉลากลูกค้า",
        "qty": "500",
        "price": "220.00",
        "amount": "110,000.00",
    },
    {
        "name": "ค่าพัฒนากลิ่นและตัวอย่าง",
        "detail": "บริการพัฒนาสูตรและตัวอย่างก่อนผลิตจริง",
        "qty": "1",
        "price": "25,000.00",
        "amount": "25,000.00",
    },
]


def register_fonts():
    pdfmetrics.registerFont(TTFont(REGULAR, r"C:\Windows\Fonts\tahoma.ttf"))
    pdfmetrics.registerFont(TTFont(BOLD, r"C:\Windows\Fonts\tahomabd.ttf"))


def prepare_logo():
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    temp_svg = TMP_DIR / "scent-sense-logo-navy.svg"
    source = LOGO_SOURCE.read_text(encoding="utf-8")
    temp_svg.write_text(source.replace('fill="currentColor"', 'fill="#21385e"'), encoding="utf-8")
    drawing = svg2rlg(str(temp_svg))
    temp_svg.unlink(missing_ok=True)
    return drawing


def set_font(c, font=REGULAR, size=8, color=INK):
    c.setFont(font, size)
    c.setFillColor(color)


def text(c, value, x, y, font=REGULAR, size=8, color=INK, align="left"):
    set_font(c, font, size, color)
    if align == "right":
        c.drawRightString(x, y, str(value))
    elif align == "center":
        c.drawCentredString(x, y, str(value))
    else:
        c.drawString(x, y, str(value))


def wrap_lines(value, font, size, max_width):
    words = str(value).split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        if pdfmetrics.stringWidth(word, font, size) <= max_width:
            current = word
            continue
        fragment = ""
        for char in word:
            candidate = fragment + char
            if fragment and pdfmetrics.stringWidth(candidate, font, size) > max_width:
                lines.append(fragment)
                fragment = char
            else:
                fragment = candidate
        current = fragment
    if current:
        lines.append(current)
    return lines or [""]


def wrapped(c, value, x, y, max_width, font=REGULAR, size=8, color=INK, leading=None, max_lines=None):
    leading = leading or size * 1.35
    lines = wrap_lines(value, font, size, max_width)
    if max_lines:
        lines = lines[:max_lines]
    for index, line in enumerate(lines):
        text(c, line, x, y - index * leading, font, size, color)
    return y - len(lines) * leading


def draw_logo(c, drawing, x, y, width):
    scale = width / drawing.width
    c.saveState()
    c.translate(x, y)
    c.scale(scale, scale)
    renderPDF.draw(drawing, c, 0, 0)
    c.restoreState()
    return drawing.height * scale


def prototype_tag(c, code, label):
    c.setFillColor(ACCENT_SOFT)
    c.roundRect(12 * mm, PAGE_H - 8 * mm, 55 * mm, 5 * mm, 2 * mm, fill=1, stroke=0)
    text(c, f"PROTOTYPE {code} · {label}", 14 * mm, PAGE_H - 6.5 * mm, BOLD, 6.5, ACCENT)


def company_block(c, drawing, x, y, logo_width=30 * mm, compact=False):
    logo_h = draw_logo(c, drawing, x, y - 11 * mm, logo_width)
    name_x = x + logo_width + 4 * mm
    text(c, "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด", name_x, y - 1.5 * mm, BOLD, 8.5 if compact else 9.5, NAVY)
    text(c, "2/4 ซอยเพชรเกษม 35/1 แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160", name_x, y - 5.5 * mm, REGULAR, 5.8 if compact else 6.3, TEXT_3)
    text(c, "เลขประจำตัวผู้เสียภาษี 0105557081665 · 02-000-7722 · @perfumefactory", name_x, y - 8.8 * mm, REGULAR, 5.8 if compact else 6.3, TEXT_3)
    return logo_h


def title_block(c, x, y, style="a"):
    if style == "b":
        text(c, "ใบเสนอราคา", x, y, BOLD, 19, NAVY, "right")
        text(c, "QUOTATION", x, y - 5.2 * mm, BOLD, 7, TEXT_3, "right")
        text(c, "QT-26070001-0", x, y - 12 * mm, BOLD, 10, ACCENT, "right")
        text(c, "FM-SA-01 · REV.00 · EFFECTIVE 08/05/2568", x, y - 16 * mm, REGULAR, 5.5, TEXT_3, "right")
        return
    text(c, "ใบเสนอราคา", x, y, BOLD, 16 if style == "a" else 17, NAVY, "right")
    text(c, "QUOTATION", x, y - 4.8 * mm, BOLD, 6.8, ACCENT if style == "a" else TEXT_3, "right")
    if style == "a":
        box_y = y - 11 * mm
        widths = [22 * mm, 16 * mm, 22 * mm]
        cursor = x - sum(widths)
        for value, width in zip(["FM-SA-01", "REV.00", "08/05/2568"], widths):
            c.setStrokeColor(LINE_STRONG)
            c.rect(cursor, box_y, width, 5 * mm, fill=0, stroke=1)
            text(c, value, cursor + width / 2, box_y + 1.7 * mm, BOLD, 5.3, TEXT_2, "center")
            cursor += width
    else:
        text(c, "FM-SA-01 · Rev.00 · มีผล 08/05/2568", x, y - 10.2 * mm, REGULAR, 5.8, TEXT_3, "right")


def meta_rows(c, x, top_y, label_width, rows, width, row_gap=4 * mm):
    y = top_y
    for label, value in rows:
        text(c, label, x, y, REGULAR, 6.2, TEXT_3)
        wrapped(c, value, x + label_width, y, width - label_width, BOLD, 7.2, INK, 8.6, 2)
        y -= row_gap


def item_table(c, x, top_y, width, mode="grid"):
    col_widths = [9 * mm, width - 91 * mm, 18 * mm, 30 * mm, 34 * mm]
    header_h = 9 * mm
    row_h = 15 * mm
    headers = ["ลำดับ", "รายการสินค้าและบริการ", "จำนวน", "ราคา/หน่วย", "จำนวนเงิน"]
    if mode == "premium":
        c.setFillColor(NAVY)
        c.roundRect(x, top_y - header_h, width, header_h, 2.3 * mm, fill=1, stroke=0)
    else:
        c.setFillColor(WARM_2)
        c.rect(x, top_y - header_h, width, header_h, fill=1, stroke=0)

    cursor = x
    for header, col_w in zip(headers, col_widths):
        color = white if mode == "premium" else NAVY
        text(c, header, cursor + col_w / 2, top_y - 5.7 * mm, BOLD, 6.3, color, "center")
        cursor += col_w

    body_top = top_y - header_h
    for index, row in enumerate(ROWS):
        row_top = body_top - index * row_h
        if mode == "premium" and index % 2:
            c.setFillColor(ROW_ALT)
            c.rect(x, row_top - row_h, width, row_h, fill=1, stroke=0)
        cursor = x
        text(c, index + 1, cursor + col_widths[0] / 2, row_top - 7.2 * mm, BOLD if mode == "grid" else REGULAR, 6.7, INK, "center")
        cursor += col_widths[0]
        text(c, row["name"], cursor + 2 * mm, row_top - 5.2 * mm, BOLD, 7.1, INK)
        text(c, row["detail"], cursor + 2 * mm, row_top - 9.3 * mm, REGULAR, 5.8, TEXT_3)
        cursor += col_widths[1]
        text(c, row["qty"], cursor + col_widths[2] - 2 * mm, row_top - 7.2 * mm, REGULAR, 6.8, INK, "right")
        cursor += col_widths[2]
        text(c, row["price"], cursor + col_widths[3] - 2 * mm, row_top - 7.2 * mm, REGULAR, 6.8, INK, "right")
        cursor += col_widths[3]
        text(c, row["amount"], cursor + col_widths[4] - 2 * mm, row_top - 7.2 * mm, BOLD, 6.8, INK, "right")

        c.setStrokeColor(LINE if mode != "grid" else LINE_STRONG)
        c.line(x, row_top - row_h, x + width, row_top - row_h)

    total_h = header_h + len(ROWS) * row_h
    if mode == "grid":
        c.setStrokeColor(LINE_STRONG)
        c.rect(x, top_y - total_h, width, total_h, fill=0, stroke=1)
        cursor = x
        for col_w in col_widths[:-1]:
            cursor += col_w
            c.line(cursor, top_y, cursor, top_y - total_h)
    elif mode == "balanced":
        c.setStrokeColor(LINE)
        c.roundRect(x, top_y - total_h, width, total_h, 2.3 * mm, fill=0, stroke=1)
    return top_y - total_h


def terms(c, x, top_y, width, boxed=False, premium=False):
    if boxed:
        c.setStrokeColor(LINE)
        c.rect(x, top_y - 38 * mm, width, 38 * mm, fill=0, stroke=1)
        x += 3 * mm
        top_y -= 3 * mm
        width -= 6 * mm
    color = ACCENT if premium else NAVY
    text(c, "หมายเหตุ / REMARKS", x, top_y, BOLD, 6.5, color)
    wrapped(c, "ราคานี้รวมบรรจุภัณฑ์ตามรายละเอียดที่ระบุ ไม่รวมค่าจัดส่งนอกเขตกรุงเทพฯ", x, top_y - 4.2 * mm, width, REGULAR, 6.2, TEXT_2, 8.4, 3)
    text(c, "เงื่อนไขการชำระเงิน / PAYMENT TERMS", x, top_y - 17 * mm, BOLD, 6.5, color)
    wrapped(c, "มัดจำ 50% เมื่อยืนยันคำสั่งซื้อ และชำระส่วนที่เหลือก่อนส่งมอบสินค้า", x, top_y - 21.2 * mm, width, REGULAR, 6.2, TEXT_2, 8.4, 3)


def totals(c, x, top_y, width, mode="grid"):
    rows = [
        ("รวมสินค้า/บริการ", "320,000.00"),
        ("ส่วนลด", "-10,000.00"),
        ("VAT 7%", "21,700.00"),
        ("ยอดรวมทั้งสิ้น", "331,700.00 บาท"),
    ]
    row_h = 8 * mm
    if mode == "premium":
        c.setFillColor(WARM)
        c.roundRect(x, top_y - row_h * 4, width, row_h * 4, 3 * mm, fill=1, stroke=0)
    else:
        c.setStrokeColor(LINE_STRONG if mode == "grid" else LINE)
        c.roundRect(x, top_y - row_h * 4, width, row_h * 4, 0 if mode == "grid" else 2.3 * mm, fill=0, stroke=1)

    for index, (label, amount) in enumerate(rows):
        y_top = top_y - index * row_h
        is_grand = index == len(rows) - 1
        if is_grand and mode == "balanced":
            c.setFillColor(NAVY)
            c.rect(x, y_top - row_h, width, row_h, fill=1, stroke=0)
        elif is_grand and mode == "grid":
            c.setFillColor(WARM_2)
            c.rect(x, y_top - row_h, width, row_h, fill=1, stroke=0)
        if index and not (is_grand and mode == "balanced"):
            c.setStrokeColor(LINE)
            c.line(x, y_top, x + width, y_top)
        color = white if is_grand and mode == "balanced" else (ACCENT if is_grand and mode == "premium" else NAVY if is_grand else TEXT_2)
        text(c, label, x + 3 * mm, y_top - 5.2 * mm, BOLD if is_grand else REGULAR, 8 if is_grand else 6.5, color)
        text(c, amount, x + width - 3 * mm, y_top - 5.2 * mm, BOLD, 8 if is_grand else 6.5, color, "right")


def signature_boxes(c, x, top_y, width, mode="grid"):
    gap = 4 * mm if mode != "premium" else 8 * mm
    box_w = (width - gap * 2) / 3
    data = [
        ("ผู้เสนอราคา", "พนักงานขาย", "กานติมา ธาดาธารกิจ", "ลงนาม 19/07/2569 14:22"),
        ("ผู้อนุมัติ", "ผู้จัดการฝ่ายขาย", "สุพิชญา ใจดี", "อนุมัติ 19/07/2569 14:30"),
        ("ผู้ยืนยันสั่งซื้อ", "ลูกค้า", "ชื่อ-นามสกุลตัวบรรจง", "วันที่ ______ / ______ / ______"),
    ]
    for index, (role, subrole, name, meta) in enumerate(data):
        bx = x + index * (box_w + gap)
        if mode == "premium":
            text(c, role, bx + box_w / 2, top_y - 3 * mm, BOLD, 6.6, NAVY, "center")
            c.setStrokeColor(LINE_STRONG)
            c.line(bx + 3 * mm, top_y - 20 * mm, bx + box_w - 3 * mm, top_y - 20 * mm)
            text(c, "ลายเซ็นอิเล็กทรอนิกส์" if index < 2 else "ลงชื่อ", bx + box_w / 2, top_y - 18 * mm, REGULAR, 5.5, TEXT_3, "center")
            text(c, name, bx + box_w / 2, top_y - 25 * mm, BOLD, 6.5, INK, "center")
            text(c, meta, bx + box_w / 2, top_y - 29 * mm, REGULAR, 5.5, TEXT_3, "center")
            continue

        c.setStrokeColor(LINE_STRONG if mode == "grid" else LINE)
        radius = 0 if mode == "grid" else 2.3 * mm
        c.roundRect(bx, top_y - 34 * mm, box_w, 34 * mm, radius, fill=0, stroke=1)
        c.setFillColor(WARM_2 if mode == "grid" else WARM)
        c.rect(bx, top_y - 7 * mm, box_w, 7 * mm, fill=1, stroke=0)
        text(c, role, bx + box_w / 2, top_y - 4.6 * mm, BOLD, 6.3, NAVY, "center")
        text(c, f"· {subrole}", bx + box_w / 2, top_y - 6.4 * mm, REGULAR, 4.8, TEXT_3, "center")
        c.setStrokeColor(LINE_STRONG)
        c.setDash(1, 2)
        c.line(bx + 4 * mm, top_y - 20 * mm, bx + box_w - 4 * mm, top_y - 20 * mm)
        c.setDash()
        label = "ลายเซ็นอิเล็กทรอนิกส์" if index < 2 else "ลงชื่อ"
        text(c, label, bx + box_w / 2, top_y - 18.3 * mm, REGULAR, 5.3, ACCENT if mode == "balanced" and index < 2 else TEXT_3, "center")
        text(c, name, bx + box_w / 2, top_y - 24 * mm, BOLD, 6.3, INK, "center")
        text(c, meta, bx + box_w / 2, top_y - 28 * mm, REGULAR, 5.2, TEXT_3, "center")
        if mode == "balanced":
            verify = "Signature ref. verified" if index < 2 else "ประทับตราบริษัท (ถ้ามี)"
            text(c, verify, bx + box_w / 2, top_y - 31.5 * mm, REGULAR, 4.8, TEXT_3, "center")


def footer(c, mode="a"):
    left = 12 * mm if mode != "b" else 14 * mm
    right = PAGE_W - left
    y = 9 * mm
    c.setStrokeColor(ACCENT if mode == "b" else LINE_STRONG if mode == "a" else LINE)
    c.line(left, y + 4 * mm, right, y + 4 * mm)
    if mode == "a":
        text(c, "FM-SA-01 · Rev.00 · มีผล 08/05/2568", left, y, REGULAR, 5.3, TEXT_3)
        text(c, "เอกสารควบคุม · SS System", PAGE_W / 2, y, REGULAR, 5.3, TEXT_3, "center")
    elif mode == "b":
        text(c, "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด · เลขประจำตัวผู้เสียภาษี 0105557081665", left, y, REGULAR, 5.1, TEXT_3)
    else:
        text(c, "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด · เอกสารควบคุม", left, y, REGULAR, 5.2, TEXT_3)
        text(c, "FM-SA-01 · Rev.00", PAGE_W - 36 * mm, y, REGULAR, 5.2, TEXT_3, "right")
    text(c, "หน้า 1 / 1", right, y, REGULAR, 5.3, TEXT_3, "right")


def draw_direction_a(c, logo):
    prototype_tag(c, "A", "CONTROLLED ISO")
    top = PAGE_H - 20 * mm
    company_block(c, logo, 12 * mm, top)
    title_block(c, PAGE_W - 12 * mm, top + 1 * mm, "a")
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.4)
    c.line(12 * mm, top - 15 * mm, PAGE_W - 12 * mm, top - 15 * mm)

    meta_top = top - 21 * mm
    meta_h = 39 * mm
    split = 117 * mm
    c.setStrokeColor(LINE_STRONG)
    c.setLineWidth(.6)
    c.rect(12 * mm, meta_top - meta_h, PAGE_W - 24 * mm, meta_h, fill=0, stroke=1)
    c.line(split, meta_top, split, meta_top - meta_h)
    meta_rows(c, 16 * mm, meta_top - 6 * mm, 24 * mm, [
        ("ลูกค้า", "บริษัท สหมิตร โปรดักส์ จำกัด"),
        ("ที่อยู่ออกบิล", "88/8 ถนนกาญจนาภิเษก แขวงบางแค เขตบางแค กรุงเทพมหานคร 10160"),
        ("ผู้ติดต่อ", "คุณณัฐชา · 081-234-5678"),
        ("โครงการ", "Home Fragrance Collection 2026"),
    ], 95 * mm, 7.3 * mm)
    meta_rows(c, split + 4 * mm, meta_top - 6 * mm, 22 * mm, [
        ("เลขที่", "QT-26070001-0"),
        ("วันที่ออก", "19 กรกฎาคม 2569"),
        ("ยืนราคาถึง", "18 สิงหาคม 2569"),
        ("ผู้ดูแล", "กานติมา ธาดาธารกิจ"),
    ], PAGE_W - split - 18 * mm, 7.3 * mm)

    table_bottom = item_table(c, 12 * mm, meta_top - meta_h - 7 * mm, PAGE_W - 24 * mm, "grid")
    summary_top = table_bottom - 7 * mm
    terms(c, 12 * mm, summary_top, 100 * mm, boxed=True)
    totals(c, PAGE_W - 84 * mm, summary_top, 72 * mm, "grid")
    signature_boxes(c, 12 * mm, summary_top - 46 * mm, PAGE_W - 24 * mm, "grid")
    footer(c, "a")


def draw_direction_b(c, logo):
    c.setFillColor(ACCENT)
    c.rect(0, PAGE_H - 7 * mm, PAGE_W, 7 * mm, fill=1, stroke=0)
    prototype_tag(c, "B", "PREMIUM BRAND")
    top = PAGE_H - 23 * mm
    draw_logo(c, logo, 14 * mm, top - 13 * mm, 38 * mm)
    text(c, "บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด", 14 * mm, top - 17 * mm, BOLD, 8.2, NAVY)
    text(c, "SCENT & SENSE LABORATORY CO., LTD.", 14 * mm, top - 21 * mm, REGULAR, 5.5, TEXT_3)
    text(c, "02-000-7722 · @perfumefactory · www.scentandsense.co.th", 14 * mm, top - 24.5 * mm, REGULAR, 5.5, TEXT_3)
    title_block(c, PAGE_W - 14 * mm, top, "b")

    card_top = top - 32 * mm
    card_h = 37 * mm
    c.setFillColor(WARM)
    c.roundRect(14 * mm, card_top - card_h, PAGE_W - 28 * mm, card_h, 4 * mm, fill=1, stroke=0)
    text(c, "เรียน / TO", 19 * mm, card_top - 6 * mm, REGULAR, 6, TEXT_3)
    text(c, "บริษัท สหมิตร โปรดักส์ จำกัด", 19 * mm, card_top - 13 * mm, BOLD, 10, NAVY)
    wrapped(c, "88/8 ถนนกาญจนาภิเษก แขวงบางแค เขตบางแค กรุงเทพมหานคร 10160", 19 * mm, card_top - 19 * mm, 93 * mm, REGULAR, 6.2, TEXT_2, 8, 2)
    text(c, "คุณณัฐชา · 081-234-5678", 19 * mm, card_top - 28 * mm, REGULAR, 6.2, TEXT_2)
    meta_rows(c, 126 * mm, card_top - 7 * mm, 22 * mm, [
        ("วันที่ออก", "19 กรกฎาคม 2569"),
        ("ยืนราคาถึง", "18 สิงหาคม 2569"),
        ("ผู้ดูแล", "กานติมา ธาดาธารกิจ"),
        ("สถานะ", "อนุมัติแล้ว"),
    ], 66 * mm, 7 * mm)

    table_bottom = item_table(c, 14 * mm, card_top - card_h - 9 * mm, PAGE_W - 28 * mm, "premium")
    summary_top = table_bottom - 9 * mm
    terms(c, 14 * mm, summary_top, 92 * mm, premium=True)
    totals(c, PAGE_W - 83 * mm, summary_top, 69 * mm, "premium")
    signature_boxes(c, 14 * mm, summary_top - 48 * mm, PAGE_W - 28 * mm, "premium")
    footer(c, "b")


def draw_direction_c(c, logo):
    prototype_tag(c, "C", "BALANCED SYSTEM · RECOMMENDED")
    top = PAGE_H - 20 * mm
    company_block(c, logo, 12 * mm, top)
    title_block(c, PAGE_W - 12 * mm, top + 1 * mm, "c")
    c.setStrokeColor(LINE)
    c.line(12 * mm, top - 15 * mm, PAGE_W - 12 * mm, top - 15 * mm)
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.6)
    c.line(12 * mm, top - 15 * mm, 47 * mm, top - 15 * mm)

    card_top = top - 21 * mm
    card_h = 39 * mm
    gap = 4 * mm
    left_w = 116 * mm
    right_w = PAGE_W - 24 * mm - left_w - gap
    c.setFillColor(WARM)
    c.setStrokeColor(LINE)
    c.roundRect(12 * mm, card_top - card_h, left_w, card_h, 2.5 * mm, fill=1, stroke=1)
    c.setFillColor(ACCENT)
    c.roundRect(12 * mm, card_top - card_h, 2 * mm, card_h, 1 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.roundRect(12 * mm + left_w + gap, card_top - card_h, right_w, card_h, 2.5 * mm, fill=1, stroke=1)
    text(c, "ข้อมูลลูกค้า", 17 * mm, card_top - 6 * mm, BOLD, 6.8, NAVY)
    text(c, "ข้อมูลเอกสาร", 12 * mm + left_w + gap + 4 * mm, card_top - 6 * mm, BOLD, 6.8, NAVY)
    meta_rows(c, 17 * mm, card_top - 12 * mm, 23 * mm, [
        ("ลูกค้า", "บริษัท สหมิตร โปรดักส์ จำกัด"),
        ("ที่อยู่ออกบิล", "88/8 ถนนกาญจนาภิเษก แขวงบางแค เขตบางแค กรุงเทพมหานคร 10160"),
        ("ผู้ติดต่อ", "คุณณัฐชา · 081-234-5678"),
        ("โครงการ", "Home Fragrance Collection 2026"),
    ], left_w - 10 * mm, 6.2 * mm)
    meta_rows(c, 12 * mm + left_w + gap + 4 * mm, card_top - 12 * mm, 20 * mm, [
        ("เลขที่", "QT-26070001-0"),
        ("วันที่ออก", "19 กรกฎาคม 2569"),
        ("ยืนราคาถึง", "18 สิงหาคม 2569"),
        ("ผู้ดูแล", "กานติมา ธาดาธารกิจ"),
    ], right_w - 8 * mm, 6.2 * mm)

    table_bottom = item_table(c, 12 * mm, card_top - card_h - 7 * mm, PAGE_W - 24 * mm, "balanced")
    summary_top = table_bottom - 7 * mm
    terms(c, 12 * mm, summary_top, 98 * mm)
    totals(c, PAGE_W - 84 * mm, summary_top, 72 * mm, "balanced")
    signature_boxes(c, 12 * mm, summary_top - 43 * mm, PAGE_W - 24 * mm, "balanced")
    footer(c, "c")


def main():
    register_fonts()
    logo = prepare_logo()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Quotation Visual Directions - SS System")
    c.setAuthor("SS System Modernization")

    draw_direction_a(c, logo)
    c.showPage()
    draw_direction_b(c, logo)
    c.showPage()
    draw_direction_c(c, logo)
    c.showPage()
    c.save()

    print(OUTPUT)


if __name__ == "__main__":
    main()

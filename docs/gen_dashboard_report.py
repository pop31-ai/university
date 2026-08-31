# -*- coding: utf-8 -*-
"""
gen_dashboard_report.py — управленческий PDF-отчёт дашборда университета.

Воспроизводимый генератор: читает plan/semester.json (афиши, субъекты, план),
извлекает имена залов (HALLS) прямо из player/dashboard.html (поэтому названия
в отчёте в точности совпадают с дашбордом), считает те же агрегаты, что и
дашборд (хроника, занятость залов по дням/часам, повторяемость по месяцам,
контингент), собирает печатный HTML формата A4 в стиле docs/* и рендерит его
в PDF через Chromium (Playwright).

Запуск:  python docs/gen_dashboard_report.py
Результат:
  docs/dashboard_report.html  — печатный исходник отчёта;
  docs/dashboard_report.pdf   — готовый PDF (управленческий отчёт).
В конце выводится сводка счётчиков источника — для сверки с PDF.
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SEMESTER_JSON = os.path.join(ROOT, "plan", "semester.json")
DASHBOARD_HTML = os.path.join(ROOT, "player", "dashboard.html")
OUT_HTML = os.path.join(ROOT, "docs", "dashboard_report.html")
OUT_PDF = os.path.join(ROOT, "docs", "dashboard_report.pdf")

DAY_ORDER = {"пн": 1, "вт": 2, "ср": 3, "чт": 4, "пт": 5, "сб": 6, "вс": 7}
CAL_DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
CAL_HOURS = list(range(9, 19))  # 9:00 – 18:00
MONTH_WEEKS = 5
CAL_SET = set(range(1, MONTH_WEEKS + 1))

def esc(s):
    s = str(s)
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def load_semester():
    with open(SEMESTER_JSON, encoding="utf-8") as f:
        return json.load(f)


def extract_halls():
    """room key -> name из блока var HALLS = {...} в дашборде."""
    with open(DASHBOARD_HTML, encoding="utf-8") as f:
        html = f.read()
    m = re.search(r"var HALLS = \{(.*?)\n    \};", html, re.S)
    if not m:
        return {}
    halls = {}
    for hm in re.finditer(r"^\s*([a-z_][a-z0-9_]*):\s*\{\s*name:\s*'([^']*)'", m.group(1), re.M):
        halls[hm.group(1)] = hm.group(2)
    return halls


def sort_ann(ann):
    return sorted(ann, key=lambda a: (DAY_ORDER.get(a.get("day"), 9), a.get("time", "")))


def week_occupation(ann):
    """occ[room][day] = set часов, занятых афишами (как в дашборде)."""
    occ = {}
    for a in ann:
        room, day = a["room"], a["day"]
        occ.setdefault(room, {}).setdefault(day, set())
        h = int(str(a.get("time", "0")).split(":")[0])
        hh = max(1, -(-int(a.get("dur", 60)) // 60))
        for k in range(hh):
            hs = h + k
            if hs <= 18:
                occ[room][day].add(hs)
    return occ


def free_windows(occ, room):
    """Свободные (незанятые) часовые окна по дням — формат как в дашборде."""
    parts = []
    for d in CAL_DAYS:
        busy = occ.get(room, {}).get(d, set())
        run = None
        wins = []
        for h in CAL_HOURS:
            if h not in busy:
                if run:
                    if h - run[1] == 1:
                        run[1] = h
                    else:
                        wins.append(run); run = [h, h]
                else:
                    run = [h, h]
            else:
                if run:
                    wins.append(run); run = None
        if run:
            wins.append(run)
        if wins:
            wstr = ", ".join(
                ("%02d:00" % w[0]) + ("–%02d:00" % w[1] if w[1] != w[0] else "")
                for w in wins)
            parts.append("<b>%s</b>: %s" % (d, wstr))
    return "; ".join(parts)


def monthly_volume(ann, room):
    """месячный объём (мин) «живого» времени по залу из monthWeeks."""
    total = 0
    for a in ann:
        if a["room"] != room:
            continue
        mask = a.get("monthWeeks") or []
        total += int(a.get("dur", 60)) * len(mask)
    return total


def main():
    P = load_semester()
    halls = extract_halls()
    plan = P.get("plan", {})
    subjects = P.get("subjects", {})
    ann = P.get("announcements", [])

    # ---- агрегаты ----
    occ = week_occupation(ann)
    hall_keys = sorted({a["room"] for a in ann})
    subject_count = sum(len(a.get("subjects") or []) for a in ann)
    weeks_map = {}
    for a in ann:
        weeks_map[a["id"]] = sorted(set(w for w in (a.get("monthWeeks") or []) if w in CAL_SET))
    months = list(range(1, MONTH_WEEKS + 1))

    # ---- KPI ----
    kpi_html = "".join(
        "<td style='border:none;background:#f6f9fe;text-align:center;padding:3mm 2mm'>"
        "<div style='font-size:15pt;font-weight:700;color:#10324a'>%d</div>"
        "<div style='font-size:8.5pt;color:#556;text-transform:uppercase;letter-spacing:.5px'>%s</div></td>"
        % (n, l) for n, l in
        [(len(ann), "афиш-объявлений"), (len(hall_keys), "залов задействовано"),
         (len(subjects), "ролей контингента"), (subject_count, "приглашений")])

    # ---- хроника ----
    def ann_row(a):
        hall = halls.get(a["room"], a["room"])
        when = "<span>%s · %s (%s′)</span>" % (esc(a["day"]), esc(a["time"]), a["dur"])
        pills = "".join(
            "<span class='tag'>%s</span>" % esc(subjects.get(s, {}).get("title", s))
            for s in (a.get("subjects") or []))
        rep = len(weeks_map.get(a["id"], []))
        return ("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td>"
                "<td>%s</td></tr>" % (when, esc(a.get("title", a.get("session"))),
                                      esc(hall), esc(a.get("host", "—")), pills, rep))
    chronicle = "\n".join(ann_row(a) for a in sort_ann(ann))

    # ---- занятость залов ----
    def hall_block(room):
        hall = halls.get(room, room)
        busy_total = sum(len(occ.get(room, {}).get(d, set())) for d in CAL_DAYS)
        total_hours = len(CAL_HOURS) * len(CAL_DAYS)
        free = free_windows(occ, room)
        day_vals = "".join(
            "<span style='margin-right:2mm'><b>%s</b>: %s ч</span>" % (d, len(occ.get(room, {}).get(d, set())))
            for d in CAL_DAYS)
        mv = monthly_volume(ann, room)
        return (
            "<h3>%s</h3>"
            "<p>Занято <b>%s</b> ч/нед из %s · свободно %s ч · «живое» время в месяц: <b>%s</b> мин</p>"
            "<p class='callout'><b>Распределение по дням:</b> %s</p>"
            "<p class='callout'><b>Свободные окна:</b> %s</p>"
            % (esc(hall), busy_total, total_hours, total_hours - busy_total, mv,
               day_vals, (free if free else "нет (зал загружен весь день)")))
    halls_html = "\n".join(hall_block(k) for k in hall_keys)

    # ---- повторяемость по месяцам ----
    midx = "; ".join("нед.%s" % w for w in months)
    def mn_block(room):
        hall = halls.get(room, room)
        mv = monthly_volume(ann, room)
        # недельная маска: какие недели месяца хотя бы заняты
        week_on = []
        for w in months:
            wk = sum(1 for a in ann if a["room"] == room and w in (a.get("monthWeeks") or []))
            week_on.append(wk > 0)
        strip = "".join(
            "<span style='display:inline-block;width:3mm;height:3mm;margin-right:1mm;"
            "background:%s;border:0.6pt solid #aab'></span>" % ("#2f7bb0" if on else "#e0e4ea")
            for on in week_on)
        return ("<tr><td>%s</td><td>%s</td><td style='white-space:nowrap'>%s</td>"
                "<td>%s</td></tr>" % (esc(hall), ("%d мин" % mv), strip,
                                      "%d из %d" % (sum(1 for x in week_on if x), len(months))))
    mn_rows = "\n".join(mn_block(k) for k in hall_keys)
    # таблица частоты афиш
    fmt_rows = "".join(
        "<tr><td>%s</td><td>%s</td><td>%s · %s · %s′</td><td>%s</td></tr>"
        % (esc(a.get("title", a.get("session"))), esc(halls.get(a["room"], a["room"])),
           esc(a["day"]), esc(a["time"]), a["dur"], len(weeks_map.get(a["id"], [])))
        for a in sort_ann(ann))

    # ---- контингент ----
    subj_usage = {}
    for a in ann:
        for s in (a.get("subjects") or []):
            subj_usage[s] = subj_usage.get(s, 0) + 1
    subj_rows = "".join(
        "<tr><td>%s</td><td>%s</td><td>%s</td></tr>"
        % (esc(k), esc(subjects.get(k, {}).get("title", k)),
           esc(subjects.get(k, {}).get("desc", "")), )
        for k in sorted(subjects))
    usage_rows = "".join(
        "<tr><td>%s</td><td>%s</td></tr>"
        % (esc(subjects.get(k, {}).get("title", k)), subj_usage.get(k, 0))
        for k in sorted(subjects))
    # контингент: объединим — роль с числом афиш
    cont_rows = "".join(
        "<tr><td><b>%s</b></td><td>%s</td><td>%s</td></tr>"
        % (esc(k), esc(subjects.get(k, {}).get("title", k)), subj_usage.get(k, 0))
        for k in sorted(subjects))

    html = HTML_TMPL
    for key, val in {
        "plan_title": esc(plan.get("title", "")),
        "plan_author": esc(plan.get("author", "")),
        "plan_period": esc(plan.get("period", "")),
        "plan_method": esc(plan.get("methodology", "") or
                            "кампус собирается афишами, а не жёсткой сеткой занятий"),
        "kpi": kpi_html,
        "chronicle": chronicle,
        "halls": halls_html,
        "mn_legendmidx": midx,
        "mn_rows": mn_rows,
        "fmt_rows": fmt_rows,
        "cont_rows": cont_rows,
        "n_ann": str(len(ann)),
        "n_halls": str(len(hall_keys)),
        "n_subj": str(len(subjects)),
    }.items():
        html = html.replace("@@%s@@" % key, val)

    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    # ---- PDF ----
    from playwright.sync_api import sync_playwright
    url = "file:///" + OUT_HTML.replace(os.sep, "/")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.goto(url, wait_until="networkidle")
        pg.pdf(path=OUT_PDF, format="A4", print_background=True)
        b.close()

    pdf_bytes = os.path.getsize(OUT_PDF) if os.path.exists(OUT_PDF) else 0
    print("ОТЧЁТ СФОРМИРОВАН")
    print("  html:", OUT_HTML)
    print("  pdf :", OUT_PDF, "(%.1f КБ)" % (pdf_bytes / 1024))
    print("СВОДКА ИСТОЧНИКА (сверка): афиш=%d · залов=%d · ролей=%d · приглашений=%d · недель в месяце=%d"
          % (len(ann), len(hall_keys), len(subjects), subject_count, MONTH_WEEKS))
    ok = len(ann) == 15 and len(hall_keys) == 15 and len(subjects) == 6
    print("ПРОВЕРКА СВЕРКИ:", ("OK" if ok else "РАСХОЖДЕНИЕ"))
    raise SystemExit(0 if ok else 1)


HTML_TMPL = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Управленческий отчёт дашборда университета · афиши и занятость залов</title>
<style>
  @page { size: A4; margin: 16mm 15mm 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "PT Sans", Arial, sans-serif; color: #1c2520; margin: 0; font-size: 10.5pt; line-height: 1.42; }
  .page { max-width: 180mm; margin: 0 auto; }
  h1 { font-size: 19pt; margin: 0 0 2mm; color: #10324a; }
  h2 { font-size: 13.5pt; color: #10324a; border-bottom: 1.6pt solid #bcd6ff; padding-bottom: 1.5mm; margin: 7mm 0 3mm; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #234a6e; margin: 5mm 0 2mm; page-break-after: avoid; }
  p { margin: 0 0 2.5mm; text-align: justify; }
  .subtitle { font-size: 10.5pt; color: #556; margin-bottom: 5mm; }
  .meta { font-size: 9pt; color: #667; border: 0.6pt solid #ccd; padding: 2mm 3mm; background: #f4f7fc; margin-bottom: 5mm; }
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm; font-size: 9.5pt; }
  th, td { border: 0.6pt solid #aab; padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
  th { background: #e8eefc; color: #10324a; }
  tr:nth-child(even) td { background: #f6f9fe; }
  tr:first-child td { background: transparent; }
  .callout { border-left: 3pt solid #2f7bb0; background: #eef5fc; padding: 2mm 3mm; margin: 2mm 0; }
  .callout b { color: #10324a; }
  .footer { margin-top: 8mm; font-size: 8pt; color: #889; border-top: 0.6pt solid #ccd; padding-top: 1.5mm; }
  .pagebreak { page-break-before: always; }
  .tag { display: inline-block; font-size: 8pt; background: #d6e6ff; color: #10324a; border-radius: 3px; padding: 0 2mm; margin-right: 1mm; }
  .rep { color: #10324a; font-weight: 700; }
  .kpi td.n { font-size: 15pt; font-weight: 700; color: #10324a; }
</style>
</head>
<body>
<div class="page">

<h1>Управленческий отчёт дашборда университета</h1>
<div class="subtitle">Афиши-объявления с графой времени · занятость и повторяемость залов · контингент</div>
<div class="meta">
  <b>План:</b> @@plan_title@@ ·
  <b>Период:</b> @@plan_period@@ ·
  <b>Автор:</b> @@plan_author@@ ·
  <b>Недель в типовом месяце:</b> 5
</div>
<p>
Настоящий документ — печатная версия управленческого дашборда. Сила университета — в
<b>объявлениях-афишах с графой времени</b> (день · время старта · длительность): зал кафедры
или инфраструктурный объект открывается афишей в назначенный момент, так кампус собирается
«афишами», а не жёсткой сеткой занятий. Все данные сформированы автоматически из
<code>plan/semester.json</code> и совпадают с источником.
</p>

<h2>1. Управленческая сводка</h2>
<table style="border:none"><tr class="kpi">@@kpi@@</tr></table>
<p class="callout"><b>Принцип кампуса:</b> афиша с графой времени открывает зал. @@plan_method@@</p>

<h2>2. Хроника афиш-объявлений</h2>
<p>Всего @@n_ann@@ афиш по @@n_halls@@ залам; контингент разбит на @@n_subj@@ ролей.</p>
<table>
  <thead><tr><th>Когда</th><th>Афиша</th><th>Зал</th><th>Ведущий</th><th>Контингент</th><th>Повторов/мес</th></tr></thead>
  <tbody>@@chronicle@@</tbody>
</table>

<h2 class="pagebreak">3. Занятость залов · неделя</h2>
<p>Занятые часы по графе «день · час · длительность»; ниже — свободные окна для приглашённых и практикантов.</p>
@@halls@@

<h2>4. Повторяемость · месяц</h2>
<p>Афиша-типовая неделя повторяется в выбранных неделях месяца (@@mn_legendmidx@@). По залам:</p>
<table>
  <thead><tr><th>Зал</th><th>«Живое» время/мес</th><th>Занятые недели</th><th>Активность</th></tr></thead>
  <tbody>@@mn_rows@@</tbody>
</table>
<p>Частота повторения каждой афиши в месяце:</p>
<table>
  <thead><tr><th>Афиша</th><th>Зал</th><th>Когда</th><th>Повторов/мес</th></tr></thead>
  <tbody>@@fmt_rows@@</tbody>
</table>

<h2>5. Контингент университета</h2>
<table>
  <thead><tr><th>Роль</th><th>Название</th><th>Афиш</th></tr></thead>
  <tbody>@@cont_rows@@</tbody>
</table>

<div class="footer">Управленческий отчёт дашборда университета · сформировано автоматически из реестров кампуса (semester · dashboard) на @@plan_period@@.</div>
</div>
</body>
</html>
"""


if __name__ == "__main__":
    main()

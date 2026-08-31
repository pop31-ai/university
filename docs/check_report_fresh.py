# -*- coding: utf-8 -*-
"""
check_report_fresh.py — гейт свежести PDF-отчёта.

Проверяет, что печатный отчёт (docs/dashboard_report.html и .pdf) не старше
своих источников:
  plan/semester.json            — афиши/субъекты/план;
  player/dashboard.html         — имена залов (HALLS), которые отчёт использует;
  docs/gen_dashboard_report.py  — сам генератор (правки генератора тоже требуют
                                  пересборки).

Если один из выходных файлов старше любого из источников — отчёт устарел:
печать сообщения и exit 1 (что блокирует коммит через pre-commit hook / test_all).
Пересборка: python docs/gen_dashboard_report.py

Запуск: python docs/check_report_fresh.py   (exit 0 = свежий, 1 = устарел)
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCES = [
    os.path.join(ROOT, "plan", "semester.json"),
    os.path.join(ROOT, "player", "dashboard.html"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "gen_dashboard_report.py"),
]

OUTPUTS = [
    os.path.join(ROOT, "docs", "dashboard_report.html"),
    os.path.join(ROOT, "docs", "dashboard_report.pdf"),
]


def main():
    missing = [s for s in SOURCES if not os.path.exists(s)]
    if missing:
        print("ОШИБКА: нет исходников отчёта:", ", ".join(missing))
        return 1

    stale = []
    for out in OUTPUTS:
        if not os.path.exists(out):
            stale.append((os.path.basename(out), "файл отсутствует"))
            continue
        out_m = os.path.getmtime(out)
        for src in SOURCES:
            if os.path.getmtime(src) > out_m:
                stale.append((os.path.basename(out),
                              "старше источника %s" % os.path.basename(src)))
                break

    if stale:
        print("ОТЧЁТ УСТАРЕЛ (свежесть PDF-отчёта):")
        for name, why in stale:
            print("  [НЕ] %s — %s" % (name, why))
        print("  -> пересобери: python docs/gen_dashboard_report.py")
        print("ГЕЙТ СВЕЖЕСТИ: FAIL")
        return 1

    print("ОТЧЁТ СВЕЖИЙ (html и pdf новее всех источников):")
    for out in OUTPUTS:
        print("  [OK]", os.path.basename(out))
    print("ГЕЙТ СВЕЖЕСТИ: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

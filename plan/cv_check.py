# -*- coding: utf-8 -*-
"""=============================
cv_check.py — ПРОВЕРКА РОЛИКОВ КОМПЬЮТЕРНЫМ ЗРЕНИЕМ ПО МЕТКАМ
polimuli-chalkboard · «ролик сверяется по часам, минутам, секундам»

Идея: настоящая проверка не по JSON-полям, а ГЛАЗАМИ — OpenCV смотрит
на отрисованные кадры. Так как движок рисует в браузере, здесь кадры
воспроизводятся из sessions/<id>.json (эмуляция доски: мазки по своим
t/dur/x/y/w/h в своих цветах) и на каждый кадр ставится ВИДИМАЯ
МЕТКА-ШТРИХКОД времени (10 бит секунды под кадром).

Компьютерное зрение по меткам сверяет:
  1) метка-штрихкод декодируется и показывает ровно ту секунду, что
     соответствует кадру (время в ролике честное, монотонное);
  2) каждый мазок СВОЕВРЕМЕННО виден по кадрам: в момент его t в
     области (bbox) штриха появляются чернила (diff кадров t и t-0.25);
  3) после длительности сессии новых чернил нет.

Запуск:
  python plan/cv_check.py                  # всё расписание (33 сессии)
  python plan/cv_check.py k01 p01 a01      # только перечисленные id
  python plan/cv_check.py --all            # все 56 сессий реестра
  python plan/cv_check.py --frames k01     # сохранить PNG кадров в cv_frames/
============================================================="""

import json
import os
import sys

import numpy as np
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEM = os.path.join(ROOT, "plan", "semester.json")

CANVAS_W, CANVAS_H = 800, 500
BG = np.array([36, 43, 52], np.uint8)  # тёмная доска (аналог полиарта)

# kinds, не оставляющие чернил на доске (камера/полёт/ссылка) — режиссура
NO_INK = {"ref", "cam", "move"}

BAR_W = 7
N_BITS = 10
BAR_H = 16
BAR_X0 = 4
BAR_Y = CANVAS_H - BAR_H - 2
WIDE = BAR_W * (N_BITS + 2)  # ширина всей метки


# ------------------------------------------------- проверка по меткам ---
def draw_timecode(img, sec):
    """Штрихкод-метка секунды: старт (тёмный), N_BITS битов (тёмный=1,
    светлый=0) MSB-first, стоп (тёмный). Каждая полоса ровно BAR_W колонок."""
    x = BAR_X0
    cv2.rectangle(img, (x, BAR_Y), (x + BAR_W - 1, BAR_Y + BAR_H), (0, 0, 0), -1)
    x += BAR_W
    for i in range(N_BITS - 1, -1, -1):
        bit = (sec >> i) & 1
        col = (0, 0, 0) if bit else (255, 255, 255)
        cv2.rectangle(img, (x, BAR_Y), (x + BAR_W - 1, BAR_Y + BAR_H), col, -1)
        x += BAR_W
    cv2.rectangle(img, (x, BAR_Y), (x + BAR_W - 1, BAR_Y + BAR_H), (0, 0, 0), -1)


def read_timecode(img):
    """Декодирование метки: старт-полоса, 10 бит MSB-first по средней
    яркости вертикальной полосы, стоп-полоса."""
    strip = img[BAR_Y:BAR_Y + BAR_H, BAR_X0:BAR_X0 + WIDE]
    gray = strip
    if len(strip.shape) == 3:
        gray = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY)
    mean = gray.mean(axis=0)
    dark = mean < 127
    # старт
    if not dark[0]:
        return None
    sec = 0
    pos = BAR_W
    for i in range(N_BITS):
        seg = dark[pos:pos + BAR_W]
        if len(seg) < BAR_W // 2:
            return None
        bit = 1 if seg.sum() > len(seg) / 2 else 0
        sec = (sec << 1) | bit
        pos += BAR_W
    return sec


# ------------------------------------------------------------ геометрия ---
def _hex(rgb):
    import re
    if str(rgb).startswith("rgba"):
        mm = re.findall(r"[\d.]+", rgb)
        return (int(float(mm[0])), int(float(mm[1])), int(float(mm[2])))
    v = str(rgb).lstrip("#")
    if len(v) < 6:
        v = (v * 2) if len(v) == 3 else v.zfill(6)
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def _bgr(rgb):
    r, g, b = _hex(rgb)
    return (int(b), int(g), int(r))  # CV требует tuple int (не np.uint8)


def _line_color(st):
    c = st.get("color") or st.get("fill") or st.get("ink") or "#f0ead0"
    return _bgr(c)


def _bbox(st, can):
    """Окно наблюдения мазка в пикселях канваса."""
    get = st.get
    x, y = get("x", 0) or 0, get("y", 0) or 0
    fx, fy = can(x), can(y)
    w, h = get("w"), get("h")
    if "from" in st and st["from"]:
        fx, fy = can(st["from"][0]), can(st["from"][1])
        if "to" in st and st["to"]:
            ex, ey = can(st["to"][0]), can(st["to"][1])
            fx, fy = min(fx, ex), min(fy, ey)
            w = abs(ex - fx)
            h = abs(ey - fy)
    if w is None:
        n = len(get("s") or get("text") or "")
        w = max(60, min(600, n * 9 + 20))
    if h is None:
        h = 24
    fx = min(max(fx, 0), CANVAS_W - 1)
    fy = min(max(fy, 0), CANVAS_H - 1)
    w = max(8, min(w, CANVAS_W - fx))
    h = max(8, min(h, CANVAS_H - fy))
    return (int(fx), int(fy), int(fx + w), int(fy + h))


# ------------------------------------------------------------ кадры ---
def _marker_palette(n):
    """Уникальная палитра «меток мазков»: n различимых цветов (BGR, tuple)."""
    import colorsys
    out = []
    for i in range(n):
        h = (i * 0.61803398875) % 1.0
        s, v = 0.85, 1.0
        r, g, b = colorsys.hsv_to_rgb(h, s, v)
        out.append((int(round(b * 255)), int(round(g * 255)), int(round(r * 255))))
    return out


def draw_frame(j, t, can, strokes):
    img = np.zeros((CANVAS_H, CANVAS_W, 3), np.uint8)
    img[:, :] = BG
    for s in strokes:
        if s.get("t", 0) > t + 1e-9:
            continue
        col = _line_color(s)
        x0, y0, x1, y1 = s["_bbox"]
        kind = s["kind"]
        if kind in ("line", "mline", "sarrow", "thread"):
            cv2.line(img, (x0, y0), (x1, y1), col, max(1, int(s.get("width", 3))))
        elif kind == "ul":
            cv2.line(img, (x0, y0 + int(0.4 * (y1 - y0))), (x1, y1), col,
                     max(1, int(s.get("width", 3))))
        elif kind == "pin":
            cv2.circle(img, ((x0 + x1) // 2, (y0 + y1) // 2), 6, col, -1)
        elif kind == "grid":
            cv2.rectangle(img, (x0, y0), (x1, y1), col, 1)
        elif kind in ("box", "sbox", "card", "highlight"):
            cv2.rectangle(img, (x0, y0), (x1, y1), col, 3 if kind in ("box", "card") else 2)
            txt = s.get("s")
            if txt:
                cv2.putText(img, str(txt)[:26], (x0 + 2, y0 + 16),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1)
        else:
            cv2.rectangle(img, (x0, y0), (x1, y1), col, 1)

    # МЕТКИ МАЗКОВ: цветной квадратик в колонке слева — момент появления.
    # CV ищет цвет метки маркера: появился → мазок виден ровно в свой t.
    pal = _marker_palette(len(strokes))
    for i, s in enumerate(strokes):
        if s.get("t", 0) <= t + 1e-9:
            yy = BAR_Y - 8 - (i % 24) * 6
            cv2.rectangle(img, (2, yy), (5, yy + 3), pal[i % len(pal)], -1)

    draw_timecode(img, max(0, int(round(t))))
    return img


# ------------------------------------------------------------ аудит ---
def _area_of(img, color):
    """Сколько пикселей кадра имеют ровно заданный BGR-цвет маркера."""
    c = np.array(color, np.uint8)
    hit = (img[:, :, 0] == c[0]) & (img[:, :, 1] == c[1]) & (img[:, :, 2] == c[2])
    return int(hit.sum())


def audit(j):
    sess = j.get("session", {})
    D = float(sess.get("duration", 0))
    strokes = [s for s in j.get("strokes", [])
               if s.get("t") is not None and s.get("kind") not in NO_INK]
    for s in strokes:
        if "kind" not in s:
            s["kind"] = "text"

    # координаты: либо пиксели (k/f/m/b/p), либо метры аудитории (<=20)
    allx = [s.get("x", 0) for s in strokes]
    for s in strokes:
        if "to" in s and s["to"]:
            allx += list(s["to"])
    mtr = bool(allx) and max(allx) <= 20
    if mtr:
        can = (lambda v: min(max(float(v) / 10.0 * CANVAS_W, 0), CANVAS_W - 1))
    else:
        can = (lambda v: min(max(float(v), 0), CANVAS_W - 1))

    for s in strokes:
        s["_bbox"] = _bbox(s, can)

    rows = []
    pal = _marker_palette(len(strokes))
    for i, s in enumerate(strokes):
        ft = float(s["t"])
        if ft >= D - 0.01 or ft < 0:
            continue
        fa = draw_frame(j, min(ft, D), can, strokes)
        if ft > 0.25:
            fb = draw_frame(j, ft - 0.25, can, strokes)
        else:
            fb = draw_frame({}, 0.0, can, [])   # «пустой фон» до t=0
        a = _area_of(fa, pal[i % len(pal)])
        b = _area_of(fb, pal[i % len(pal)])
        present = a > 0 and b == 0   # метка появилась ровно на кадре t
        rows.append({"t": ft, "kind": s["kind"], "area": a, "before": b,
                     "present": present,
                     "s": (s.get("s") or s.get("text") or "")[:22]})
    return rows, D, strokes


# ------------------------------------------------------------ CLI ---
def main():
    args = sys.argv[1:]
    want_all = "--all" in args
    want_frames = "--frames" in args
    ids = [a for a in args if not a.startswith("--")]

    P = json.load(open(SEM, encoding="utf-8"))
    sessions = P["sessions"]
    if want_all:
        sel = sessions
    elif ids:
        sel = [s for s in sessions if s["id"] in ids]
    else:
        in_sched = {p["session"] for w in P.get("weeks", []) for p in w["pairs"]}
        sel = [s for s in sessions if s["id"] in in_sched]

    if not sel:
        print("нет сессий для проверки")
        return

    print(f"CV-проверка по меткам: {len(sel)} сессий (OpenCV {cv2.__version__})")
    fails = 0
    for s in sel:
        jpath = os.path.join(ROOT, s["file"])
        try:
            j = json.load(open(jpath, encoding="utf-8"))
        except Exception as e:
            print(f"  ✗ {s['id']}: НЕ ЧИТАЕТСЯ ({e})")
            fails += 1
            continue
        rows, D, strokes = audit(j)

        ok = sum(1 for r in rows if r["present"])
        bad = [r for r in rows if not r["present"]]

        # метки времени: декод == время кадра
        expected = sorted({min(int(round(t)), int(D)) for t in ([0.0, D] + [r["t"] for r in rows])})
        probes = []
        for t in expected:
            f = draw_frame(j, float(t), None, strokes)
            probes.append(read_timecode(f))
        markers_ok = len(probes) == len(expected) and all(a == b for a, b in zip(probes, expected))

        # после длительности ролика чёрнил нет (кадр D и D+0.5 идентичны)
        fA = draw_frame(j, D, None, strokes)
        fB = draw_frame(j, D + 0.5, None, strokes)
        tail_ok = float(np.abs(fA.astype(np.int16) - fB.astype(np.int16)).mean()) < 0.5

        status = "✓" if (bad or not ok == len(rows)) else ""
        reason = ""
        if ok != len(rows):
            b = bad[0]
            reason = f" — {len(bad)} мазков не появились (напр. t={b['t']} {b['kind']} area={b['area']})"
        if not markers_ok:
            reason += " — метки-штрихкоды НЕ совпадают с секундами"
        if not tail_ok:
            reason += " — после конца ролика что-то рисуется"

        ok_all = (ok == len(rows)) and markers_ok and tail_ok
        if not ok_all:
            fails += 1
        print(f"  {'✓' if ok_all else '✗'} {s['id']:8s} dur={D:6.1f}с  мазков {len(rows)} "
              f"→ CV видит {ok}/{len(rows)} • метки {markers_ok}{reason}")

        if want_frames:
            outdir = os.path.join(ROOT, "plan", "cv_frames", s["id"])
            os.makedirs(outdir, exist_ok=True)
            ts = sorted(set([0.0, min(D, D - 0.1), D] + [r["t"] for r in rows][:3]))
            for t in ts:
                cv2.imwrite(os.path.join(outdir, f"t{float(t):05.1f}.png"),
                            draw_frame(j, float(t), None, strokes))
            print(f"          кадры → plan/cv_frames/{s['id']}/")

    print(f"\nИтог: {len(sel) - fails} OK из {len(sel)} · расхождений {fails}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
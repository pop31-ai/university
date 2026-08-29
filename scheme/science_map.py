# Карта науки университета: все области, ядро парадигмы, уровни, канал доставки.
# Обычная работа строителя-исследователя: охватить полноту области, не таранить объём.

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle, FancyArrowPatch

PAPER  = "#fbf8f1"
INK    = "#1a2733"
BLUE   = "#2b5c8a"
GREEN  = "#2f6b4f"
AMBER  = "#a9652a"
RED    = "#8a2f3d"
GREY   = "#5b6a75"
GOLD   = "#b3892f"
LILAC  = "#6b4f8a"

fig, ax = plt.subplots(figsize=(16, 11))
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")
ax.set_facecolor(PAPER)
fig.patch.set_facecolor(PAPER)

def box(x, y, w, h, text, fc, ec=INK, tc=INK, fs=8, weight="bold", r=1.1):
    b = FancyBboxPatch((x-w/2, y-h/2), w, h,
                       boxstyle=f"round,pad=0.15,rounding_size={r}",
                       fc=fc, ec=ec, lw=1.3)
    ax.add_patch(b)
    ax.text(x, y, text, ha="center", va="center", fontsize=fs, color=tc,
            fontweight=weight, linespacing=1.22)

def arrow(x1, y1, x2, y2, color=GREY, lw=1.3, style="-|>"):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=13,
                        color=color, lw=lw, alpha=0.85)
    ax.add_patch(a)

# ---------- заголовок ----------
ax.text(50, 97.8, "ПОЛНАЯ КАРТА НАУКИ УНИВЕРСИТЕТА · полиарт-университет",
        ha="center", va="center", fontsize=16, weight="bold", color=INK)
ax.text(50, 91.6, "наука охватывает все области · цель: обучить, дав владение, не упустив желающего",
        ha="center", va="center", fontsize=10, color=BLUE, style="italic")
ax.plot([14, 86], [89.8, 89.8], color=GOLD, lw=1.2)

# ---------- ЯДРО (центр) ----------
box(50, 72, 24, 8, "ЦЕЛЬ\nобучить · владение · просвещение", BLUE, INK, PAPER, fs=9)
box(50, 61, 30, 6, "Кодекс  «свобода и цели»\n(индивид сам: темп · способ · пауза)", GREEN, INK, PAPER, fs=8.3)
box(50, 52, 34, 5, "МЕТА-НАУКА: как учить, чтоб не упустить желающего\n(применимо ко всем областям)", GOLD, INK, PAPER, fs=8)

# ---------- ОБЛАСТИ НАУКИ (кольцо) ----------
# верх
box(22, 84, 20, 5.4, "МАТЕМАТИКА\nанализ · алгебра · геометрия\nвероятность", "#dce6f2", BLUE, fs=8)
box(50, 86, 20, 4.6, "ФИЗИКА\nмеханика · электродинамика\nоптика · кванты", "#dce6f2", BLUE, fs=8)
box(78, 84, 20, 5.4, "ХИМИЯ\nобщая · органическая\nнеорганическая", "#dce6f2", BLUE, fs=8)
# правая
box(88, 64, 20, 5.6, "БИОЛОГИЯ\nклетка · генетика\nэкология · эволюция", "#dce6f2", BLUE, fs=8)
box(88, 47, 20, 5.6, "ЗЕМЛЯ И КОСМОС\nгеология · астрономия\nклимат", "#dce6f2", BLUE, fs=8)
# нижняя-правая
box(76, 30, 20, 5.6, "ИНФОРМАТИКА · ИИ\nпрограммирование\nданные · алгоритмы", "#ddeedd", GREEN, fs=8)
box(88, 16, 20, 5.6, "ИНЖЕНЕРИЯ\nэлектроника · механика\nэнергетика", "#ddeedd", GREEN, fs=8)
# нижняя-левая
box(12, 16, 20, 5.6, "ЧЕЛОВЕК И МЕДИЦИНА\nздоровье · этика\nкультура", "#e6ddf0", LILAC, fs=8)
box(24, 30, 20, 5.6, "ЭКОНОМИКА · ПРАВО\nэкономика · социология\nправо · управление", "#e6ddf0", LILAC, fs=8)
# левая
box(12, 47, 20, 5.6, "ГУМАНИТАРНЫЕ\nфилософия · история · логика\nпсихология · педагогика", "#f2e3d5", AMBER, fs=8)
box(12, 64, 20, 5.6, "ЯЗЫКИ · ЛИТЕРАТУРА\nязыки · литература\nискусство", "#f2e3d5", AMBER, fs=8)

# ---------- УРОВНИ (внизу) ----------
box(42, 13, 16, 4.6, "СТУДЕНТ\nосвоение · владение", RED, INK, PAPER, fs=8)
box(25, 13, 16, 4.6, "ЛАБОРАНТ\nизмерение · данные", GREEN, INK, PAPER, fs=8)
box(59, 13, 16, 4.6, "ПРОФЕССОР\nпроектирование курса", BLUE, INK, PAPER, fs=8)
box(73, 13, 16, 4.6, "КАНДИДАТ НАУК\nобоснование", BLUE, INK, PAPER, fs=8)
box(13, 24, 18, 3.8, "МАСТЕР ПР-ВА\nприменение", GREEN, INK, PAPER, fs=8)

# ---------- канал доставки ----------
box(50, 41, 42, 4.4, "ПОЛИАРТ · доска-урок · ролики (что сказать ⊕ как рассказать) · контур А→Я",
    AMBER, INK, PAPER, fs=8)

# связи: области -> ядро / мета-наука -> доставка -> студент
for x in (22, 50, 78):
    arrow(x, 81, x, 78, color=GREY, lw=1.1)
for x in (88, 88):
    arrow(x, 61, x, 57, color=GREY, lw=1.1)
for x in (12, 12):
    arrow(x, 61, x, 57, color=GREY, lw=1.1)
arrow(76, 33, 76, 44, color=AMBER, lw=1.3)   # инженерия -> доставка
arrow(24, 33, 24, 44, color=AMBER, lw=1.3)   # экономика -> доставка
arrow(50, 49, 26, 44, color=AMBER, lw=1.0)
arrow(50, 49, 74, 44, color=AMBER, lw=1.0)
arrow(50, 43, 50, 16, color=RED, lw=1.6)     # доставка -> студент

plt.tight_layout()
out = "scheme/science_map.png"
plt.savefig(out, dpi=160, bbox_inches="tight", facecolor=PAPER)
print("saved:", out)

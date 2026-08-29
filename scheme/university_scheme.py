# Схема университета: сфера, уровни, ядро парадигмы, поток обучения.
# Строится как единая карта. Обычная работа: выстроить понимание, не таранить объём.

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle, FancyArrowPatch
from matplotlib.lines import Line2D

fig, ax = plt.subplots(figsize=(14, 10))
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")

# ---------- Палитра (сдержанная, университетская) ----------
INK      = "#1a2733"   # чернила
PAPER    = "#fbf8f1"   # фон-мел
BLUE     = "#2b5c8a"
GREEN    = "#2f6b4f"
AMBER    = "#a9652a"
RED      = "#8a2f3d"
GREY     = "#5b6a75"
GOLD     = "#b3892f"

ax.set_facecolor(PAPER)
fig.patch.set_facecolor(PAPER)

def box(x, y, w, h, text, fc, ec, tc=INK, fs=9, weight="bold", r=1.2):
    b = FancyBboxPatch((x-w/2, y-h/2), w, h,
                       boxstyle=f"round,pad=0.18,rounding_size={r}",
                       fc=fc, ec=ec, lw=1.4)
    ax.add_patch(b)
    ax.text(x, y, text, ha="center", va="center", fontsize=fs,
            color=tc, fontweight=weight, linespacing=1.25)

def ring(x, y, rad, text, fc, ec, fs=8.5, tc=INK):
    c = Circle((x, y), rad, fc=fc, ec=ec, lw=1.3)
    ax.add_patch(c)
    ax.text(x, y, text, ha="center", va="center", fontsize=fs,
            color=tc, weight="bold", linespacing=1.2)

def arrow(x1, y1, x2, y2, color=GREY, lw=1.4, style="-|>", ls="-"):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=14,
                        color=color, lw=lw, linestyle=ls, alpha=0.85)
    ax.add_patch(a)

# ---------- Заголовок ----------
ax.text(50, 97.5, "СФЕРА УНИВЕРСИТЕТА · полиарт-университет",
        ha="center", va="center", fontsize=16, weight="bold", color=INK)
ax.text(50, 90.5, "свобода индивида → цель: обучить, дав владение, не упустив желающего",
        ha="center", va="center", fontsize=10, color=BLUE, style="italic")
ax.plot([18, 82], [88.6, 88.6], color=GOLD, lw=1.2)

# ---------- ЯДРО: цель и парадигма ----------
box(50, 70, 26, 9, "ЦЕЛЬ\nобучить, не упустив желающего;\nдать владение; просвещение", BLUE, INK, PAPER, fs=9)
box(50, 57.5, 30, 6.5, "Кодекс  «свобода и цели»\n(индивид сам: темп · способ · доска · пауза)", GREEN, INK, PAPER, fs=8.5)

# ---------- УРОВНИ (функциональные обязанности) ----------
# Внешнее кольцо: учредительные и общественные стороны
box(14, 62, 17, 5.4, "ГОСУДАРСТВО\nстандарты · аккредитация\nпризнание · заказ", GREY, INK, PAPER, fs=8)
box(34, 78, 17, 5.4, "УЧРЕДИТЕЛИ\nмиссия · устав · цель\nсуществования", GREY, INK, PAPER, fs=8)
box(50, 84, 17, 5.0, "РУКОВОДСТВО\nстратегия · ресурсы\nобеспечение курса", GREY, INK, PAPER, fs=8)
box(66, 78, 17, 5.4, "РОДИТЕЛИ\nдоверие · поддержка\nожидание (о детях)", GREY, INK, PAPER, fs=8)
box(86, 62, 17, 5.4, "ПРОФЕССОР — ВЕХА\nна него равняются", GOLD, INK, PAPER, fs=8.5)

# Внутренний круг: участники-носители обучения
box(24, 43, 17, 5.2, "ПРОФЕССОР / ДОЦЕНТ\nпроектирование курса\nобоснование подачи", BLUE, INK, PAPER, fs=8.3)
box(44, 33, 16, 5.2, "КАНДИДАТ НАУК\nнаучная достоверность\nподачи", BLUE, INK, PAPER, fs=8.3)
box(63, 33, 16, 5.2, "ЛАБОРАНТ\nизмерение · обработка\nданных", GREEN, INK, PAPER, fs=8.3)
box(82, 43, 16, 5.2, "МАСТЕР ПРОИЗВОДСТВА\nприменение · настройка\nпроцесса", GREEN, INK, PAPER, fs=8.3)
box(53, 20, 22, 5.4, "СТУДЕНТ\nосвоение · конспект · решение\nвладение", RED, INK, PAPER, fs=8.5)

# ---------- канал доставки ----------
box(50, 11, 40, 4.6, "ПОЛИАРТ · доска-урок · ролики = что сказать ⊕ как рассказать · контур А→Я",
    AMBER, INK, PAPER, fs=8)

# ---------- ядро парадигмы (низ) ----------
box(16, 11, 24, 4.6, "метрики: R (дошли) · R₂ (вернулись) · S (сохранили)", "#c9d8c9", INK, PAPER, fs=8)
box(84, 11, 26, 4.6, "оценка — УЧИТЕЛЮ (не экзамен) · библиотека · двусторонний цикл", "#e3d9c0", INK, PAPER, fs=8)

# ---------- связи ----------
# цель -> уровни участников
arrow(50, 66.5, 50, 84.5, color=BLUE)      # цель -> руководство
arrow(46, 65, 34, 75, color=BLUE)         # цель -> учредители
arrow(54, 65, 66, 75, color=BLUE)         # цель -> родители
arrow(24, 62, 26, 48, color=GREY)         # гос-во -> проф/доцент (стандарты)
arrow(86, 62, 83, 48, color=GOLD)         # профессор-веха -> мастер
arrow(33, 43, 45, 35.5, color=BLUE)       # проф -> кандидат
arrow(52, 35.5, 60, 35.5, color=BLUE)     # кандидат -> лаборант
arrow(49, 36, 49, 24, color=RED, lw=1.6)  # кандидат/лаборант -> студент
arrow(33, 43, 47, 22.5, color=RED, lw=1.5)# проф -> студент
arrow(73, 35.5, 72, 24, color=RED, lw=1.5)# лаборант -> студент
arrow(82, 45, 63, 24, color=RED, lw=1.5)  # мастер -> студент
arrow(50, 22.5, 50, 15.5, color=AMBER, lw=1.7)  # студент -> полиарт (обучение)
arrow(50, 13.5, 50, 15.5, color=AMBER, lw=1.2)  # полиарт -> студент (доставка)

# легенда
ax.annotate("", xy=(12, 94), xytext=(12, 95.5), arrowprops=dict(arrowstyle="-|>", color=BLUE, lw=1.4))
ax.text(14, 94.3, "цель -> уровни", fontsize=8, color=BLUE)
ax.annotate("", xy=(40, 94), xytext=(40, 95.5), arrowprops=dict(arrowstyle="-|>", color=RED, lw=1.5))
ax.text(42, 94.3, "ведение (учить -> студент)", fontsize=8, color=RED)
ax.annotate("", xy=(66, 94), xytext=(66, 95.5), arrowprops=dict(arrowstyle="-|>", color=AMBER, lw=1.6))
ax.text(68, 94.3, "полиарт-доставка", fontsize=8, color=AMBER)

plt.tight_layout()
out = "scheme/university_scheme.png"
plt.savefig(out, dpi=160, bbox_inches="tight", facecolor=PAPER)
print("saved:", out)

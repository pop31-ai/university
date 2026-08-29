/*=============================================================
 * lines/math.js — предметная линия «Математический анализ»
 * polimuli-chalkboard · ведущий: профессор Полиартова (мел)
 *
 * Последовательность курса (пара 1): от введения производной
 * через вывод из определения и правила — к геометрии, цепному
 * правилу, второй производной, экстремумам и исследованию
 * графика. Спираль повторений и рубежный контроль.
 * Каждая запись: { week, meta, head, goal, steps }
 * ============================================================*/

const { STAFF } = require('../staff');

const MATH_LINE = [
  { week: 1, meta: { id: 'k01', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Введение · Что такое производная (скорость)',
    goal: 'Понять производную как мгновенную скорость изменения через предел приращения.',
    steps: [
      { act: 'note', s: 'Было: предел. Сегодня: производная — скорость изменения.', font: 'bold 22px "Segoe UI"', color: null },
      { act: 'text', s: 'v = Δs/Δt  при Δt→0', font: 'bold 30px "Segoe UI"' },
      { act: 'box', x: 0, y: 0, w: 340, h: 56, color: 'accent' },
      { act: 'note', s: 'Определение: производная = lim приращения', color: 'green' },
      { act: 'text', s: 'f′(x) = lim ( f(x+h) − f(x) ) / h', font: 'bold 28px "Segoe UI"' },
      { act: 'note', s: 'Геометрия: касательная, k_кас = f′(x₀)', color: 'blue' },
      { act: 'note', s: 'Итог: производная — мгновенная скорость изменения', color: null }
    ] },

  { week: 1, meta: { id: 'k02', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Вывод производной из определения (пошагово)',
    goal: 'Просветительски вывести f(x)=x² → f′(x)=2x из определения, с паузами на списывание.',
    write: true,
    steps: [
      { act: 'note', s: 'Шаг 1: f(x+h) − f(x) = (x+h)² − x²' },
      { act: 'note', s: 'Шаг 2: (x+h)² = x² + 2xh + h²' },
      { act: 'note', s: 'Шаг 3: сокращаем x² → 2xh + h²' },
      { act: 'note', s: 'Шаг 4: выносим h → h·(2x+h)' },
      { act: 'note', s: 'Шаг 5: делим на h → 2x + h' },
      { act: 'note', s: 'Шаг 6: предел h→0 → f′(x)=2x' },
      { act: 'box', x: 0, y: 0, w: 260, h: 64, color: 'accent' }
    ] },

  { week: 2, meta: { id: 'k04', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Правила дифференцирования (сумма, произведение)',
    goal: 'Вывести и применить (f+g)′, (cf)′, (f·g)′ через определение.',
    steps: [
      { act: 'note', s: '(f+g)′ = f′ + g′' },
      { act: 'note', s: '(cf)′ = c·f′' },
      { act: 'note', s: '(f·g)′ = f′g + fg′' },
      { act: 'note', s: 'пример: (x³)′ = 3x²', color: 'green' }
    ] },

  { week: 4, meta: { id: 'k05', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Геометрический смысл производной',
    goal: 'Касательная, скорость роста; знак производной → возрастание/убывание.',
    steps: [
      { act: 'note', s: 'f′>0 → возрастает; f′<0 → убывает' },
      { act: 'note', s: 'касательная: y = f(x₀) + f′(x₀)(x−x₀)' }
    ] },

  { week: 6, meta: { id: 'k06', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Производная сложной функции (цепное правило)',
    goal: 'Уметь дифференцировать композиции; вывести (f∘g)′ = f′(g)·g′.',
    steps: [
      { act: 'note', s: '(f∘g)′ = f′(g(x)) · g′(x)' },
      { act: 'note', s: 'пример: ( (2x+1)² )′ = 4(2x+1)', color: 'green' }
    ] },

  { week: 8, meta: { id: 'k07', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Рубежный контроль 1 · Производная',
    goal: 'Повторить и закрепить: определение, правила, геометрический смысл.',
    steps: [
      { act: 'note', s: 'повторение определения' },
      { act: 'note', s: 'правила дифференцирования' },
      { act: 'note', s: 'задачи на скорость/касательную' },
      { act: 'box', x: 0, y: 0, w: 320, h: 60, color: 'accent' }
    ] },

  { week: 9, meta: { id: 'k08', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Вторая производная: выпуклость и точки перегиба',
    goal: 'Исследование графика: f″>0 → выпукла; перегиб в f″=0.',
    steps: [
      { act: 'note', s: 'f″(x) — скорость изменения f′' },
      { act: 'note', s: 'f″>0 → выпукла, f″<0 → вогнута' },
      { act: 'note', s: 'точка перегиба: f″=0' }
    ] },

  { week: 11, meta: { id: 'k09', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Применение: поиск экстремумов',
    goal: 'Алгоритм max/min через условие f′=0 и знак производной.',
    steps: [
      { act: 'note', s: 'критические точки: f′=0' },
      { act: 'note', s: 'проверка знака производной' },
      { act: 'note', s: 'пример: максимизировать площадь', color: 'green' }
    ] },

  { week: 13, meta: { id: 'k10', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Эскиз графика по первой и второй производной',
    goal: 'Полное исследование функции и построение графика.',
    steps: [
      { act: 'note', s: '1) область, 2) нули, 3) f′, 4) f″' },
      { act: 'note', s: 'монотонность, выпуклость, экстремумы' },
      { act: 'note', s: 'пример графика', color: 'green' }
    ] },

  { week: 15, meta: { id: 'k11', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Повторение всего курса',
    goal: 'Сводная карта курса: производная, правила, геометрия, графики.',
    steps: [
      { act: 'note', s: 'определение производной' },
      { act: 'note', s: 'правила и цепное правило' },
      { act: 'note', s: 'исследование графика' }
    ] },

  { week: 16, meta: { id: 'k12', engine: 'chalkboard', room: 'math', teacher: STAFF.profMath },
    head: 'Рубежный контроль 2 · Итог',
    goal: 'Итоговая проверка: производная и её применения.',
    steps: [
      { act: 'note', s: 'итоговые задачи' },
      { act: 'note', s: 'исследование функции' },
      { act: 'box', x: 0, y: 0, w: 340, h: 60, color: 'accent' }
    ] }
];

module.exports = { MATH_LINE };

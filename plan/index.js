/*=============================================================
 * index.js — СБОРКА УЧЕБНОГО ПЛАНА СЕМЕСТРА
 * polimuli-chalkboard · 2026/2027 · 1-й семестр · 16 нед × 4 ак.ч
 *
 * Спираль «были необученными → стали обученными»:
 * каждая линия (мат / физика / полиарт) — отдельный файл (по предмету
 * и преподавателю), здесь они собираются в единый упорядоченный
 * CURRICULUM (по неделе → паре). Генератор превращает записи в
 * конспекты-сессии, каждый — с образовательным РЕЗУЛЬТАТОМ (что усвоил).
 * ============================================================*/

const { STAFF, ROOMS } = require('./staff');
const { MATH_LINE } = require('./lines/math');
const { PHYSICS_LINE } = require('./lines/physics');
const { POLYART_LINE } = require('./lines/polyart');

// объединяем линии, сохраняя структуру занятия
const RAW = []
  .concat(MATH_LINE.map(l => Object.assign({ side: 'math' }, l)))
  .concat(PHYSICS_LINE.map(l => Object.assign({ side: 'physics' }, l)))
  .concat(POLYART_LINE.map(l => Object.assign({ side: 'polyart' }, l)));

// упорядочиваем по неделе и паре
function pairOf(side, week) {
  // math и physics — пара 1 (профильная), polyart — пара 2
  return side === 'polyart' ? 2 : 1;
}
RAW.forEach(l => { l.pair = pairOf(l.side, l.week); });

RAW.sort((a, b) => (a.week - b.week) || (a.pair - b.pair));

// финальный CURRICULUM: добавляем цель-результат «стал обученным»
const CURRICULUM = RAW.map(lesson => {
  const roomId = lesson.meta.room;
  return {
    week: lesson.week,
    pair: lesson.pair,
    side: lesson.side,
    meta: lesson.meta,
    room: ROOMS[roomId] ? ROOMS[roomId].title : roomId,
    head: lesson.head,
    goal: lesson.goal,
    // образовательный результат: что студент усвоил в этом занятии
    outcome: lesson.outcome || ('освоил: ' + lesson.head),
    steps: lesson.steps || [],
    scheme: lesson.scheme || [],
    quest: lesson.quest || null,
    write: !!lesson.write
  };
});

module.exports = { CURRICULUM, WEEKS: 16, ACADEMIC_OF_WEEK: 4, PAIRS_PER_WEEK: 2, STAFF, ROOMS };

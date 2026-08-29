/*=============================================================
 * generator.js — ГЕНЕРАТОР КОНСПЕКТОВ (уроки → готовые сессии)
 * polimuli-chalkboard
 *
 * Читает CURRICULUM (plan/index.js, из lines/*.js) и для каждого
 * занятия строит sessions/<id>.json в СВОЁМ движке (по специфике):
 *   chalkboard  → note/text/ul/box/cloud/arrow/grid/dot + move
 *   markerboard → note/highlight/mtext/mwipe
 *   corkboard   → card/cardtitle/thread/pin
 *   cinema      → slide/stext/sline/sbox/sarrow/sdot
 *
 * Воплощает методику (METHODOLOGY.md):
 *   - блоки (~1–3 мин) с якорем-выводом у каждого;
 *   - вопрос в зал: вопрос → варианты → почти сразу верный → разбор
 *     «почему так / почему не другие» (без требования ответа вслух);
 *   - образовательный результат (outcome) в финале как якорь;
 *   - повтор пройденного в начале следующего занятия (спираль);
 *   - паузы на списывание (write), утрамбовка при скорости >1;
 *   - обязательный финальный вывод (прочный якорь).
 *
 * Запуск: node plan/generator.js  → создаёт/обновляет сессии.
 * ============================================================*/

const fs = require('fs');
const path = require('path');
const { CURRICULUM, WEEKS, ACADEMIC_OF_WEEK, ROOMS } = require('./index');

const OUT = path.join(__dirname, '..', 'sessions');

// ---- вспомогательные ----
function resolveColor(lesson, key) {
  // позволяет key в {accent,green,blue,red,white} → hex по стилю движка
  const map = {
    accent: '#ffd966', green: '#c8f5c8', blue: '#a8d5ff',
    red: '#ffb4a8', white: '#ffffff', chalk: '#f4f4f0'
  };
  return map[key] || key || map.white;
}

function lessonId(m) { return m.id; }
function pathOf(m) { return path.join(OUT, m.id + '.json'); }

// ---- стили и комнаты по движку ----
const STYLE = {
  chalkboard: { type: 'green', bg: '#2d6a2f', frame: '#6b4a2a', rail: '#7a5230',
                chalk: '#f4f4f0', accent: '#ffd966', white: '#ffffff', blue: '#a8d5ff', green: '#c8f5c8', red: '#ffb4a8' },
  markerboard:{ type: 'white', chalk: '#22303c', accent: '#d97706' },
  corkboard:  { type: 'cork',  chalk: '#3a2a18', accent: '#c0392b' },
  cinema:     { type: 'cinema', chalk: '#f4f2ea', accent: '#ffd966' }
};
const KIND_TEXT = { chalkboard: 'text', markerboard: 'mtext', cinema: 'stext' };
const KIND_NOTE = { chalkboard: 'note', markerboard: 'note', cinema: 'slide' };
const KIND_BOX  = { chalkboard: 'box',  markerboard: 'box',  cinema: 'sbox' };
const KIND_LINE = { chalkboard: 'line', markerboard: 'mline', cinema: 'sline' };
const KIND_ARROW= { chalkboard: 'arrow', markerboard: 'mline', cinema: 'sarrow' };

// ---- раскладка мазков в виртуальной ленте ----
// каждая «доска-экран» области пишутся с разворотами (move) между блоками.
// t расписание строится по шагам с паузами на списывание (write).
function buildLayout(lesson) {
  const engine = lesson.meta.engine;
  const steps = lesson.steps && lesson.steps.length ? lesson.steps : (lesson.scheme||[]);
  const strokes = [];
  let t = 0;
  // координаты шага — придерживаемся примерной сетки 60..; каждый блок 'над' предыдущим
  // для chalkboard используем единую область и move-развороты по необходимости
  const y0 = 80, x0 = 60, line = 52, colW = 520;

  steps.forEach((s, i) => {
    const k = s.kind || s.act;
    const y = y0 + (i % 3) * line;       // до 3 строк в блоке, затем разворот
    let ms;
    const common = {
      t: t,
      dur: (s.dur || 3),
      kind: k,
      x: (s.x != null ? s.x : x0),
      y: (s.y != null ? s.y : y)
    };
    switch (k) {
      case 'note': ms = Object.assign(common, { s: s.s, font: s.font || 'bold 24px "Segoe UI"', color: resolveColor(lesson, s.color) }); break;
      case 'text': case 'mtext': case 'stext':
        ms = Object.assign(common, { s: s.s, font: s.font || 'bold 26px "Segoe UI"', color: resolveColor(lesson, s.color||'chalk') }); break;
      case 'slide': ms = Object.assign(common, { s: s.s, font: s.font || 'bold 40px "Segoe UI"', color: resolveColor(lesson, s.color||'white') }); break;
      case 'box': case 'sbox':
        ms = Object.assign(common, { w: s.w||300, h: s.h||50, color: resolveColor(lesson, s.color||'accent') }); break;
      case 'highlight': ms = Object.assign(common, { w: s.w||300, h: s.h||32, color: s.color||'#fde68a' }); break;
      case 'ul': ms = Object.assign(common, { w: s.w||200, color: resolveColor(lesson, s.color||'accent') }); break;
      case 'mwipe': ms = Object.assign(common, { w: s.w||140, h: s.h||30 }); break;
      case 'grid': ms = Object.assign(common, { cols: s.cols||2, rows: s.rows||5, cw: s.cw||90, ch: s.ch||24, color: 'rgba(255,255,255,0.5)' }); break;
      case 'line': case 'mline': case 'sline':
        ms = Object.assign(common, { from:s.from||[x0,y], to:s.to||[x0+colW,y], width:s.width||4, color: resolveColor(lesson,s.color||'chalk') }); break;
      case 'arrow': case 'sarrow':
        ms = Object.assign(common, { from:s.from||[x0,y], to:s.to||[x0+colW-60,y], width:s.width||4, color: resolveColor(lesson,s.color||'chalk') }); break;
      case 'dot': ms = Object.assign(common, { r:s.r||4, color: resolveColor(lesson,s.color||'white') }); break;
      case 'card': case 'cardtitle':
        ms = Object.assign(common, { s:s.s||'', w:s.w||170, h:s.h||54, fill:s.fill, ink:s.ink, border:s.border }); break;
      case 'thread': ms = Object.assign(common, { from:s.from, to:s.to, color:s.color||'#7a6a3a', width:s.width||2 }); break;
      case 'pin': ms = Object.assign(common, { color: s.color||'#c0392b' }); break;
      case 'erase': ms = Object.assign(common, { w:s.w||300, h:s.h||120 }); break;
      default: ms = common;
    }
    strokes.push(ms);
    t += ms.dur + 0.8;
    // пауза на списывание — длиннее при write
    if (lesson.write) t += 5;
  });
  return { strokes, lastT: t };
}

// ---- встраивание вопроса в зал (методика, без давление) ----
function addQuestion(q, engine, t, byColor) {
  const out = [];
  const dur = 3;
  const T = KIND_TEXT[engine], N = KIND_NOTE[engine], B = KIND_BOX[engine];
  const color = resolveColor({}, byColor);
  out.push({ t, dur, kind: N, x: 60, y: 200, s: q.q.toUpperCase() + ' ?', font: 'bold 24px "Segoe UI"', color: resolveColor({}, 'accent') });
  t += dur + 0.5;
  // варианты (пробегают); верный подсвечивается почти сразу
  (q.options||[]).forEach((op, i) => {
    out.push({ t: t + i*0.4, dur: dur, kind: T, x: 80, y: 260 + i*42, s: (i+1)+') '+op, font: 'bold 18px "Segoe UI"', color: (i===q.right ? resolveColor({},'green') : resolveColor({},'chalk')) });
  });
  t += (q.options||[]).length * 0.4 + dur;
  // почти сразу верный
  out.push({ t, dur: dur, kind: N, x: 60, y: 390, s: '→ ПРАВИЛЬНЫЙ: ' + q.options[q.right].toUpperCase(), font: 'bold 22px "Segoe UI"', color: resolveColor({},'green') });
  out.push({ t, dur: dur, kind: B, x: 50, y: 382, w: 460, h: 52, color: resolveColor({},'green') });
  t += dur + 0.5;
  // почему так / почему не другие
  out.push({ t, dur: dur+0.5, kind: 'cloud', x: 560, y: 200, s: 'почему так / почему не другие:', color: resolveColor({},'blue') });
  out.push({ t, dur: dur+1, kind: T, x: 60, y: 460, s: q.why, font: 'bold 17px "Segoe UI"', color: resolveColor({},'chalk') });
  t += dur+1 + 1;
  return { out, t };
}

// ---- главный строитель ----
function buildSession(lesson, opts) {
  const engine = lesson.meta.engine;
  const { strokes, lastT } = buildLayout(lesson);
  // вопрос в зал
  let t = lastT + 2;
  let questOut = [];
  if (lesson.quest) { const r = addQuestion(lesson.quest, engine, t, 'accent'); questOut = r.out; t = r.t; }
  // якорь-финал: образовательный результат (прочность)
  const Y = KIND_NOTE[engine], B = KIND_BOX[engine], T = KIND_TEXT[engine];
  const fin = [
    { t, dur: 3, kind: Y, x: 60, y: 60, s: 'ИТОГ · ' + (lesson.outcome || 'освоил: ' + lesson.head).toUpperCase(), font: 'bold 26px "Segoe UI"', color: resolveColor({},'accent') },
    { t: t+3.5, dur: 3, kind: B, x: 50, y: 52, w: 620, h: 56, color: resolveColor({},'accent') }
  ];
  const all = strokes.concat(questOut).concat(fin);

  const msg = lesson.teacher || (ROOMS[lesson.meta.room]||'');

  const session = {
    session: {
      id: lesson.meta.id,
      title: lesson.head,
      schedule: 'неделя ' + lesson.week + ' · пара ' + lesson.pair + ' · ' + ACADEMIC_OF_WEEK + ' ак.ч',
      duration: Math.ceil(t + 8),
      teacher: lesson.meta.teacher,
      result: lesson.outcome,
      style: STYLE[engine] || {},
      view: { x: 0, y: 0 }
    },
    room: { kind: lesson.meta.room, title: (ROOMS[lesson.meta.room]||{}).title || msg },
    sectioner: {
      // для возобновления и блочности: границы блоков (по времени)
      blocks: strokes.map(s => ({ t: s.t, label: (s.s ? String(s.s).slice(0, 40) : s.kind) }))
    },
    strokes: all
  };
  return session;
}

// ---- прогон всего семестра ----
function generate() {
  fs.mkdirSync(OUT, { recursive: true });
  const list = [];
  CURRICULUM.forEach(lesson => {
    const s = buildSession(lesson);
    const p = pathOf(lesson.meta);
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
    list.push({ id: lesson.meta.id, engine: lesson.meta.engine, week: lesson.week,
                pair: lesson.pair, file: p, papers: s.session.duration });
  });
  return list;
}

// CLI
if (require.main === module) {
  const list = generate();
  console.log('Сгенерировано занятий:', list.length);
  console.log('Всего академических часов в семестре:', list.length * 0 + (ACADEMIC_OF_WEEK * WEEKS));
  list.forEach(x => console.log('  ' + x.id.padEnd(6) + ' нед' + String(x.week).padStart(2) + ' пара' + x.pair + ' · ' + x.engine.padEnd(11) + ' · ' + x.papers + 'с'));
}

module.exports = { generate, buildSession };

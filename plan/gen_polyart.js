/*=============================================================
 * gen_polyart.js — ПРЕОБРАЗОВАТЕЛЬ МЕТА-ЯЗЫКА ПОЛИАРТА В СЕССИИ
 * polimuli-chalkboard
 *
 * Берёт компактные занятия META_LINE (plan/meta_polyart.js) и
 * разворачивает каждое в полную играемую сессию на движке
 * engine/polyart.js. Программа на выходе значительно больше
 * исходной записи: из 5–6 строк блока вырастают десятки мазков
 * (заголовки, строки, подсветки, полёты камер, слой духа,
 * разбор вопроса, якорь-итог) с раскладкой по лентам-зонам.
 *
 * Запуск: node plan/gen_polyart.js  → пишет sessions/pXX.json
 * ============================================================*/

const fs = require('fs');
const path = require('path');
const { META_LINE } = require('./meta_polyart');

const OUT = path.join(__dirname, '..', 'sessions');
const ACADEMIC_OF_WEEK = 4;

// зона в мета-языке -> id зоны движка polyart
const ZONE_ALIAS = {
  'метод-кабинет': 'маркер',
  'комната идей': 'пробка',
  'кинозал': 'кино',
  'класс-мел': 'мел',
  'холл': 'холл',
  'мел': 'мел',
  'маркер': 'маркер',
  'пробка': 'пробка',
  'кино': 'кино'
};

// палитра по зарезервированным ключам (как в plan/generator.js)
const COLOR = {
  accent: '#ffd966', green: '#c8f5c8', blue: '#a8d5ff',
  red: '#ffb4a8', white: '#ffffff', chalk: '#f4f4f0'
};
function resolveColor(c) { return COLOR[c] || c || COLOR.white; }

// базовые мазки по kind с раскладкой в зоне (x,y — относительно зоны)
function layoutStroke(zoneIdx, kind, extras) {
  return Object.assign({
    t: 0, dur: 3, kind, x: 70, y: 110, zone: zoneIdx
  }, extras);
}

// окно внутри зоны: столбец записи сдвигается по строкам
let rowPos = { i: 0, x: 70, y: 110 };
function nextRow() {
  const y = rowPos.y + rowPos.i * 56;
  rowPos.i++;
  return { x: 70, y };
}

// ---- мазок текста/заголовка ----
function makeText(zoneIdx, text, opts) {
  const p = nextRow();
  return layoutStroke(zoneIdx, 'text', {
    s: text, x: p.x, y: p.y,
    font: (opts && opts.font) || '700 30px "Segoe UI"',
    color: resolveColor(opts && opts.color)
  });
}
function makeHead(zoneIdx, text) {
  const p = nextRow();
  return [
    layoutStroke(zoneIdx, 'text', { s: text.toUpperCase(), x: p.x, y: p.y, font: '800 34px "Segoe UI"', color: COLOR.accent }),
    layoutStroke(zoneIdx, 'box', { w: 420, h: 56, x: p.x - 8, y: p.y - 6, color: COLOR.accent, dur: 3.4 })
  ];
}

// ---- полёт камеры вокруг зоны ----
function makeCam(zoneIdx, text) {
  return layoutStroke(zoneIdx, 'cam', {
    s: text || '',
    dur: 3.2, a0: 0.1, span: 1.2,
    t: 0 // t выставляется при сборке блока
  });
}

// ---- слой духа полиарта ----
function makeSpirit(text, t) {
  return { t, dur: 4, kind: 'spirit', s: text };
}

// ---- справочник на стене зоны (зал как инструмент) ----
function makeRef(zoneIdx, title) {
  return { t: 0, dur: 1, kind: 'ref', ref: title, zone: zoneIdx };
}

// ---- плашка виртуального помощника (опциональная реакция поверх зоны) ----
function makeAttention(zoneIdx, label, t, sec) {
  return {
    t, dur: sec || 3, kind: 'box', x: 40, y: 40, w: 620, h: 64,
    color: COLOR.blue, zone: zoneIdx
  };
}

// ---- вопрос в зал (паттерн: вопрос → варианты → верный → почему) ----
function addQuestion(q, zoneIdx, t0) {
  const out = [];
  const col = zoneIdx;
  const d = 3;
  let t = t0;
  const push = (st) => { st.t = t; out.push(st); t += st.dur + 0.5; };
  // вопрос — заголовок
  push(layoutStroke(col, 'text', { s: q.q.toUpperCase().replace(/\?\s*$/, '') + '?', x: 60, y: 200, font: 'bold 24px "Segoe UI"', color: COLOR.accent, dur: d }));
  t += 0.5;
  // варианты (пробегают)
  (q.options || []).forEach((op, i) => {
    push(layoutStroke(col, 'text', {
      s: (i + 1) + ') ' + op, x: 80, y: 260 + i * 42, dur: d,
      font: 'bold 18px "Segoe UI"',
      color: (i === q.right ? COLOR.green : COLOR.chalk)
    }));
  });
  t += 0.5;
  // почти сразу верный
  push(layoutStroke(col, 'box', { w: 460, h: 52, x: 50, y: 382, color: COLOR.green, dur: d }));
  push(layoutStroke(col, 'text', { s: '→ ПРАВИЛЬНЫЙ: ' + q.options[q.right].toUpperCase(), x: 60, y: 390, font: 'bold 22px "Segoe UI"', color: COLOR.green, dur: d }));
  t += 0.5;
  // почему так / почему не другие
  push(layoutStroke(col, 'text', { s: 'почему так / почему не другие:', x: 60, y: 460, font: 'bold 17px "Segoe UI"', color: COLOR.blue, dur: d }));
  push(layoutStroke(col, 'text', { s: q.why, x: 60, y: 500, font: 'bold 17px "Segoe UI"', color: COLOR.chalk, dur: d + 1 }));
  t += 1;
  // реприза завершается возгласами одобрения (реакция зала поверх всего)
  push(makeSpirit('возгласы одобрения · зал с нами', t));
  t += 0.5;
  return { out, t };
}

// ---- сборка одной сессии из мета-записи ----
function buildSession(lesson) {
  // порядок зон сессии (алиасы -> id движка)
  const zones = (lesson.zones && lesson.zones.length)
    ? lesson.zones.map(z => ZONE_ALIAS[z] || z)
    : ['мел'];

  const strokes = [];
  let t = 0;

  // справочники на стенах (постоянный фон-инструмент каждой зоны)
  strokes.push(makeRef(0, (lesson.blocks[0] && lesson.blocks[0].s) ? 'занятие ' + lesson.week : lesson.title));

  // активная зона: начинаем с первой
  let active = 0;
  let wroteCount = 0;

  lesson.blocks.forEach((b, bi) => {
    // мета-сахар: смена активной зоны строками вида «зона: текст»
    if (typeof b === 'string' && b.indexOf(': ') > 0) {
      const m = /^(.+?):\s?(.*)$/.exec(b);
      if (m && ZONE_ALIAS[m[1].trim().toLowerCase()]) {
        const nz = zones.indexOf(ZONE_ALIAS[m[1].trim().toLowerCase()]);
        if (nz >= 0) active = nz;
        b = m[2] || '';
      }
    }

    if (typeof b === 'string') {
      if (!b) return;
      // длинный текст разбиваем на строки
      b.split('·').forEach((part) => {
        const s = part.trim();
        if (!s) return;
        const st = makeText(active, s);
        st.t = t;
        strokes.push(st);
        t += st.dur + 0.8;
        wroteCount++;
      });
      return;
    }

    // объектные формы
    if (b.head) {
      const hs = makeHead(active, b.head);
      hs.forEach(h => { h.t = t; strokes.push(h); });
      t += 4;
      return;
    }
    if (b.helper) {
      // опциональный виртуальный помощник: спасает ситуацию, не подменяя профессора
      strokes.push(makeAttention(active, '🤖 виртуальный помощник', t, 2.6));
      strokes.push(makeSpirit('🤖 ' + b.helper, t + 1.0));
      t += 4.6;
      return;
    }
    if (b.spirit) {
      strokes.push(makeSpirit(b.spirit, t));
      t += 4.4;
      return;
    }
    if (b.cam !== undefined) {
      const z = (typeof b.cam === 'number') ? b.cam : active;
      const c = makeCam(z, b.s || '');
      c.t = t;
      strokes.push(c);
      // после полёта возвращаемся в зону
      strokes.push(layoutStroke(z, 'move', { to: [z * 900, 0], sec: 1.2, t: t + c.dur }));
      t += c.dur + 1.4;
      return;
    }
    if (b.zone && b.s) {
      const z = zones.indexOf(ZONE_ALIAS[b.zone] || b.zone);
      if (z >= 0) active = z;
      strokes.push(layoutStroke(active, 'zone', { s: b.s, t }));
      t += 1.6;
      return;
    }
    if (b.m) {
      const kind = b.m;
      const z = (b.zone !== undefined) ? b.zone : active;
      const p = nextRow();
      const st = layoutStroke(z, kind, {
        s: b.s || '', x: b.x != null ? b.x : p.x, y: b.y != null ? b.y : p.y,
        dur: b.dur || 3,
        ...(b.w != null ? { w: b.w } : {}),
        ...(b.h != null ? { h: b.h } : {}),
        ...(b.color ? { color: resolveColor(b.color) } : {}),
      });
      st.t = t;
      strokes.push(st);
      t += st.dur + 0.8;
      wroteCount++;
      return;
    }
  });

  // вопрос в зал (после блоков)
  let qOut = [];
  if (lesson.quest) { const r = addQuestion(lesson.quest, active, t + 2); qOut = r.out; t = r.t; }

  // якорь-итог (прочность владения)
  const fin = [
    { t, dur: 3, kind: 'text', x: 60, y: 60, font: '800 26px "Segoe UI"', color: COLOR.accent, zone: active, s: 'ИТОГ · ' + lesson.outcome.toUpperCase() },
    { t: t + 3.5, dur: 3, kind: 'box', x: 50, y: 52, w: 740, h: 56, color: COLOR.accent, zone: active }
  ];
  t += 7;

  const all = strokes.concat(qOut).concat(fin);

  // полная длительность и панорама к финалу
  const session = {
    session: {
      id: lesson.id,
      title: lesson.title,
      schedule: 'неделя ' + lesson.week + ' · пара ' + lesson.pair + ' · ' + ACADEMIC_OF_WEEK + ' ак.ч',
      duration: Math.ceil(t + 8),
      teacher: (lesson.teacher && lesson.teacher.name) || lesson.teacher,
      result: lesson.outcome,
      style: { type: 'polyart', rail: '#1a1d18' },
      view: { x: 0, y: 0 }
    },
    zones,
    room: { kind: 'polyart', title: 'пространство полиарт' },
    sectioner: {
      blocks: all.map(s => ({ t: s.t, label: (s.s ? String(s.s).slice(0, 40) : s.kind) }))
    },
    strokes: all
  };
  return session;
}

// ---- прогон всего семестра ----
function generate() {
  fs.mkdirSync(OUT, { recursive: true });
  const list = [];
  META_LINE.forEach(lesson => {
    const s = buildSession(lesson);
    fs.writeFileSync(path.join(OUT, lesson.id + '.json'), JSON.stringify(s, null, 2) + '\n');
    list.push({ id: lesson.id, week: lesson.week, pair: lesson.pair, zones: s.zones.length, papers: s.session.duration });
  });
  return list;
}

// CLI
if (require.main === module) {
  const list = generate();
  console.log('Полиарт-сессии:', list.length);
  list.forEach(x => console.log('  ' + x.id + ' нед' + String(x.week).padStart(2) + ' пара' + x.pair + ' · зон:' + x.zones + ' · ' + x.papers + 'с'));
}

module.exports = { generate, buildSession };
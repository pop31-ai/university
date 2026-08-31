/*=============================================================
 * videos.js — ПРОДЮСЕР КАРТ РОЛИКОВ «ОТ А ДО Я» (насыщенных)
 * polimuli-chalkboard · режиссура (VIDEO.md)
 *
 * Читает plan/semester.json (37 сессий) и САМ конспект каждой
 * сессии (sessions/<id>.json). Карта ролика — НЕ пустой каркас:
 * каждая фаза контура А→Я несёт РЕАЛЬНЫЙ материал сессии.
 *
 * Что даёт ролик (в духе профессора):
 *   - «под запись» — реальные мазки/шаги/формулы из конспекта
 *     (note/text/slide/card...), которые зритель списывает;
 *   - демонстрации — пример/опыт по предмету (пример в фазе В,
 *     опыт/интерпретация в фазе Г), построенные из материала сессии;
 *   - вопрос в зал — облако/развилка (если есть в конспекте);
 *   - якорь финала — итог и outcome.
 *
 * «Не уложимся в полиарт»: ролик несёт сам предметный материал
 * (матем/физика/...), а не формальную оболочку; полиарт-сессии
 * (пара 2) тоже наполняются своим содержанием.
 *
 * Запуск: node plan/videos.js  → пишет plan/videos/<id>.json (37 карт).
 * ============================================================*/

const fs = require('fs');
const path = require('path');

const SEMESTER = path.join(__dirname, 'semester.json');
const OUT = path.join(__dirname, 'videos');

// ---- контур А→Я: фазы, их доля и роль ----
const PHASES = [
  { ph: 'А', name: 'Зацепка',       lo: 0,  hi: 8,  kind: 'cloud',
    demo: 'вопрос-провокация: «а что здесь и зачем?»' },
  { ph: 'Б', name: 'Якорь старта',  lo: 8,  hi: 14, kind: 'note',
    demo: 'определение/понятие и маршрут от А до Я.' },
  { ph: 'В', name: 'Разбор',        lo: 14, hi: 70, kind: 'text',
    demo: 'ПОД ЗАПИСЬ: шаги/формулы из конспекта + пример.' },
  { ph: 'Г', name: 'Ключ/развилка', lo: 70, hi: 82, kind: 'cloud',
    demo: 'ОПЫТ/интерпретация: «если так — то так; если не так — то так».' },
  { ph: 'Д', name: 'Сборка',        lo: 82, hi: 94, kind: 'box',
    demo: 'итоговая формула/схема: свести от зацепки к результату.' },
  { ph: 'Я', name: 'Якорь финала',  lo: 94, hi: 100, kind: 'box',
    demo: 'ИТОГ · ОСВОИЛ: <outcome>.' }
];

// мазки, несущие текст (материал «под запись»)
function textOf(stroke) {
  return stroke && stroke.s && String(stroke.s).trim();
}

// извлекаем реальное содержимое конспекта
function extractContent(session) {
  const strokes = session.strokes || [];
  const content = strokes
    .map(s => ({ kind: s.kind, text: textOf(s), t: s.t }))
    .filter(c => c.text);
  return content;
}

// хронометраж массива текстов в «плотный» ролик: 1 мазок ≈ 3с хода
function seconds(n) { return n * 3 + 2; }

// демонстрация-пример по предмету (строится из материала сессии)
function makeExample(session, content) {
  const firstForm = content.find(c => /[=→]/ .test(c.text) && /[0-9xhvfs]/i.test(c.text));
  const base = 'пример из сессии: ' + (firstForm ? firstForm.text : 'разобрать на доске шаг за шагом');
  return {
    what: 'Пример',
    notes: base,
    from: firstForm ? firstForm.kind : 'text'
  };
}

// демонстрация-опыт/интерпретация (физика — опыт, матем — смысл/график)
function makeExperience(session) {
  const side = session.side || (session.room === 'lab' ? 'physics' : 'math');
  if (side === 'physics') {
    return { what: 'Опыт', notes: 'показать явление → замерить → вывести закон/формулу; развилка: верно/неверно.', from: 'cloud' };
  }
  if (side === 'polyart') {
    return { what: 'Метод', notes: 'развилка: как метод применяется к предмету из прошлых сессий; возврат к цели.', from: 'cloud' };
  }
  // math
  return { what: 'Интерпретация', notes: 'связать формулу со смыслом (например производная = скорость, геометрия = касательная); развилка верно/неверно.', from: 'cloud' };
}

// вопрос в зал из конспекта (если встретили cloud/вопрос)
// не берём итоговый блок (ИТОГ/ОСВОИЛ — это якорь, а не вопрос)
// и не берём строки без знака вопроса, чтобы не поймать формулу/итог
function findQuestion(content) {
  const q = content.find(c =>
    /[\?]/.test(c.text) && !/ИТОГ|ОСВОИЛ|освоил/i.test(c.text));
  return q ? { q: q.text, from: q.kind } : null;
}

// как грамотно рассказать (слой изложения) — по фазам
const NARRATE = {
  А: 'общий план комнаты → наезд на доску; темп спокойный, зацепка',
  Б: 'наезд на определение; пауза ~1с, дать прочитать',
  В: 'средний план; задержка взгляда на каждой формуле; вопрос вслух',
  Г: 'контраст планов двух исходов развилки; темп ровный, без спешки',
  Д: 'отъезд: показать целое на доске; свести к цели',
  Я: 'крупный план итога; тихий уверенный финал'
};

// ритм/темп/тон на уровне всего ролика; профессор — веха, учитель с учениками
function videoNarration(meta) {
  return {
    tempo: 'медленно на выводах и формулах, ускорить на повторе пройденного',
    cuts: 'наезд на формулу при появлении, удержание 1с; разворот ленты между фазами',
    pacing: 'каждая фаза = отдельный эпизод; без долгих пауз, кроме Б и Я',
    tone: 'учитель → ученики, ровно, уверенно, без спешки и без воды'
  };
}

// учитель с учениками: профессор — веха (эталон владения), двусторонний цикл
function videoTeacher(meta) {
  return {
    role: 'учитель с учениками',
    landmark: 'профессор — веха: эталон хода мысли, к нему идёт каждый',
    asks: 'вопрос в зал, пауза на ответ и осмысление',
    scaffold: 'снять затруднение: «почему так / почему не другие», повторить иначе',
    care: 'не упустить желающего: заметить, подбодрить, довести до вехи',
    mutual: 'профессор учится у учеников, как и они у него: фидбек выборки делает его удачным'
  };
}

// точки сбора сигнала «дошло/не дошло» для учителя — по фазе (ASSESS.md §4)
const FEEDBACK = {
  А: 'зацепил ли выборку? (включились / ушли)',
  Б: 'дошло ли стартовое определение и маршрут?',
  В: 'что из «под запись» реально задержалось? где споткнулись?',
  Г: 'снято ли «почему так / почему не другие»?',
  Д: 'связан ли итог с целью/вехой? читается ли сборка?',
  Я: 'называет ли выборка outcome своими словами (по желанию)?'
};

// фазы с распределённым реальным материалом (три слоя: конспект + дух + рассказ)
function buildScenes(session, content, len, isPolyart) {
  const scenes = [];
  const meta = session; // поля недели, пары, движка...

  const phases = PHASES.map(f => ({ ...f, at: Math.round(f.lo * len / 100) }));

  // распределим текст-материал по фазам (В — разбор, Г — развилка, Д — сборка)
  const buckets = { В: [], Г: [], Д: [] };
  content.forEach((c, i) => {
    const b = (i < Math.ceil(content.length * 0.7)) ? 'В' : (i % 3 === 0 ? 'Д' : 'Г');
    buckets[b].push(c);
  });

  const example = makeExample(session, content);
  const experience = makeExperience(session);
  const question = findQuestion(content);

  phases.forEach(f => {
    // слой конспекта (что под запись)
    let conspect = [];
    // слой духа просвещения (зачем/как смотреть)
    let spirit = f.demo;

    if (f.ph === 'А') {
      conspect = [meta.title];
      spirit = 'провокация/удивление: «а что здесь и зачем?» · ожидание';
    } else if (f.ph === 'Б') {
      conspect = content.slice(0, 1).map(c => c.text);   // первое определение
      spirit = 'маршрут от А до Я: где мы и куда идём';
    } else if (f.ph === 'В') {
      conspect = buckets.В.map(c => c.text);              // реальные шаги/формулы
      spirit = (isPolyart ? 'модель помещения и камер показывают метод' : (example.what + ': ' + example.notes));
    } else if (f.ph === 'Г') {
      conspect = (question ? [question.q] : ['зачем это и когда ошибаемся?']);
      spirit = experience.what + ': ' + experience.notes + ' · «если так — то так; если не так — то так»';
    } else if (f.ph === 'Д') {
      conspect = buckets.Д.map(c => c.text).concat([meta.task]).filter(Boolean);
      spirit = 'свести от зацепки к результату: итоговый вывод/формула';
    } else if (f.ph === 'Я') {
      conspect = [(meta.outcome || ('освоил: ' + meta.title)).toUpperCase()];
      spirit = 'возврат к цели: назвать, что освоено';
    }

    scenes.push({
      phase: f.ph,
      name: f.name,
      at: f.at,
      pct: f.lo,
      kind: f.kind,
      conspect,          // ЧТО сказать (под запись)
      spirit,            // ДУХ просвещения (зачем/как смотреть)
      narration: NARRATE[f.ph],   // КАК грамотно рассказать
      feedback_teacher: FEEDBACK[f.ph]  // точки сбора сигнала учителю (ASSESS.md)
    });
  });
  return scenes;
}

// ---- модель помещения и расположение камер (ноу-хау университета) ----
const ROOM_MODEL = {
  math:   { kind: 'math',   title: 'Кабинет математики',   zones: ['доска-лента', 'лектор-кафедра', 'справочники-формулы'] },
  lab:    { kind: 'lab',    title: 'Лаборатория физики',    zones: ['опытный стол', 'доска', 'измерители-шкалы'] },
  cinema: { kind: 'cinema', title: 'Кинозал · экран-лента', zones: ['экран-лента', 'проектор', 'зрительный зал'] },
  office: { kind: 'office', title: 'Метод-кабинет · маркерная', zones: ['маркерная доска', 'стол-план', 'полки конспектов'] },
  idea:   { kind: 'idea',   title: 'Пробковая комната идей', zones: ['пробковые стены', 'стол-карточки', 'нити связей'] },
  aud_math: { kind: 'aud_math', title: 'Кафедра математики 30×30', zones: ['меловая доска', 'кафедра-подиум', 'ряды парт'] },
  lab_phys: { kind: 'lab_phys', title: 'Кафедра физики 30×40',    zones: ['меловая доска', 'опытный стол', 'столы приборов'] },
  lab_chem: { kind: 'lab_chem', title: 'Кафедра химии 30×40',     zones: ['маркерная доска', 'столы реактивов', 'колбы-шкалы'] },
  wood:    { kind: 'wood',    title: 'Кафедра фанеры 30×30',      zones: ['фанерная доска', 'верстаки-тиски', 'ЧПУ-станок'] },
  lab_rnd:      { kind: 'lab_rnd',      title: 'НИР-лаборатория 30×40', zones: ['доска гипотез', 'стойка приборов', 'научный стол'] },
  bureau_okr:   { kind: 'bureau_okr',   title: 'ОКР-бюро 30×30',       zones: ['чертёжная доска', 'кульманы', 'полки прототипов'] },
  machine_shop: { kind: 'machine_shop', title: 'Машиностроительный цех 40×30', zones: ['доска допусков', 'станочные ряды', 'стол контроля'] },
  elec_shop:    { kind: 'elec_shop',    title: 'Электро-радиомастерская 30×30', zones: ['доска схем', 'стенды пайки', 'стеллажи деталей'] },
  test_stand:   { kind: 'test_stand',   title: 'Испытательный стенд 40×40', zones: ['доска норм', 'испытательные машины', 'зажимы и датчики'] },
  cpc:          { kind: 'cpc',          title: 'Центр коллективного пользования 40×40', zones: ['измерительный центр', 'острова приборов', 'доска записи'] },
  test_range:   { kind: 'test_range',   title: 'Испытательный полигон 60×40 (внешний)', zones: ['разметка поля', 'мишени', 'открытая площадка'] },
  pilot_plant:  { kind: 'pilot_plant',  title: 'Опытное производство 30×30', zones: ['доска качества', 'ячейки выпуска', 'склад заготовок'] },
  uni_net:      { kind: 'uni_net',      title: 'Центр внешних связей 30×30', zones: ['круглый стол', 'глобус-партнёры', 'экраны связей'] },
  stand:        { kind: 'stand',        title: 'Стенд-экспозиция 30×30',   zones: ['панель-витрина', 'подиумы экспонатов', 'ходы обзора'] }
};

function camPlan(zone) {
  if (zone.indexOf('формул') >= 0 || zone.indexOf('экран') >= 0) return 'крупный';
  if (zone.indexOf('опыт') >= 0 || zone.indexOf('измерител') >= 0) return 'средний';
  return 'общий';
}

function buildProduction(meta, isPolyart) {
  const room = ROOM_MODEL[meta.room] || ROOM_MODEL.math;
  // летающие камеры по зонам кабинета (ноу-хау университета)
  const cams = room.zones.map((z, i) => ({
    id: 'CAM' + (i + 1),
    zone: z,
    plan: camPlan(z),
    motion: 'летающая/плавный проход'
  }));
  // какая камера ведёт фазу: разбор — на доске/формуле, зацепка — общий, финал — итог
  const camByPhase = {
    А: 0, Б: 1 % cams.length, В: cams.length - 1, Г: 1, Д: 0, Я: cams.length - 1
  };
  const shots = PHASES.map(f => ({
    phase: f.ph,
    cam: cams[camByPhase[f.ph] % cams.length].id,
    plan: cams[camByPhase[f.ph] % cams.length].plan
  }));
  return {
    room,
    cams,
    shots,
    note: isPolyart
      ? 'ПОЛИАРТ-РОЛИК: главное — пространство и камеры (ноу-хау), конспект приложен.'
      : 'Предметный ролик: конспект на доске в планах камер.'
  };
}

function mapSession(entry) {
  // реальный конспект сессии
  let content = [];
  let len = entry.duration || 90;
  let isPolyart = entry.side === 'polyart' || entry.pair === 2;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', entry.file), 'utf8'));
    content = extractContent(j);
    if (j.session && j.session.duration) len = j.session.duration;
  } catch (e) {
    content = [];
  }
  const scenes = buildScenes(entry, content, len, isPolyart);
  return {
    video: {
      session: entry.id,
      file: entry.file,
      engine: entry.engine,
      room: entry.room,
      side: isPolyart ? 'polyart' : (entry.side || (entry.pair === 2 ? 'polyart' : 'subject')),
      title: entry.title,
      outcome: entry.outcome || ('освоил: ' + entry.title),
      length: len,
      filled: content.length,        // сколько реальных текстовых мазков впитано
      week: entry.week,
      pair: entry.pair,
      teacher: entry.teacher
    },
    narration: videoNarration(entry),            // КАК рассказать (уровень ролика)
    teacher: videoTeacher(entry),                  // УЧИТЕЛЬ с учениками; профессор — веха
    production: buildProduction(entry, isPolyart), // модель помещения и камер (ноу-хау)
    scenes
  };
}

function generate() {
  const P = JSON.parse(fs.readFileSync(SEMESTER, 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const list = [];
  P.sessions.forEach(s => {
    const map = mapSession(s);
    fs.writeFileSync(path.join(OUT, s.id + '.json'), JSON.stringify(map, null, 2) + '\n');
    list.push({ id: s.id, engine: s.engine, filled: map.video.filled, len: map.video.length });
  });
  const idx = {
    produced: list.length,
    note: 'Ролик = что сказать ⊕ как грамотно рассказать: каждая сцена несёт конспект (под запись), дух просвещения (зачем/как смотреть) и рассказ (план/темп/монтаж). Предметные ролики наполняются конспектом; полиарт — пространством и камерами (ноу-хау, доводится вручную).',
    videos: list
  };
  fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(idx, null, 2) + '\n');
  return list;
}

// CLI
if (require.main === module) {
  const list = generate();
  console.log('Карт роликов «от а до я» (насыщенных материалом) создано:', list.length);
  const byEngine = {};
  list.forEach(v => { byEngine[v.engine] = (byEngine[v.engine] || 0) + 1; });
  console.log('По движкам:', JSON.stringify(byEngine));
  list.slice(0, 6).forEach(v => console.log('  ' + v.id.padEnd(6) + v.engine.padEnd(11) + 'мазков:' + String(v.filled).padStart(3) + ' · ' + v.len + 'с'));
  console.log('... и ещё', Math.max(0, list.length - 6), 'карт (см. plan/videos/).');
}

module.exports = { generate, PHASES };

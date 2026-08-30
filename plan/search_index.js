/*=============================================================
 * search_index.js — ИНДЕКС ТЕКСТОВ РОЛИКОВ (поиск по содержанию)
 * polimuli-chalkboard
 *
 * Сила курса против обычного видео: весь материал — текст.
 * Из каждой карты (plan/videos/*.json) и сессии (sessions/*.json)
 * собираем строки с таймкодами: что написано на доске (мазки),
 * что говорится/показывается (сцены: conspect + spirit + narration),
 * и приписываем СМЫСЛОВЫЕ категории (теги) из лексики духа сцены —
 * чтобы искать по смыслу («профессор запнулся, погас свет»),
 * а не только по буквам.
 *
 * Результат: plan/search.json для player/search.html.
 * ============================================================*/

const fs = require('fs');
const path = require('path');

const VIDEOS = 'plan/videos';
const SESSIONS = 'sessions';
const OUT = 'plan/search.json';

// ---- смысловые категории: маркеры соответствуют лексике полей spirit/tone/narration ----
// syn — слова-запросы, подсказывающие категорию (поиск «по смыслу», а не по буквам)
const CATS = [
  { cat: 'затруднение', em: '⚠️', syn: ['запнулся', 'споткнулся', 'затруднился', 'ошибся', 'забыл', 'сомнение', 'не выходит'],
    mar: ['затрудн', 'ошиб', 'споткн', 'развилк', 'верно/неверно', 'не другие', 'если так — то так', 'если так — то', 'не так', 'поправ'] },
  { cat: 'провокация', em: '⚡', syn: ['удивление', 'зацепка', 'вовлечь', 'интрига', 'неожиданно'],
    mar: ['зацепк', 'удивл', 'провокац', 'ожидание', 'а что здесь', 'зачем'] },
  { cat: 'пауза', em: '⏸', syn: ['пауза', 'тишина', 'помолчать', 'списать', 'осмыслить', 'передышка'],
    mar: ['пауз', 'тиши', 'списыва', 'осмыслен', 'дать прочитать', 'прочитать', 'подождать'] },
  { cat: 'вопрос-залу', em: '🗣', syn: ['вопрос в зал', 'спросить', 'кто ответит', 'спрошу'],
    mar: ['вопрос', 'в зал', 'залу', 'кто', 'ответ', 'выборку', 'выборка'] },
  { cat: 'итог', em: '🏁', syn: ['итог', 'вывод', 'резюме', 'главное', 'финал', 'собрать'],
    mar: ['итог', 'освоил', 'финал', 'свести', 'результат', 'сборка', 'цель'] },
  { cat: 'одобрение', em: '👏', syn: ['возгласы одобрения', 'аплодисменты', 'похвала', 'браво', 'молодец', 'зал доволен', 'реакция зала'],
    mar: ['одобрен', 'аплодис', 'возглас', 'браво', 'реакция зала', 'зал с нами', 'свет включается'] },
  { cat: 'маршрут', em: '🧭', syn: ['маршрут', 'план занятия', 'куда идём', 'цель занятия', 'структура'],
    mar: ['маршрут', 'куда идём', 'старт', 'от а до я'] },
  { cat: 'свет', em: '💡', syn: ['погас свет', 'свет выключили', 'темно', 'мрак', 'лампочка', 'электричество', 'в темноте'],
    mar: ['свет', 'мрак', 'затемн', 'ламп', 'окн', 'гас'] },
  { cat: 'связь', em: '🔗', syn: ['связь', 'аналогия', 'связать', 'взаимосвязь'],
    mar: ['интерпретац', 'связать', 'смысл', 'сегодня', 'было'] },
  { cat: 'опыт', em: '🧪', syn: ['опыт', 'эксперимент', 'измерение', 'замер', 'лабораторная'],
    mar: ['опыт', 'измерени', 'данные', 'закон', 'эксперимент'] },
  { cat: 'полёт', em: '🎥', syn: ['камера', 'план съёмки', 'наезд', 'облёт', 'летающая камера'],
    mar: ['камер', 'план', 'наезд', 'отъезд', 'полёт', 'облёт', 'летающ'] },
  { cat: 'возрастание', em: '📈', syn: ['возрастание', 'растёт', 'увеличение', 'рост', 'вверх'],
    mar: ['возрастан', 'убыван', 'растёт', 'рост', 'знак производной'] }
];

function norm(s) {
  return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function tagsOf(text) {
  const n = norm(text);
  return CATS.filter(c => c.mar.some(m => n.includes(m))).map(c => c.em + c.cat);
}

// теги из эмодзи-персон и движка в полушапке
function personTags(anyText) {
  const t = anyText || '';
  const tags = [];
  if (t.includes('🧑') || t.includes('👨')) tags.push('👨‍🏫 преподаватель');
  if (t.includes('🎬') || t.includes('кинокадр') || t.includes('ректор')) tags.push('🎬 кино');
  if (t.includes('👩')) tags.push('👩‍💼 наставник');
  if (t.includes('🧪') || t.includes('опыт') || t.includes('доцент')) tags.push('🧑‍🔬 физика');
  return tags;
}

const files = fs.readdirSync(VIDEOS).filter(f => f.endsWith('.json') && f !== '_index.json');
const rows = [];

for (const f of files) {
  const map = JSON.parse(fs.readFileSync(path.join(VIDEOS, f), 'utf8'));
  const v = map.video || {};
  const id = v.session;
  const title = v.title || id;
  const engine = v.engine || '';
  const week = v.week, pair = v.pair, side = v.side;
  const teacher = v.teacher || '';
  const pre = { id, title, engine, week, pair, side, teacher };

  // сессия: мазки с текстом
  let sess = null;
  try { sess = JSON.parse(fs.readFileSync(path.join(SESSIONS, id + '.json'), 'utf8')); }
  catch (e) { /* нет сессии — только карта */ }
  const strokes = (sess && sess.strokes) || [];

  // строки-сцены: что происходит в момент at
  for (const sc of (map.scenes || [])) {
    const conspect = (sc.conspect || []).join(' · ');
    const spirit = sc.spirit || '';
    const narration = sc.narration || '';
    const fb = sc.feedback_teacher || '';
    const text = [conspect, spirit, narration, fb].filter(Boolean).join(' :: ');
    if (!text) continue;
    rows.push(Object.assign({}, pre, {
      kind: 'сцена',
      phase: sc.phase || '',
      name: sc.name || '',
      at: sc.at,
      t: sc.at,
      text: text,
      conspect: conspect,
      tags: tagsOf(text).concat(personTags(teacher + ' ' + map.narration && (map.narration.tone||'')))
    }));
  }

  // строки-мазки: что написано на доске секундой t
  for (const st of strokes) {
    const t = st.t;
    const raw = st.s !== undefined ? st.s : (st.text !== undefined ? st.text : '');
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const text = String(raw);
    rows.push(Object.assign({}, pre, {
      kind: 'мазок',
      phase: '',
      name: st.kind || '',
      at: Math.round(t * 10) / 10,
      t: Math.round(t * 10) / 10,
      text: text,
      conspect: '',
      tags: tagsOf(text).concat(personTags(teacher))
    }));
  }
}

// дубликаты отпустим: поиск сам упорядочит по релевантности.
fs.writeFileSync(OUT, JSON.stringify({
  note: 'поиск по содержанию роликов: сцена/мазок → таймкод + смысловые категории',
  count: rows.length,
  cats: CATS.map(c => c.em + c.cat),
  synon: CATS.reduce((a, c) => { a[c.em + c.cat] = c.syn || []; return a; }, {}),
  rows
}, null, 1));

console.log('Индекс поиска: записей ' + rows.length + ' · роликов ' + files.length + ' · → ' + OUT);
const catCnt = {};
for (const r of rows) for (const tg of r.tags) catCnt[tg] = (catCnt[tg] || 0) + 1;
for (const k of Object.keys(catCnt).sort()) console.log('   ' + k + ': ' + catCnt[k]);
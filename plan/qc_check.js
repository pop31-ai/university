/*=============================================================
 * qc_check.js — контроль качества охвата кампуса (ВУЗ = инфраструктура).
 * Проверяет согласованность каталога залов между движком и реестрами,
 * а также полноту обязательных полей каждой модели (конвенция roomBase).
 *
 * Узлы:
 *  1) движок engine/auditorium.js :: MODELS — модель есть, поля валидны
 *     (surface{bzc,bw,bly,bty,bg,chalk}, furniture в списке, view/views, name/cathedra);
 *  2) реестр plan/semester.json rooms + sessions — каждая новая модель упомянута
 *     и имеет демо-сессию;
 *  3) ROOM_MODEL в plan/videos.js покрывает все модели;
 *  4) селектор player/field.html SESSIONS покрывает все демо-сессии (axx/охват);
 *  5) категории охвата: лаборатории / НИР / ОКР / мастерские / испытательные /
 *     внешние / внутренние — каждая категория представлена моделью.
 *
 * Запуск: node plan/qc_check.js
 * ============================================================*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENGINE = path.join(ROOT, 'engine', 'auditorium.js');
const SEMESTER = path.join(ROOT, 'plan', 'semester.json');
const VIDEOS_JS = path.join(ROOT, 'plan', 'videos.js');
const FIELD = path.join(ROOT, 'player', 'field.html');

let problems = 0;
function report(kind, id, msg) {
  problems++;
  console.log('  [' + kind + '] ' + id + ': ' + msg);
}
function note(msg) { console.log('  · ' + msg); }

// ---- 1) МОДЕЛИ ДВИЖКА ----
const eng = fs.readFileSync(ENGINE, 'utf8');
if (eng.indexOf('var MODELS = {') < 0) { report('движок', 'auditorium.js', 'MODELS не найден'); return; }

// Все allowed furniture-виды в drawFurniture
const FURN_KINDS = ['desks', 'tables', 'seats', 'stands', 'benches', 'fixture'];
const SURFACE_KEYS = ['bzc', 'bw', 'bly', 'bty', 'bg', 'chalk'];
const GOOD_FURN = new Set(FURN_KINDS);

// Извлечь имена моделей из MODELS { name: roomBase({...
// Надёжно: ищем "name: '<НАЗВ>' ," и ключ перед ним. Проще: ключ pattern '  <key>: roomBase({'
const models = {};
const re = /^\s{4}([a-z_][a-z0-9_]*):\s*roomBase\(\{/gm;
let mm;
while ((mm = re.exec(eng)) !== null) {
  const key = mm[1];
  // баланс скобок: regex съел '{', поэтому стартуем с depth=1
  let depth = 1, end = -1;
  for (let i = re.lastIndex; i < eng.length; i++) {
    const ch = eng[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = end > 0 ? eng.slice(mm.index, end + 1) : eng.slice(mm.index, mm.index + 1500);
  models[key] = block;
}

if (eng.indexOf("MODELS.auditorium = MODELS.aud_math;") < 0) report('движок', 'аудиториум-алиас', 'нет MODELS.auditorium = MODELS.aud_math');

const modelNames = Object.keys(models);
console.log('Движок: найдено моделей = ' + modelNames.length + ': ' + modelNames.join(', '));

modelNames.forEach(key => {
  const b = models[key];
  if (!b) return;
  if (!/name:\s*'[^']+'/.test(b)) report('движок', key, 'нет name');
  if (!/cathedra:\s*'[^']+'/.test(b)) report('движок', key, 'нет cathedra');
  // surface с ключами
  let sfOk = true;
  const sf = b.indexOf('surface: {');
  if (sf < 0) sfOk = false;
  else {
    const sfEnd = b.indexOf('},', sf);
    const sfBlk = b.slice(sf, sfEnd > 0 ? sfEnd : sf + 120);
    SURFACE_KEYS.forEach(k => { if (sfBlk.indexOf(k + ':') < 0) sfOk = false; });
  }
  if (!sfOk) report('движок', key, 'surface неполный (нужны bzc,bw,bly,bty,bg,chalk)');
  // furniture
  const fm = /furniture:\s*'([^']+)'/.exec(b);
  if (!fm) report('движок', key, 'нет furniture');
  else if (!GOOD_FURN.has(fm[1])) report('движок', key, 'furniture вне списка: ' + fm[1]);
  // view / views
  if (!/view:\s*\{/.test(b)) report('движок', key, 'нет view');
  if (!/views:\s*\{/.test(b)) report('движок', key, 'нет views');
});

// ---- 2) РЕЕСТР SEMESTER ----
const P = JSON.parse(fs.readFileSync(SEMESTER, 'utf8'));
const roomMap = P.rooms || {};
const sessions = P.sessions || [];

// комнаты, объявленные в реестре
const declaredRooms = Object.keys(roomMap);

// модели движка, которые требуют регистрации в семестре
const registeredModels = new Set(declaredRooms);
modelNames.forEach(mn => {
  if (!registeredModels.has(mn)) report('реестр', mn, 'модель движка не объявлена в semester.json rooms');
});

// демо-сессии: для каждой новой модели (охвата) проверить наличие сессии в расписании
const demoByRoom = {};
sessions.forEach(s => { if (s.room) demoByRoom[s.room] = (demoByRoom[s.room] || 0) + 1; });

const COVERAGE = {
  'НИР': ['lab_rnd'],
  'ОКР': ['bureau_okr'],
  'мастерская': ['wood', 'machine_shop', 'elec_shop'],
  'испытательный': ['test_stand', 'test_range'],
  'лаборатория': ['lab_phys', 'lab_chem', 'lab_rnd', 'cpc'],
  'внешний': ['test_range'],
  'опытное производство': ['pilot_plant'],
  'внешние коммуникации': ['uni_net']
};

console.log('\nОхват кампуса по категориям:');
Object.keys(COVERAGE).forEach(cat => {
  const hits = COVERAGE[cat].filter(m => modelNames.includes(m));
  const inReg = hits.filter(m => registeredModels.has(m));
  const tag = (hits.length && inReg.length === hits.length) ? 'OK' : 'НЕПОЛНЫЙ';
  if (tag === 'НЕПОЛНЫЙ') { problems++; }
  console.log('  - ' + cat.padEnd(20) + tag + '  ' + (hits.length ? hits.join(', ') : '(нет моделей)'));
});

modelNames.forEach(mn => {
  if (COVERAGE['ВНЕШНИЙ'] && COVERAGE['ВНЕШНИЙ'].includes(mn)) return;
});
// каждой модели, кроме алиасов и спец, нужна демо-сессия в расписании
const SKIP_DEMO = new Set(['auditorium', 'lab', 'stand', 'cinema']); // stand/cinema имеют свои
modelNames.forEach(mn => {
  if (SKIP_DEMO.has(mn)) return;
  if (!(demoByRoom[mn] > 0)) report('демо', mn, 'нет демо-сессии в расписании для зала');
});

// ---- 3) ROOM_MODEL в videos.js ----
const vj = fs.readFileSync(VIDEOS_JS, 'utf8');
modelNames.forEach(mn => {
  const rr = new RegExp('\\b' + mn + ':\\s*\\{');
  if (!vj.match('kind: \'' + mn)) report('videos.js', mn, 'нет ROOM_MODEL[' + mn + ']');
});

// ---- 4) player/field.html SESSIONS ----
const fh = fs.readFileSync(FIELD, 'utf8');
// каждая демо-сессия охвата должна быть доступна в селекторе поля
const COVERAGE_DEMO_IDS = ['b01_rnd', 'b02_okr', 'b03_shop', 'b04_elec', 'b05_stand', 'b06_cpc', 'b07_range', 'b08_pilot', 'b09_net'];
let fieldCovered = 0;
COVERAGE_DEMO_IDS.forEach(id => {
  if (fh.indexOf(id) >= 0) fieldCovered++;
  else report('field.html', id, 'демо-сессия охвата не объявлена в селекторе поля');
});
console.log('\nplayer/field.html: демо-сессий охвата в селекторе = ' + fieldCovered + '/' + COVERAGE_DEMO_IDS.length);

console.log('\nКОНТРОЛЬ КАЧЕСТВА: проблем = ' + problems + (problems ? ' (FIX!)' : ' (OK)'));
process.exit(problems ? 1 : 0);

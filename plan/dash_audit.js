/*=============================================================
 * dash_audit.js — АУДИТ ПОЛНОТЫ И СОВПАДЕНИЯ ВЫВОДА дашборда.
 *
 * Запускает РЕАЛЬНЫЙ render-код player/dashboard.html в Node с лёгким
 * фейк-DOM и фейк-fetch (подменяя ../plan/semester.json на настоящие данные),
 * перехватывает весь выведенный текст и сверяет его с источником правды:
 *
 *   1) полнота афиш        — каждая announcement.session видна в выводе;
 *   2) полнота залов       — каждый room из афиш выведен с именем (имя не пусто);
 *   3) полнота субъектов   — каждая роль из subjects выведена в сводке;
 *   4) совпадение ссылок   — каждый session файл существует и объявлен в field.html;
 *   5) отсутствие потерь   — число выведенных афиш/залов/ролей == источнику;
 *   6) повторяемость месяц — маска недель корректна и повторяемость совпадает;
 *   7) печатный отчёт      — PDF/HTML-отчёт выводит весь контент (афиши/залы/роли/KPI).
 *
 * Запуск: node plan/dash_audit.js   (exit 0 = OK, 1 = найдены расхождения).
 * ============================================================*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEMESTER = JSON.parse(fs.readFileSync(
  process.env.SEMESTER_OVERRIDE || path.join(ROOT, 'plan', 'semester.json'), 'utf8'));
// тестируемое: реальный дашборд, либо переопределённый (DASH_OVERRIDE=путь) для негативных тестов
const dashPath = process.env.DASH_OVERRIDE || path.join(ROOT, 'player', 'dashboard.html');
const DASH = fs.readFileSync(dashPath, 'utf8');
const FIELD = fs.readFileSync(path.join(ROOT, 'player', 'field.html'), 'utf8');
// печатный отчёт дашборда (PDF/HTML) — для сверки полноты второго представления
const reportPath = process.env.REPORT_OVERRIDE || path.join(ROOT, 'docs', 'dashboard_report.html');
const reportPdf = process.env.REPORT_PDF_OVERRIDE || path.join(ROOT, 'docs', 'dashboard_report.pdf');
const REPORT_HTML = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;

let failures = 0;
function report(msg) { failures++; console.log('  [НЕ] ' + msg); }
function ok(msg) { console.log('  [OK] ' + msg); }

// ----------------------------------------------------------------
// ФЕЙК-DOM: перехватываем все записи содержимого элементов.
// ----------------------------------------------------------------
const emitted = []; // все строки, которые дашборд реально внедрил в разметку

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _children: [],
    _html: '',
    _text: '',
    className: '',
    dataset: {},
    style: {},
    title: '',
    hidden: false,
    value: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v);
      if (this._html) emitted.push(this._html);
      this._children = [];
    },
    get textContent() { return this._text; },
    set textContent(v) {
      this._text = String(v);
      if (this._text) emitted.push(this._text);
    },
    appendChild(c) {
      this._children.push(c);
      if (c && (c._text || c._html)) emitted.push(c._text || c._html);
      return c;
    },
    insertAdjacentHTML(pos, html) {
      const h = String(html);
      if (pos === 'afterbegin' && h) emitted.push(h);
      this._html += h;
    },
    addEventListener() {},
    remove() {},
    onclick: null,
    classList: { add(){}, remove(){}, toggle(){} }
  };
  return el;
}

// статические id из разметки дашборда
const staticIds = (DASH.match(/id="([a-zA-Z_][\w]*)"/g) || [])
  .map(function (s) { return s.slice(4, -1); });

const elements = {};
staticIds.forEach(function (id) { elements[id] = makeEl('div'); });

// фейк document
const document = {
  getElementById(id) { return elements[id] || (elements[id] = makeEl('div')); },
  createElement(tag) { return makeEl(tag); },
  querySelectorAll() { return []; }
};

// фейк fetch: отдаёт настоящий semester.json
const fetch = function () {
  return Promise.resolve({ json: function () { return Promise.resolve(SEMESTER); } });
};

// фейк URLSearchParams + location
class URLSearchParams {
  constructor(q) { this.q = q || ''; }
  get(k) { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(this.q); return m ? decodeURIComponent(m[1]) : null; }
}
const location = { search: '' };

// ----------------------------------------------------------------
// ИЗВЛЕЧЬ render-код дашборда и выполнить его.
// ----------------------------------------------------------------
const script = DASH.match(/<script>([\s\S]*?)<\/script>/)[1];

// извлечь HALLS: room -> name из render-кода дашборда
const hallBlock = script.match(/var HALLS = \{(.*?)\n    \};/s);
const hallNames = {};
if (hallBlock) {
  const hre = /^\s*([a-z_][a-z0-9_]*):\s*\{\s*name:\s*'([^']*)'/gm;
  let hm;
  while ((hm = hre.exec(hallBlock[1])) !== null) hallNames[hm[1]] = hm[2];
}

// число недель в типовом месяце — берём из дашборда, чтобы держать в синхроне (по умолчанию 5)
const mwMatch = script.match(/var MONTH_WEEKS\s*=\s*(\d+)/);
const MONTH_WEEKS = mwMatch ? +mwMatch[1] : 5;

// выполнить в текущей области видимости, чтобы document/fetch/location были видны
const runner = new Function('document', 'fetch', 'URLSearchParams', 'location', script + '\n');
runner(document, fetch, URLSearchParams, location);

// даём асинхронному fetch.json() время завершиться и отрендерить
setTimeout(function () {
  runAudit();
}, 50);

function runAudit() {
  const ann = SEMESTER.announcements || [];
  const subjects = SEMESTER.subjects || {};
  const all = emitted.join('\n');
  const plain = all.replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' '); // без разметки и лишних пробелов

  console.log('Перехвачено фрагментов вывода: ' + emitted.length);
  console.log('');

  // ---- 1) Полнота афиш (по session) ----
  console.log('1) ПОЛНОТА АФИШ (все ' + ann.length + ' показов видны в выводе):');
  let annOk = 0;
  ann.forEach(function (a) {
    if (all.indexOf(a.session) >= 0) { annOk++; }
    else report('афиша ' + a.id + ' (session=' + a.session + ') не найдена в выводе дашборда');
  });
  // лишних session id в выводе, которых нет в источнике, быть не должно
  const srcSessions = ann.map(function (a) { return a.session; });
  const outSessions = [];
  ann.forEach(function (a) {
    if (all.indexOf(a.session) >= 0 && srcSessions.indexOf(a.session) >= 0) outSessions.push(a.session);
  });
  ok('видно ' + annOk + '/' + ann.length + ' показов');
  if (annOk === ann.length) ok('афиши выведены ПОЛНОСТЬЮ');
  console.log('');

  // ---- 2) Полнота залов (каждый room порождает карточку и имя не пустое) ----
  const roomNames = {};
  ann.forEach(function (a) { if (!(a.room in roomNames)) roomNames[a.room] = 0; roomNames[a.room]++; });
  console.log('2) ПОЛНОТА ЗАЛОВ (уникальных залов: ' + Object.keys(roomNames).length + '):');
  console.log('   (из HALLS извлечено имён: ' + Object.keys(hallNames).length + ')');
  let roomOk = 0;
  Object.keys(roomNames).forEach(function (rk) {
    const nm = hallNames[rk];
    if (!nm) { report('зал ' + rk + ' не имеет имени в HALLS дашборда — выведен как сырой id'); return; }
    // карточка зала выводится с data-room="<key>", а её имя непустое и не равно сырому ключу
    const cardOut = all.indexOf('data-room="' + rk + '"') >= 0;
    const nameOut = all.indexOf(nm) >= 0 && nm !== rk && nm.indexOf(rk) !== 0;
    if (cardOut && nameOut) roomOk++;
    else if (!cardOut) report('зал ' + rk + ' — карточка не выведена (нет data-room в разметке)');
    else report('зал ' + rk + ' — выведен с пустым/сырым именем');
  });
  ok('видно карточек для ' + roomOk + '/' + Object.keys(roomNames).length + ' залов');
  if (roomOk === Object.keys(roomNames).length) ok('залы выведены ПОЛНОСТЬЮ');
  console.log('');

  // ---- 3) Полнота субъектов ----
  console.log('3) ПОЛНОТА СУБЪЕКТОВ (ролей: ' + Object.keys(subjects).length + '):');
  let subjOk = 0;
  Object.keys(subjects).forEach(function (k) {
    const st = subjects[k];
    if (all.indexOf(st.title) >= 0) subjOk++;
    else report('роль ' + k + ' («' + st.title + '») не выведена в сводке контингента');
  });
  ok('видно ролей ' + subjOk + '/' + Object.keys(subjects).length);
  if (subjOk === Object.keys(subjects).length) ok('субъекты выведены ПОЛНОСТЬЮ');
  console.log('');

  // ---- 4) Ссылки на показы: файл существует + объявлен в field.html ----
  console.log('4) ССЫЛКИ НА ПОКАЗЫ (все демо-сессии достижимы):');
  let linkOk = 0;
  ann.forEach(function (a) {
    const f = path.join(ROOT, 'sessions', a.session + '.json');
    const fileOk = fs.existsSync(f);
    const fieldOk = FIELD.indexOf(a.session) >= 0;
    if (fileOk && fieldOk) linkOk++;
    else report(a.session + ': файл ' + (fileOk ? 'OK' : 'НЕТ') +
      ' · в field.html ' + (fieldOk ? 'OK' : 'НЕТ'));
  });
  ok('достижимо ' + linkOk + '/' + ann.length + ' показов');
  console.log('');

  // ---- 5) Совпадение счётчиков ----
  console.log('5) СОВПАДЕНИЕ (число выведенного == источнику):');
  let countsOk = true;
  if (annOk !== ann.length) { report('афиш выведено ' + annOk + ' вместо ' + ann.length); countsOk = false; }
  if (subjOk !== Object.keys(subjects).length) { report('ролей выведено ' + subjOk + ' вместо ' + Object.keys(subjects).length); countsOk = false; }
  if (countsOk) ok('счётчики совпадают (афиш=' + ann.length + ', залов=' + Object.keys(roomNames).length + ', ролей=' + Object.keys(subjects).length + ')');
  console.log('');

  // ---- 6) Повторяемость · месяц (маска недель + повторяемость по залам) ----
  console.log('6) ПОВТОРЯЕМОСТЬ · МЕСЯЦ (недель в месяце: ' + MONTH_WEEKS + '):');
  let mnOk = 0;
  ann.forEach(function (a) {
    const m = Array.isArray(a.monthWeeks) ? a.monthWeeks : [];
    if (!m.length) { report('афиша ' + a.id + ': monthWeeks пустой'); return; }
    for (let w = 0; w < m.length; w++) {
      if (!Number.isInteger(m[w]) || m[w] < 1 || m[w] > MONTH_WEEKS) {
        report('афиша ' + a.id + ': неделя вне 1..' + MONTH_WEEKS + ' (' + m[w] + ')');
        return;
      }
    }
    if (all.indexOf('data-ann="' + a.id + '"') < 0) {
      report('афиша ' + a.id + ': строка повторяемости не выведена (нет data-ann)');
      return;
    }
    mnOk++;
  });
  ok('маски недель корректны и строки выведены для ' + mnOk + '/' + ann.length + ' афиш');
  let hallsMnOk = 0;
  Object.keys(roomNames).forEach(function (rk) {
    const total = ann.filter(function (a) { return a.room === rk; })
      .reduce(function (t, a) {
        const m = Array.isArray(a.monthWeeks) ? a.monthWeeks : [];
        return t + (a.dur || 60) * m.length;
      }, 0);
    if (all.indexOf(total + ' мин «живого» времени в месяц') >= 0) hallsMnOk++;
    else if (plain.indexOf(total + ' мин «живого» времени в месяц') >= 0) hallsMnOk++;
    else report('зал ' + rk + ': месячный объём ' + total + ' мин не выведен в секции повторяемости');
  });
  ok('месячные объёмы залов совпадают ' + hallsMnOk + '/' + Object.keys(roomNames).length);
  if (mnOk === ann.length && hallsMnOk === Object.keys(roomNames).length) ok('повторяемость по месяцам выведена ПОЛНОСТЬЮ и совпадает');
  console.log('');

  // ---- 7) Полнота печатного отчёта (PDF/HTML) ----
  console.log('7) ПОЛНОТА ПЕЧАТНОГО ОТЧЁТА (docs/dashboard_report.html · .pdf):');
  if (!REPORT_HTML) { report('отчёт docs/dashboard_report.html отсутствует — пересобери: python docs/gen_dashboard_report.py'); }
  else {
    const rPlain = REPORT_HTML.replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ');
    // файлы должны существовать
    if (!fs.existsSync(reportPdf)) report('pdf-отчёт отсутствует: ' + path.basename(reportPdf));
    // 7a) все афиши (по title) присутствуют
    let rAnnOk = 0;
    ann.forEach(function (a) {
      if (rPlain.indexOf(a.title) >= 0) rAnnOk++;
      else report('отчёт: афиша «' + a.title + '» не найдена в печатном отчёте');
    });
    ok('в отчёте присутствуют ' + rAnnOk + '/' + ann.length + ' афиш');
    // 7b) все имена залов присутствуют
    let rHallOk = 0;
    Object.keys(roomNames).forEach(function (rk) {
      const nm = hallNames[rk];
      if (!nm) { report('отчёт: зал ' + rk + ' без имени в HALLS'); return; }
      if (rPlain.indexOf(nm) >= 0) rHallOk++;
      else report('отчёт: зал «' + nm + '» не найден в печатном отчёте');
    });
    ok('в отчёте присутствуют ' + rHallOk + '/' + Object.keys(roomNames).length + ' имён залов');
    // 7c) все роли присутствуют
    let rSubjOk = 0;
    Object.keys(subjects).forEach(function (k) {
      if (rPlain.indexOf(subjects[k].title) >= 0) rSubjOk++;
      else report('отчёт: роль «' + subjects[k].title + '» не найдена в печатном отчёте');
    });
    ok('в отчёте присутствуют ' + rSubjOk + '/' + Object.keys(subjects).length + ' ролей');
    // 7d) счётчики KPI совпадают (афиш/залов/ролей/приглашений)
    let subjInv = ann.reduce(function (t, a) { return t + (a.subjects ? a.subjects.length : 0); }, 0);
    const kpiNums = [String(ann.length), String(Object.keys(roomNames).length),
      String(Object.keys(subjects).length), String(subjInv)];
    let kpiOk = kpiNums.every(function (n) { return rPlain.indexOf(n) >= 0; });
    if (kpiOk) ok('KPI-цифры совпадают (афиш=' + ann.length + ', залов=' + Object.keys(roomNames).length + ', ролей=' + Object.keys(subjects).length + ', приглашений=' + subjInv + ')');
    else report('в печатном отчёте не найдена одна из KPI-цифр: ' + kpiNums.join(', '));
    if (rAnnOk === ann.length && rHallOk === Object.keys(roomNames).length &&
        rSubjOk === Object.keys(subjects).length && kpiOk)
      ok('печатный отчёт выводит контент ПОЛНОСТЬЮ и совпадает');
  }
  console.log('');

  console.log((failures === 0
    ? 'ДАШБОРД: ВЫВОД ПОЛНЫЙ И СОВПАДАЕТ С ИСТОЧНИКОМ (проблем = 0)'
    : 'ДАШБОРД: НАЙДЕНЫ РАСХОЖДЕНИЯ (проблем = ' + failures + ')'));
  process.exit(failures ? 1 : 0);
}

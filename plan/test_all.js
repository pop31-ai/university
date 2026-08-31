/*=============================================================
 * test_all.js — ЕДИНЫЙ ПРОГОН ТЕСТОВ КАМПУСА (общий ворот).
 *
 * Последовательно запускает все валидаторы и тесты репозитория:
 *   1) синтаксис (node --check) движка и JS-реестров;
 *   2) plan/qc_check.js    — контроль качества охвата (проблем = 0);
 *   3) plan/check_sync.js  — согласованность реестра и расписания;
 *   4) plan/dash_audit.js  — полнота и совпадение вывода дашборда.
 *
 * Каждый шаг выполняется как изолированный процесс (spawnSync) — это
 * надёжно, в т.ч. для асинхронного dash_audit. Вывод шага транслируется
 * в консоль; в конце выводится сводка. Exit 0 — все шаги зелёные, 1 — иначе.
 *
 * Запуск: node plan/test_all.js
 * ============================================================*/

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const node = process.execPath;

const SYNTAX_FILES = [
  'engine/auditorium.js',
  'plan/videos.js',
  'plan/qc_check.js',
  'plan/check_sync.js',
  'plan/dash_audit.js',
  'plan/search_index.js'
];

const steps = [];
const results = [];

function addStep(name, cmd, args) {
  steps.push({ name, cmd, args });
}

// 1) Синтаксис — по файлу = отдельная «проверка» (для точной локализации сбоя)
SYNTAX_FILES.forEach(function (f) {
  addStep('синтаксис · ' + f, node, ['--check', path.join(ROOT, f)]);
});

// 2) QC охвата
addStep('QC охвата · plan/qc_check.js', node, ['plan/qc_check.js']);

// 3) Согласованность реестра/расписания
addStep('Синхронизация · plan/check_sync.js', node, ['plan/check_sync.js']);

// 4) Полнота вывода дашборда
addStep('Аудит дашборда · plan/dash_audit.js', node, ['plan/dash_audit.js']);

// ----------------------------------------------------------------
// Прогон
// ----------------------------------------------------------------
function line() {
  const w = 72;
  console.log('\n' + '-'.repeat(w));
}
function banner(t) { console.log('\n==> ' + t); }

banner('ЕДИНЫЙ ПРОГОН ТЕСТОВ КАМПУСА  (' + steps.length + ' шагов)');

steps.forEach(function (s, i) {
  banner('[' + (i + 1) + '/' + steps.length + '] ' + s.name);
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, { cwd: ROOT, encoding: 'utf8' });
  const dt = ((Date.now() - t0) / 1000).toFixed(1) + 's';
  const ok = (r.status === 0);
  // промежуточные сигналы запуска инструментов даёт сам процесс (stdio inherit не включён,
  // поэтому выводим его stdout/stderr здесь)
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) console.log('   (ошибка запуска: ' + r.error.message + ')');
  results.push({ name: s.name, ok, dt, status: r.status });
  console.log('   -> [' + (ok ? 'OK' : 'СБОЙ') + '] за ' + dt +
    (ok ? '' : '  (exit=' + r.status + ')'));
});

// ----------------------------------------------------------------
// Сводка
// ----------------------------------------------------------------
line();
banner('СВОДКА');
let failed = 0;
results.forEach(function (r) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  if (!r.ok) failed++;
  console.log('  ' + mark.padEnd(4) + '  ' + r.name.padEnd(46) + ' ' + r.dt);
});

const allOk = failed === 0;
line();
console.log(allOk
  ? 'ВСЕ ТЕСТЫ КАМПУСА ПРОЙДЕНЫ (' + results.length + '/' + results.length + ')'
  : 'ЕСТЬ СБОИ: ' + failed + '/' + results.length + ' шагов не прошли');
process.exit(allOk ? 0 : 1);

/*=============================================================
 * check_sync.js — СЕРЬЁЗНАЯ ПРОВЕРКА СИНХРОНИЗАЦИИ РОЛИКОВ
 * polimuli-chalkboard · как раньше: ролик сверяется по часам,
 * минутам и секундам с графикой.
 *
 * Что проверяет (для КАЖДОЙ сессии в plan/semester.json и
 * для КАЖДОЙ карты ролика в plan/videos/):
 *   1) длительность сессии > 0 и конечна;
 *   2) каждый мазок: t >= 0, t <= duration, t+dur <= duration(+2с);
 *   3) последний мазок не обрывается раньше достижимого финала
 *      (кроме разрешённых «продолжение следует»);
 *   4) разделы sectioner.blocks: t в пределах [0, duration],
 *      монотонно не убывают;
 *   5) карта ролика: video.length == session.duration сессии;
 *   6) сцены ролика: at в пределах [0, length], по возрастанию;
 *   7) сводная «len: все мазки/разделы укладываются» — печать в
 *      ЧЧ:ММ:СС для наглядности.
 *
 * Запуск: node plan/check_sync.js
 * ============================================================*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEMESTER = path.join(__dirname, 'semester.json');
const VIDEOS = path.join(__dirname, 'videos');

const EPS = 2; // секунд допуска на «дорисовку» хвоста мазка у финала
const TAIL_OK = 12; // осознанный хвост-титр/пауза; больше — «пустой ролик»

function fmt(t) {
  const s = Math.max(0, Math.round(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h > 0 ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
}

let problems = 0;
let warns = 0;
let okCount = 0;

// kindSoft — предупреждение (не ломающее ролик), иначе серьёзное расхождение
function report(id, kind, msg, kindSoft) {
  if (kindSoft) { warns++; console.log('  [· ' + kind + '] ' + id + ': ' + msg); }
  else { problems++; console.log('  [' + kind + '] ' + id + ': ' + msg); }
}

function checkSession(id, file, dur, showroom) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); }
  catch (e) { report(id, 'файл', 'не читается: ' + e.message); return null; }

  const sess = j.session || {};
  const D = (typeof sess.duration === 'number') ? sess.duration : dur;
  if (!(D > 0)) { report(id, 'длительность', 'не положительна: ' + D); return null; }

  const strokes = j.strokes || [];
  const blocks = (j.sectioner && j.sectioner.blocks) || [];
  let lastEnd = 0;
  let prev = -1e9;

  strokes.forEach((s, i) => {
    const t = +s.t || 0;
    const d = +s.dur || 0;
    if (t < 0) report(id, 'мазок#' + i, 't<0: ' + t);
    if (t > D) report(id, 'мазок#' + i, 't>' + 'длит(' + D + ') => t=' + fmt(t) + ' / ' + fmt(D));
    if (d > 0 && t + d > D + EPS) {
      report(id, 'мазок#' + i, 'конец за пределами ролика: t=' + fmt(t) + ' dur=' + fmt(d) + ' → ' + fmt(t + d) + ' > ' + fmt(D));
    }
    lastEnd = Math.max(lastEnd, t + d);
  });
  // последний мазок должен хотя бы дожить до финала (кроме 2с допуска) — мягкое
  if (strokes.length && lastEnd < D - EPS && !/продолжение/.test(JSON.stringify(strokes[strokes.length - 1]))) {
    report(id, 'финал', 'последний мазок ' + fmt(lastEnd) + ' раньше duration ' + fmt(D) + ' (титр/пауза)', true);
  }

  // «пустой хвост»: после последнего мазка больше TAIL_OK с пустого экрана — мягкое
  if (strokes.length && lastEnd < D - TAIL_OK) {
    report(id, 'пустой хвост', fmt(D - lastEnd) + ' c пустоты в конце (мазок ' + fmt(lastEnd) + ' из ' + fmt(D) + ')' +
      (showroom ? ' · витрина, вне расписания семестра' : ''), true);
  }

  blocks.forEach((b, i) => {
    const bt = +b.t || 0;
    if (bt < 0 || bt > D + 0.01) report(id, 'раздел#' + i, 't вне ролика: ' + fmt(bt) + ' / ' + fmt(D));
    if (bt < prev) report(id, 'раздел#' + i, 'не монотонны: ' + fmt(prev) + ' → ' + fmt(bt));
    prev = Math.max(prev, bt);
  });

  return { D, strokes: strokes.length, blocks: blocks.length, lastEnd };
}

function checkVideo(id, sessDur, sessFile) {
  const file = path.join(VIDEOS, id + '.json');
  if (!fs.existsSync(file)) { report(id, 'карта', 'ОТСУТСТВУЕТ — нужен node plan/videos.js'); return; }
  let v;
  try { v = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { report(id, 'карта', 'не читается: ' + e.message); return; }

  const len = v.video && v.video.length;
  if (typeof len !== 'number' || !(len > 0)) report(id, 'карта', 'нет длины ролика');
  else if (sessDur && Math.abs(len - sessDur) > 0.01) {
    report(id, 'карта', 'длина ролика ' + fmt(len) + ' ≠ длительности сессии ' + fmt(sessDur));
  }

  // карта должна ссылаться ровно на тот же файл сессии
  if (v.video && v.video.file !== sessFile) {
    report(id, 'карта', 'ссылается на ' + v.video.file + ', а не на ' + sessFile);
  }

  let prev = -1e9;
  (v.scenes || []).forEach((sc, i) => {
    const at = +sc.at || 0;
    if (at < 0 || at > (len || 1e9)) report(id, 'сцена#' + i, 'at вне ролика: ' + fmt(at) + (len ? ' / ' + fmt(len) : ''));
    if (at < prev) report(id, 'сцена#' + i, 'не монотонны: ' + fmt(prev) + ' → ' + fmt(at));
    prev = Math.max(prev, at);
  });
}

// ---- основной проход ----
const P = JSON.parse(fs.readFileSync(SEMESTER, 'utf8'));
// сессии, реально идущие в расписании недель (плейлист семестра)
const inSchedule = new Set((P.weeks || []).flatMap(w => (w.pairs || []).map(p => p.session)));
console.log('— Сверка сессий (' + P.sessions.length + ' шт. · в расписании ' + inSchedule.size + ') —');
P.sessions.forEach(s => {
  const r = checkSession(s.id, s.file, s.duration, !inSchedule.has(s.id));
  if (r) {
    okCount++;
    console.log('  ' + s.id.padEnd(6) + (inSchedule.has(s.id) ? ' ✓' : ' ◇') + ' ' + fmt(r.D).padStart(8) +
      '  мазков:' + String(r.strokes).padStart(3) + ' разделов:' + String(r.blocks).padStart(2) +
      '  финал:' + fmt(r.lastEnd));
  }
  checkVideo(s.id, r && r.D, s.file);
});

// отдельные файлы не из реестра (проверим на всякий случай)
const known = {};
P.sessions.forEach(s => { known[s.file] = 1; });
const extra = fs.readdirSync(path.join(ROOT, 'sessions')).filter(f => f.endsWith('.json') && !known['sessions/' + f]);
if (extra.length) {
  console.log('\n— Дополнительные файлы в sessions/ (не в реестре) —');
  extra.forEach(f => {
    const r = checkSession('(лишний)', 'sessions/' + f, 0, false);
    if (r) { okCount++; console.log('  ' + f + ' ✓ ' + fmt(r.D) + ' мазков:' + r.strokes); }
  });
}

console.log('\nСессий в реестре: ' + P.sessions.length +
  ' · в расписании недель: ' + inSchedule.size +
  ' · серьёзных расхождений: ' + problems +
  ' · мягких предупреждений: ' + warns);
process.exit(problems ? 1 : 0);
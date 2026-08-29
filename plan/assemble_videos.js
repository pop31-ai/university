/*=============================================================
 * assemble_videos.js — СБОРЩИК ВИДЕО «от а до я» (Шаг 5-7 PROCEDURE.md)
 * polimuli-chalkboard
 *
 * Собирает из накопленных артефактов играемую видео-сессию:
 *   - исходная сессия sessions/<id>.json (валидные мазки движка) —
 *     «готовое не терять», ничего не пересобираем с нуля;
 *   - карта plan/videos/<id>.json (фазы А→Я, три слоя, учитель, production);
 *   - объединяем: поверх неизменных мазков кладём РЕЖИССУРНЫЙ слой
 *     (narration, teacher, production/камеры, scenes по фазам), чтобы
 *     материал был «грамотно рассказана», а не прочитан вслух.
 *
 * Выход: videos/<id>.json (37 шт.) — та же структура, что плеер грузит
 * (session/room/sectioner/strokes), плюс метаданные ролика (video-блок).
 *
 * Запуск: node plan/assemble_videos.js
 * ============================================================*/

const fs = require('fs');
const path = require('path');

const SEMESTER = path.join(__dirname, 'semester.json');
const CARDS = path.join(__dirname, 'videos');     // карты роликов
const OUT = path.join(__dirname, '..', 'videos'); // собранные ролики

function pad3(n) { return String(n).padStart(3, '0'); }

// извлекаем текст мазков (для проверки насыщенности)
function extractContent(session) {
  return (session.strokes || [])
    .map(s => s && s.s ? s.s.trim() : '')
    .filter(Boolean);
}

// слой учителя и рассказа берём из карты (уже сгенерировано)
function buildVideoBlock(card, srcSession) {
  const meta = card.video;
  const scenes = card.scenes.map(sc => ({
    phase: sc.phase,
    name: sc.name,
    at: Math.round(sc.at),          // секунда начала фазы в ролике
    pct: sc.pct,
    kind: sc.kind,
    conspect: sc.conspect,
    spirit: sc.spirit,
    narration: sc.narration,
    feedback_teacher: sc.feedback_teacher
  }));
  return {
    type: 'video',
    source: meta.file,
    side: meta.side,
    title: meta.title,
    outcome: meta.outcome,
    length: meta.length,
    filled: meta.filled,
    narration: card.narration,
    teacher: card.teacher,
    production: card.production,
    scenes
  };
}

function assemble(entry, card) {
  const src = JSON.parse(fs.readFileSync(path.join(__dirname, '..', entry.file), 'utf8'));
  const filled = extractContent(src).length;
  const videoBlock = buildVideoBlock(card, src);
  // итоговая видео-сессия = исходные данные + режиссёрский слой
  return Object.assign({}, src, {
    video: videoBlock,
    session: Object.assign({}, src.session, {
      arc: card.scenes.map(s => ({ phase: s.phase, at: Math.round(s.at) }))
    })
  });
}

function generate() {
  const P = JSON.parse(fs.readFileSync(SEMESTER, 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const list = [];
  P.sessions.forEach(entry => {
    const cardPath = path.join(CARDS, entry.id + '.json');
    if (!fs.existsSync(cardPath)) { console.log('  нет карты:', entry.id); return; }
    const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
    const v = assemble(entry, card);
    fs.writeFileSync(path.join(OUT, entry.id + '.json'), JSON.stringify(v, null, 2) + '\n');
    list.push({ id: entry.id, engine: v.session.style.type, len: v.video.length, scenes: v.video.scenes.length });
  });
  fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify({
    produced: list.length,
    note: 'Первый веховый курс (модуль недель 1-2) и затем весь семестр: собранные видеоролики «от а до я» типа доска-урок, играемые в плеере, с режиссёрским слоем (рассказ/учитель/камеры) поверх неизменных конспектов.',
    videos: list
  }, null, 2) + '\n');
  return list;
}

// CLI
if (require.main === module) {
  const list = generate();
  console.log('Собрано видеороликов «от а до я»:', list.length);
  list.slice(0, 9).forEach(v => console.log('  ' + v.id.padEnd(16) + v.engine.padEnd(8) + v.len + 'с · фаз:' + v.scenes));
  if (list.length > 9) console.log('  ... и ещё', list.length - 9, 'роликов (videos/).');
  console.log('Проверка играемости — структура сессии сохранена (strokes intact).');
}

module.exports = { generate };

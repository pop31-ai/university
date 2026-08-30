// Перенос неканонических (старых смещённых) файлов решётки в архив вне git.
// Канонические имена — из текущей решётки (500_universe.js); остальные файлы
// в articles/500 переносятся в articles/_old/<блок>/<имя>, чтобы git-дерево
// articles/500 не превышало лимит GitHub. Запуск: node articles/gen/gen_archive.js
const fs = require("fs");
const path = require("path");
const U = require("./500_universe.js");

function slug(s) {
  return s.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const outDir = path.join(__dirname, "..", "500");
const oldDir = path.join(__dirname, "..", "_old");

const canonical = new Set();
const all = U.buildArticles();
all.forEach((art, i) => {
  const num = String(i + 1).padStart(3, "0");
  canonical.add(`${num}_${slug(art.area)}_${slug(art.role)}_${slug(art.topic)}.txt`);
});

let files = fs.readdirSync(outDir).filter((f) => f.endsWith(".txt"));
let kept = 0;
let moved = 0;
for (const f of files) {
  if (canonical.has(f)) {
    kept++;
    continue;
  }
  const m = /^(\d+)_.*\.txt$/.exec(f);
  const dest = oldDir;
  fs.mkdirSync(dest, { recursive: true });
  const target = path.join(dest, f);
  if (!fs.existsSync(target)) {
    fs.renameSync(path.join(outDir, f), target);
  } else {
    fs.rmSync(path.join(outDir, f), { force: true });
  }
  moved++;
}
console.log(`архив: канон ${kept}, старых перенесено ${moved}, решётка ${all.length}`);
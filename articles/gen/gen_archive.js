// Перенос неканонических (старых смещённых) файлов решётки в архив вне git.
// Канонические имена — из текущей решётки пакетов (500_universe.js buildPkgFiles);
// остальные файлы в articles/500 переносятся в articles/_old/<имя>, чтобы
// git-дерево articles/500 не росло сверх меры. Запуск: node articles/gen/gen_archive.js
const fs = require("fs");
const path = require("path");
const U = require("./500_universe.js");

const outDir = path.join(__dirname, "..", "500");
const oldDir = path.join(__dirname, "..", "_old");

const canonical = new Set(U.buildPkgFiles().map((pkg) => pkg.filename));

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
console.log(`архив: канон ${kept}, старых перенесено ${moved}, решётка ${U.buildPkgFiles().length} файлов`);
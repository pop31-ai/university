// Каталог библиотеки: область -> тема -> пакет (10 ролей) -> файл.
// Библиотекарь: сохранить и каталогизировать, чтобы удержанное возвращалось.
// Запуск: node articles/gen/gen_catalog.js
// Пишет articles/catalog.json (полный индекс) и articles/CATALOG.md (читаемая опись).

const fs = require("fs");
const path = require("path");
const U = require("./500_universe.js");

const outDir = path.join(__dirname, "..", "500");
const catalogDir = path.join(__dirname, "..");

// Пакет = 10 статей одной темы (роли подряд), файл — единица каталога.
const records = U.buildPkgFiles().map((pkg, i) => {
  const n = String(i + 1).padStart(3, "0");
  const file = `${n}_${pkg.filename}`;
  return {
    num: i + 1,
    file: pkg.filename,
    area: pkg.area,
    topic: pkg.topic,
    roles: pkg.roles,
    exists: fs.existsSync(path.join(outDir, pkg.filename)),
  };
});

const total = records.length;
const missing = records.filter((r) => !r.exists);
const byArea = {};
for (const r of records) {
  (byArea[r.area] = byArea[r.area] || []).push(r);
}

// JSON-каталог: полный индекс пакетов для возврата по номеру.
const json = {
  library: "Библиотека университета · пакеты по решётке область × тема × 10 ролей",
  grid: `11 областей × 65 тем × ${U.ROLES.length} ролей = ${U.totalArticles()} статей в ${total} пакетах`,
  total,
  missing: missing.length,
  areas: Object.keys(byArea).map((a) => ({
    area: a,
    topics: U.UNIVERSE[a].length,
    count: byArea[a].length,
  })),
  records,
};
fs.writeFileSync(
  path.join(catalogDir, "catalog.json"),
  JSON.stringify(json, null, 1),
  "utf8"
);

// CATALOG.md — читаемая опись: по областям, темам и пакетам в порядке номеров.
const lines = [];
lines.push("# Каталог библиотеки университета");
lines.push("");
lines.push("Каталогизирует Библиотекарь: удержанное сохраняется, возвращается и служит дальше.");
lines.push("");
lines.push(`- Пакетов: **11 областей × 65 тем × (${U.ROLES.length} ролей / 10) = ${total} файлов**, статей в них: ${U.totalArticles()}.`);
lines.push(`- Формат файла: ` + "``Область_Тема_роли_001_010.txt``" + ` — 10 статей одной темы подряд (роли по порядку).`);
lines.push(`- Решётка: ` + "``articles/gen/500_universe.js``" + ` · генератор: ` + "``articles/gen/gen500.js``" + `.`);
lines.push(`- Полный индекс для возврата: ` + "``articles/catalog.json``" + `.`);
lines.push(missing.length ? `- Не найдено файлов: ${missing.length}` : "");
lines.push("");
lines.push(`## Роли (${U.ROLES.length})`);
lines.push(U.ROLES.join(" · "));
lines.push("");

for (const area of Object.keys(byArea)) {
  lines.push(`## ${area}`);
  lines.push("");
  const topics = {};
  for (const r of byArea[area]) {
    (topics[r.topic] = topics[r.topic] || []).push(r);
  }
  for (const topic of Object.keys(topics)) {
    const rr = topics[topic];
    const first = rr[0].num;
    const last = rr[rr.length - 1].num;
    lines.push(`### ${topic}`);
    lines.push(
      `Пакеты ${first}–${last} (${U.ROLES.length} ролей, по 10 в файле).`
    );
    for (const rec of rr) {
      lines.push(`- ${rec.num} · ${rec.roles.join(" · ")}`);
    }
    lines.push("");
  }
}

fs.writeFileSync(
  path.join(catalogDir, "CATALOG.md"),
  lines.join("\n"),
  "utf8"
);

console.log(
  `каталог: ${total} статей по ${Object.keys(byArea).length} областям, пропущено файлов: ${missing.length}`
);
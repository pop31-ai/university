// Каталог библиотеки: область -> тема -> роль -> номер/файл.
// Библиотекарь: сохранить и каталогизировать, чтобы удержанное возвращалось.
// Запуск: node articles/gen/gen_catalog.js
// Пишет articles/catalog.json (полный индекс) и articles/CATALOG.md (читаемая опись).

const fs = require("fs");
const path = require("path");
const U = require("./500_universe.js");

function slug(s) {
  return s.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const outDir = path.join(__dirname, "..", "500");
const catalogDir = path.join(__dirname, "..");

const records = U.buildArticles().map((art, i) => {
  const num = i + 1;
  const n = String(num).padStart(3, "0");
  const file = `${n}_${slug(art.area)}_${slug(art.role)}_${slug(art.topic)}.txt`;
  return {
    num,
    file,
    area: art.area,
    topic: art.topic,
    role: art.role,
    exists: fs.existsSync(path.join(outDir, file)),
  };
});

const total = records.length;
const missing = records.filter((r) => !r.exists);
const byArea = {};
for (const r of records) {
  (byArea[r.area] = byArea[r.area] || []).push(r);
}

// JSON-каталог: полный индекс для возврата по номеру.
const json = {
  library: "Библиотека университета · статьи по решётке область × тема × роль",
  grid: `11 областей × 65 тем × 24 роли`,
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

// CATALOG.md — читаемая опись: по областям, темам и ролям в порядке номеров.
const lines = [];
lines.push("# Каталог библиотеки университета");
lines.push("");
lines.push("Каталогизирует Библиотекарь: удержанное сохраняется, возвращается и служит дальше.");
lines.push("");
lines.push(`- Полей: **11 областей × 65 тем × 24 роли = ${total} статей**.`);
lines.push(`- Формат файла: ` + "``NNN_Область_Роль_Тема.txt``" + `, номер — сквозной с 1.`);
lines.push(`- Решётка: ` + "``articles/gen/500_universe.js``" + ` · генератор: ` + "``articles/gen/gen500.js``" + `.`);
lines.push(`- Полный индекс для возврата: ` + "``articles/catalog.json``" + `.`);
lines.push(missing.length ? `- Не найдено файлов: ${missing.length}` : "");
lines.push("");
lines.push("## Роли (24)");
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
      `Номера ${first}–${last} (${rr.length} ролей).`
    );
    for (const rec of rr) {
      lines.push(`- ${rec.num} · ${rec.role} · ${rec.file}`);
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
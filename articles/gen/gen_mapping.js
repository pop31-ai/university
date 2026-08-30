// Файл соответствий: каждый файл на диске articles/500 -> запись решётки
// (номер, область, роль, тема, каноническое имя). Старые/дубли помечаются
// как "вне решётки" либо как смещённое старое соответствие.
// Запуск: node articles/gen/gen_mapping.js

const fs = require("fs");
const path = require("path");
const U = require("./500_universe.js");

function slug(s) {
  return s.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const outDir = path.join(__dirname, "..", "500");
const catalogDir = path.join(__dirname, "..");

// Каноническая решётка: тело имени (без номера) -> запись.
const byBody = new Map();
const byFile = new Map();
{
  let num = 0;
  for (const area of Object.keys(U.UNIVERSE)) {
    for (const topic of U.UNIVERSE[area]) {
      for (const role of U.ROLES) {
        num += 1;
        const n = String(num).padStart(3, "0");
        const file = `${n}_${slug(area)}_${slug(role)}_${slug(topic)}.txt`;
        const rec = { num, file, area, role, topic };
        byBody.set(`${slug(area)}_${slug(role)}_${slug(topic)}`, rec);
        byFile.set(file, rec);
      }
    }
  }
}

// Перебор всех файлов на диске.
const diskFiles = fs.readdirSync(outDir).filter((f) => f.endsWith(".txt"));

const records = diskFiles.map((f) => {
  const m = /^(\d+)_(.*)\.txt$/.exec(f);
  const body = m ? m[2] : f.replace(/\.txt$/, "");
  const num = m ? parseInt(m[1], 10) : null;
  const canon = byFile.get(f) || (body ? byBody.get(body) : null);
  return {
    file: f,
    diskNum: num,
    canonical: canon ? canon.file : null,
    canonicalNum: canon ? canon.num : null,
    area: canon ? canon.area : null,
    role: canon ? canon.role : null,
    topic: canon ? canon.topic : null,
    ours: canon ? (canon.file === f) : false,
  };
});

const inGrid = records.filter((r) => r.canonical && r.ours);
const oldNum = records.filter((r) => r.canonical && !r.ours);
const outside = records.filter((r) => !r.canonical);

// Разбиение на две части (каждая часть < лимита GitHub в 100 МБ).
function chunk(list) {
  const mid = Math.ceil(list.length / 2);
  return [list.slice(0, mid), list.slice(mid)];
}

const [j1, j2] = chunk(records);

const mkJson = (part, list) => ({
  library: "Библиотека университета · соответствие файлов на диске записям решётки",
  grid: `${U.ROLES.length} ролей · ${byBody.size} статей`,
  part,
  totalDisk: records.length,
  exactInGrid: inGrid.length,
  oldNumberingMatch: oldNum.length,
  outsideGrid: outside.length,
  records: list,
});
fs.writeFileSync(
  path.join(catalogDir, "correspondence-01.json"),
  JSON.stringify(mkJson(1, j1), null, 1),
  "utf8"
);
fs.writeFileSync(
  path.join(catalogDir, "correspondence-02.json"),
  JSON.stringify(mkJson(2, j2), null, 1),
  "utf8"
);

function buildMd(part, list, title) {
  const lines = [];
  lines.push(`# Соответствие файлов библиотеки · часть ${part}`);
  lines.push("");
  if (title) lines.push(title);
  lines.push("");
  lines.push(`- Решётка: **${U.ROLES.length} ролей × 65 тем × 11 областей = ${byBody.size} статей**.`);
  lines.push(`- Файлов на диске: **${records.length}** (часть ${part}: ${list.length}).`);
  for (const r of list) {
    const tag = r.ours
      ? "решётка"
      : r.canonical
      ? `старое -> №${r.canonicalNum}`
      : "вне решётки";
    lines.push(`- \`${r.file}\` · ${tag}`);
  }
  return lines.join("\n");
}

const title =
  `Каждый файл на диске соотнесён с записью решётки (номер, область, роль, тема).\n\n` +
  `- Точно в решётке: **${inGrid.length}**. Старое смещённое соответствие: **${oldNum.length}**. ` +
  `Вне решётки (старые дубли): **${outside.length}**.`;

fs.writeFileSync(
  path.join(catalogDir, "CORRESPONDENCE-01.md"),
  buildMd(1, j1, title),
  "utf8"
);
fs.writeFileSync(
  path.join(catalogDir, "CORRESPONDENCE-02.md"),
  buildMd(2, j2),
  "utf8"
);

console.log(
  `соответствия: диске ${records.length}, в решётке ${inGrid.length}, старых смещённых ${oldNum.length}, вне решётки ${outside.length}`
);
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

// Адаптивное разбиение на части (каждая часть < лимита GitHub в 100 МБ).
// Число частей выбирается так, чтобы крупнейший файл уверенно помещался.
const SAFE_MB = 90;

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

function partsFor(totalBytes) {
  const n = Math.max(1, Math.ceil(totalBytes / (SAFE_MB * 1024 * 1024)));
  return n;
}

function chunk(list, n) {
  const size = Math.ceil(list.length / n);
  const out = [];
  for (let i = 0; i < n; i++) out.push(list.slice(i * size, (i + 1) * size));
  return out;
}

function probeJson(list) {
  return Buffer.byteLength(JSON.stringify(mkJson(0, list), null, 1), "utf8");
}
function probeMd(list) {
  return Buffer.byteLength(buildMd(0, list, ""), "utf8");
}

const jsonParts = chunk(records, partsFor(probeJson(records)));
const mdParts = chunk(records, partsFor(probeMd(records)));

// Стираем свои прежние части, чтобы не оставались устаревшие номера.
function clearOld(prefix) {
  for (const f of fs.readdirSync(catalogDir)) {
    if (f.startsWith(prefix) && (f.endsWith(".json") || f.endsWith(".md"))) {
      fs.rmSync(path.join(catalogDir, f), { force: true });
    }
  }
}
clearOld("correspondence-");
clearOld("CORRESPONDENCE-");

jsonParts.forEach((list, i) => {
  fs.writeFileSync(
    path.join(catalogDir, `correspondence-${String(i + 1).padStart(2, "0")}.json`),
    JSON.stringify(mkJson(i + 1, list), null, 1),
    "utf8"
  );
});

const title =
  `Каждый файл на диске соотнесён с записью решётки (номер, область, роль, тема).\n\n` +
  `- Точно в решётке: **${inGrid.length}**. Старое смещённое соответствие: **${oldNum.length}**. ` +
  `Вне решётки (старые дубли): **${outside.length}**.`;

mdParts.forEach((list, i) => {
  fs.writeFileSync(
    path.join(catalogDir, `CORRESPONDENCE-${String(i + 1).padStart(2, "0")}.md`),
    buildMd(i + 1, list, i === 0 ? title : ""),
    "utf8"
  );
});

console.log(
  `соответствия: диске ${records.length}, в решётке ${inGrid.length}, старых смещённых ${oldNum.length}, вне решётки ${outside.length}`
);
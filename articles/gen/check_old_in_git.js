// Проверка: каждый файл в articles/_old (база корпуса) представлен blob'ом в истории git.
// Канон-решётка живёт в articles/500 (в git), а _old — дубликаты смещённых слоёв.
// Если blob есть в истории — удаление _old безопасно (материалы восстанавливаются из git).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const oldDir = path.join("articles", "_old");

// 1) все объекты истории под articles/500
console.log("rev-list --objects --all -- articles/500 ...");
const raw = execFileSync("git", ["rev-list", "--objects", "--all", "--", "articles/500"], {
  encoding: "utf8", maxBuffer: 1024 * 1024 * 1024,
});
const hist = new Set();
for (const line of raw.split(/\r?\n/)) {
  const sp = line.indexOf(" ");
  if (sp === 40) hist.add(line.slice(0, 40));
}

console.log("исторических объектов (первые 40 hex):", hist.size);

// blob sha1 для файла: sha1("blob <size>\0" + content)
function gitBlobSha(file) {
  const buf = fs.readFileSync(file);
  const h = crypto.createHash("sha1");
  h.update("blob " + buf.length + "\0");
  h.update(buf);
  return h.digest("hex");
}

const files = fs.readdirSync(oldDir);
console.log("файлов в _old:", files.length);

let matched = 0;
const missing = [];
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const sha = gitBlobSha(path.join(oldDir, f));
  if (hist.has(sha)) matched++;
  else {
    missing.push(f);
    if (missing.length <= 10) console.log("НЕ в истории:", f, sha);
  }
  if ((i + 1) % 100000 === 0) console.log("проверено:", i + 1, "совпадений:", matched);
}

console.log("СОВПАДЕНИЙ:", matched, "из", files.length);
console.log("ОТСУТСТВУЕТ В ИСТОРИИ:", missing.length);

if (missing.length) {
  fs.writeFileSync(path.join(process.env.TEMP||"..", "missing_from_git.txt"), missing.join("\n"), "utf8");
  console.log("список отсутствующих записан в missing_from_git.txt");
}
// 개역한글(저작권 만료) 본문 -> bible/krv.json   { 책코드: [ [1절, 2절, ...], ...장 ] }
// 사용: node tools/build-bible.mjs <bible 폴더 (책코드/장.json, {verse, ko})>
import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
const out = {};
for (const code of fs.readdirSync(src).sort()) {
  const files = fs.readdirSync(path.join(src, code)).filter((f) => f.endsWith(".json"));
  const chapters = [];
  for (const f of files) {
    const n = parseInt(f, 10);
    const verses = [];
    for (const x of JSON.parse(fs.readFileSync(path.join(src, code, f), "utf8"))) {
      if (!x.verse || !x.ko) continue;
      verses[x.verse - 1] = x.ko.replace(/\s+/g, " ").trim();
    }
    chapters[n - 1] = Array.from(verses, (v) => v || "");
  }
  out[code] = Array.from(chapters, (c) => c || []);
}
fs.mkdirSync("bible", { recursive: true });
fs.writeFileSync("bible/krv.json", JSON.stringify(out));
const n = Object.values(out).reduce((a, b) => a + b.reduce((x, c) => x + c.filter(Boolean).length, 0), 0);
console.log(Object.keys(out).length, "권", n, "절", (fs.statSync("bible/krv.json").size / 1e6).toFixed(1), "MB");

// 기존 PPT(.pptx) 에서 찬양 가사 가져오기.
// PowerPoint 구역(섹션) 이름이 "곡 제목(v1)", "곡 제목(c)", "곡 제목(b)" 처럼 되어 있으면
// 곡별로 모으고 v/c/b/p 를 Verse/Chorus/Bridge/Pre-Chorus 로 바꾼다. 슬라이드 나눔도 그대로 유지.

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const squash = (s) => s.replace(/\s+/g, "");

function shapeTexts(xml) {
  const out = [];
  for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>|<p:sp [\s\S]*?<\/p:sp>/g) || []) {
    if (/<p:ph[^>]*type="(sldNum|dt)"/.test(sp)) continue;          // 쪽번호/날짜 (바닥글은 반복 여부로 판단)
    const lines = [];
    for (const p of sp.match(/<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g) || []) {
      const t = p.replace(/<a:br\s*\/>/g, "\n").replace(/<a:t>([\s\S]*?)<\/a:t>|<a:t [^>]*>([\s\S]*?)<\/a:t>|<[^>]+>/g, (m, a, b) => decode(a ?? b ?? ""));
      for (const ln of t.split("\n")) lines.push(ln.replace(/\s+/g, " ").trim());
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    while (lines.length && !lines[0]) lines.shift();
    if (lines.length) out.push(lines);
  }
  return out;
}

const PART = { v: "Verse", c: "Chorus", b: "Bridge", p: "Pre-Chorus", t: "Tag", i: "Intro", o: "Outro", e: "Ending" };
function partLabel(code, codesInSong) {
  const m = /^([a-z]+)\s*(\d*)$/i.exec(code.trim());
  if (!m) return code.trim();
  // (a)(b)(c)(d) 처럼 알파벳 순서로 붙인 이름이면 그대로 A/B/C/D
  const singles = codesInSong.filter((c) => /^[a-z]$/i.test(c.trim()));
  // "Part A" 로 저장해야 나중에 다시 읽어도 B=Bridge, C=Chorus 로 바뀌지 않는다
  if (singles.some((c) => !PART[c.toLowerCase()] || c.toLowerCase() === "a")) return `Part ${code.trim().toUpperCase()}`;
  const letter = m[1].toLowerCase();
  const name = PART[letter.length === 1 ? letter : ""] || (letter === "pc" ? "Pre-Chorus" : null);
  if (!name) return code.trim().toUpperCase();
  let num = m[2];
  // c1 / c2 처럼 번호가 붙은 같은 파트가 여러 개면 번호 유지, "v" 하나뿐이면 Verse 1
  const same = codesInSong.filter((c) => c.toLowerCase().replace(/\d+$/, "") === letter);
  if (!num && name === "Verse") num = "1";
  if (num && name !== "Verse" && same.length <= 1) num = "";
  return num ? `${name} ${num}` : name;
}

export async function songsFromPptx(data, JSZip = globalThis.JSZip) {
  const zip = await JSZip.loadAsync(data);
  const read = async (path) => { const f = zip.file(path); return f ? f.async("string") : ""; };
  const pres = await read("ppt/presentation.xml");
  const rels = await read("ppt/_rels/presentation.xml.rels");
  const relTarget = {};
  for (const m of rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relTarget[m[1]] = m[2];
  for (const m of rels.matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) relTarget[m[2]] = m[1];
  const slideOf = {};
  for (const m of pres.matchAll(/<p:sldId [^>]*id="(\d+)"[^>]*r:id="([^"]+)"/g)) slideOf[m[1]] = "ppt/" + relTarget[m[2]].replace(/^\//, "").replace(/^ppt\//, "");

  const sections = [];
  for (const m of pres.matchAll(/<p14:section [^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/p14:section>/g)) {
    sections.push({ name: decode(m[1]).trim(), ids: [...m[2].matchAll(/<p14:sldId id="(\d+)"/g)].map((x) => x[1]) });
  }
  if (!sections.length) throw new Error("이 PPT 에는 구역(섹션)이 없어서 곡을 나눌 수 없습니다.\nPowerPoint 에서 '곡 제목(v1)', '곡 제목(c)' 처럼 구역을 나눈 파일을 넣어 주세요.");

  // 슬라이드 내용 읽기
  const slides = {};
  for (const sec of sections) for (const id of sec.ids) {
    const xml = await read(slideOf[id]);
    slides[id] = { texts: shapeTexts(xml), special: /<p:graphicFrame|<p:pic>|<p:pic |videoFile|<a:tbl>/.test(xml) };
  }
  // 거의 모든 슬라이드에 들어있는 글(바닥글 문구 등)은 가사가 아님
  const freq = {};
  const all = Object.values(slides);
  for (const s of all) for (const t of new Set(s.texts.map((x) => x.join("\n")))) freq[t] = (freq[t] || 0) + 1;
  const footer = new Set(Object.keys(freq).filter((t) => freq[t] >= Math.max(3, all.length * 0.3)));
  for (const s of all) s.texts = s.texts.filter((x) => !footer.has(x.join("\n")));

  const songs = new Map();     // key -> {title, parts: Map(label -> lines), order, codes}
  const skipped = [];
  for (const sec of sections) {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(sec.name);
    const ss = sec.ids.map((id) => slides[id]).filter(Boolean);
    let title, code;
    if (m) { title = m[1].trim(); code = m[2].trim(); }
    else {
      // 카드(봉헌 등)로 시작해도, 나머지가 가사처럼 짧은 슬라이드들이면 곡으로 본다
      const plain = ss.filter((s) => !s.special && s.texts.length);
      const short = plain.filter((s) => s.texts.length <= 1 && s.texts.every((t) => t.length <= 3));
      const lyricLike = short.length >= 3 && short.length >= plain.length * 0.8;
      if (!lyricLike) { skipped.push(sec.name); continue; }
      title = sec.name; code = "";
    }
    const key = squash(title);
    if (!songs.has(key)) songs.set(key, { title, sections: [], order: [] });
    const song = songs.get(key);
    const lines = [];
    for (const s of ss) {
      const text = s.texts.flat().filter(Boolean);
      if (!text.length || s.special) continue;
      if (text.length === 1 && squash(text[0]) === key) { song.title = text[0]; continue; }   // 파트 시작 제목 슬라이드
      if (lines.length) lines.push("");
      lines.push(...text);
    }
    song.sections.push({ code, lines });
  }

  const result = [];
  for (const song of songs.values()) {
    const codes = [...new Set(song.sections.map((s) => s.code).filter(Boolean))];
    const parts = [];
    const order = [];
    for (const s of song.sections) {
      const label = s.code ? partLabel(s.code, codes) : "";
      order.push(label);
      const existing = parts.find((p) => p.label === label);
      if (!existing) { if (s.lines.length) parts.push({ label, lines: s.lines }); }
      else if (!label && s.lines.length) existing.lines.push("", ...s.lines);
    }
    if (!parts.length) continue;
    const uniqueInOrder = order.filter(Boolean);
    const needOrder = uniqueInOrder.length && uniqueInOrder.join("|") !== parts.map((p) => p.label).join("|");
    result.push({ title: song.title, artist: "", key: "", order: needOrder ? uniqueInOrder : [], sections: parts });
  }
  return { songs: result, skipped };
}

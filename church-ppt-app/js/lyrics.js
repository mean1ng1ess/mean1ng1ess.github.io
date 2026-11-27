// 가사 메모장(.txt) 형식 읽기/쓰기, 파트 이름/순서, 자동 나누기, 슬라이드 나누기.
// 윈도우 프로그램(church-ppt-maker/churchppt/lyrics_format.py)과 같은 형식·규칙.

const TABLE = {};
function reg(names, canonical, abbrev) { for (const n of names) TABLE[n] = [canonical, abbrev]; }
reg(["verse", "v", "벌스", "절"], "Verse", "V");
reg(["chorus", "c", "코러스", "후렴", "refrain", "후렴구"], "Chorus", "C");
reg(["pre-chorus", "prechorus", "pre chorus", "pc", "pre", "프리코러스", "프리 코러스", "프리-코러스", "프리"], "Pre-Chorus", "PC");
reg(["post-chorus", "postchorus", "post chorus", "psc", "포스트코러스"], "Post-Chorus", "PSC");
reg(["bridge", "b", "브릿지", "브리지"], "Bridge", "B");
reg(["intro", "i", "인트로", "전주"], "Intro", "I");
reg(["outro", "o", "아웃트로", "후주"], "Outro", "O");
reg(["ending", "e", "엔딩"], "Ending", "E");
reg(["tag", "t", "태그"], "Tag", "T");
reg(["interlude", "it", "간주"], "Interlude", "IT");
reg(["vamp", "vp", "뱀프"], "Vamp", "VP");

const isAscii = (s) => /^[\x00-\x7f]*$/.test(s);
const PLAIN = new Set(Object.keys(TABLE).filter((k) => (k.length > 2 || !isAscii(k)) && k !== "절" && k !== "프리"));
const LABEL_RE = /^([^\d]+?)\s*(\d+)?$/;
const KO_VERSE_RE = /^(\d+)\s*절$/;
const WRAPPERS = [["[", "]"], ["(", ")"], ["<", ">"], ["【", "】"], ["〔", "〕"], ["〈", "〉"], ["《", "》"]];

function cleanLabel(text) {
  let t = text.trim();
  for (const [a, b] of WRAPPERS) {
    if (t.startsWith(a) && t.endsWith(b)) { t = t.slice(1, -1); break; }
  }
  t = t.trim().replace(/[:：]+$/, "").trim();
  return t.replace(/\s+/g, " ");
}

function lookup(text) {
  const t = cleanLabel(text);
  if (!t) return null;
  let m = KO_VERSE_RE.exec(t);
  if (m) return ["Verse", "V", m[1]];
  m = LABEL_RE.exec(t);
  if (!m) return null;
  const name = m[1].trim().toLowerCase();
  if (TABLE[name]) return [TABLE[name][0], TABLE[name][1], m[2] || ""];
  return null;
}

export function normalizeLabel(text) {
  const f = lookup(text);
  if (!f) return cleanLabel(text);
  return f[2] ? `${f[0]} ${f[2]}` : f[0];
}

export function labelAbbrev(label) {
  const f = lookup(label);
  if (!f) return cleanLabel(label);
  return `${f[1]}${f[2]}`;
}

export function isBracketHeader(line) {
  const s = line.trim();
  return s.startsWith("[") && s.endsWith("]") && s.length > 2;
}

export function isHeaderLine(line) {
  const s = line.trim();
  if (!s) return false;
  if (isBracketHeader(s)) return true;
  const t = cleanLabel(s);
  if (KO_VERSE_RE.test(t)) return true;
  const m = LABEL_RE.exec(t);
  return !!(m && PLAIN.has(m[1].trim().toLowerCase()));
}

// ---------------------------------------------------------------- 순서
export function parseOrder(text) {
  if (!text || !text.trim()) return [];
  let s = text;
  for (const sep of ["→", "->", ">", "|", "/", "、", "，"]) s = s.split(sep).join(",");
  s = s.replace(/\s+-\s+/g, ",");
  let raw;
  if (s.includes(",")) raw = s.split(",").map((t) => t.trim().replace(/^-+|-+$/g, "").trim());
  else {
    raw = [];
    for (let tok of s.split(/\s+/)) {
      tok = tok.replace(/^-+|-+$/g, "");
      if (raw.length && (/^\d+$/.test(tok) || (/^[A-Z]$/.test(tok) && /^part$/i.test(raw[raw.length - 1])))) raw[raw.length - 1] += ` ${tok}`;
      else raw.push(tok);
    }
  }
  return raw.filter(Boolean).map(normalizeLabel);
}

export const formatOrder = (order) => order.join(", ");

const key = (l) => normalizeLabel(l).toLowerCase();

export function resolveOrder(song) {
  if (!song.order || !song.order.length) return { seq: [...song.sections], missing: [] };
  const byKey = new Map(), byAbbrev = new Map();
  for (const sec of song.sections) {
    if (!sec.label) continue;
    if (!byKey.has(key(sec.label))) byKey.set(key(sec.label), sec);
    const ab = labelAbbrev(sec.label).toLowerCase();
    if (!byAbbrev.has(ab)) byAbbrev.set(ab, sec);
  }
  const seq = [], missing = [];
  for (const token of song.order) {
    const k = key(token);
    let sec = byKey.get(k) || byAbbrev.get(labelAbbrev(token).toLowerCase());
    if (!sec) {
      for (const [kk, cand] of byKey) {
        if (kk.startsWith(k + " ") || k.startsWith(kk + " ")) { sec = cand; break; }
      }
    }
    if (sec) seq.push(sec); else missing.push(token);
  }
  if (!seq.length) return { seq: [...song.sections], missing };
  return { seq, missing };
}

// ---------------------------------------------------------------- 텍스트 <-> 곡
const META_RE = /^\s*(제목|곡명|아티스트|가수|작곡|순서|송폼|키|title|artist|order|key)\s*[:：]\s*(.*)$/i;
const META_FIELD = {
  "제목": "title", "곡명": "title", title: "title",
  "아티스트": "artist", "가수": "artist", "작곡": "artist", artist: "artist",
  "순서": "order", "송폼": "order", order: "order", "키": "key", key: "key",
};

function trimBlanks(lines) {
  const out = [];
  for (const ln of lines) {
    if (ln === "" && (!out.length || out[out.length - 1] === "")) continue;
    out.push(ln);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

export function parseBody(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.some(isBracketHeader) ? isBracketHeader : isHeaderLine;
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (header(line)) { cur = { label: normalizeLabel(line), lines: [] }; sections.push(cur); continue; }
    if (!cur) {
      if (!line.trim()) continue;
      cur = { label: "", lines: [] }; sections.push(cur);
    }
    cur.lines.push(line.trim());
  }
  for (const s of sections) s.lines = trimBlanks(s.lines);
  return sections.filter((s) => s.lines.length || s.label);
}

// 가사 중간에 넣는 '빈 화면' 슬라이드 표시 (앞뒤 빈 줄로 따로 한 장)
export const BLANK_LINE = "(빈 화면)";

export function emptySong() { return { title: "", artist: "", key: "", order: [], sections: [] }; }

export function parseSongText(text) {
  const song = emptySong();
  const body = [];
  let inMeta = true;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (inMeta) {
      const m = META_RE.exec(raw);
      if (m) {
        const f = META_FIELD[m[1].toLowerCase()];
        if (f === "order") song.order = parseOrder(m[2].trim());
        else song[f] = m[2].trim();
        continue;
      }
      if (raw.trim()) inMeta = false;
    }
    body.push(raw);
  }
  song.sections = parseBody(body.join("\n"));
  return song;
}

export function sectionsToBody(sections) {
  if (!sections.length) return "";
  return sections.map((s) => {
    const block = s.lines.join("\n");
    return s.label ? (block ? `[${s.label}]\n${block}` : `[${s.label}]`) : block;
  }).join("\n\n").trim() + "\n";
}

export function songToText(song) {
  const head = [`제목: ${song.title || ""}`];
  if (song.artist) head.push(`아티스트: ${song.artist}`);
  if (song.key) head.push(`키: ${song.key}`);
  if (song.order && song.order.length) head.push(`순서: ${formatOrder(song.order)}`);
  return head.join("\n") + "\n\n" + sectionsToBody(song.sections);
}

export const isStructured = (song) => song.sections.some((s) => s.label);

// ---------------------------------------------------------------- 자동 나누기
const CHORD = /^[A-G][#b♯♭]?(m|maj|min|dim|aug|sus|add)?\d*(sus\d*|add\d*)?(\/[A-G][#b♯♭]?)?$/;
const REPEAT = /\s*[([]?\s*[x×X]\s*\d+\s*[)\]]?\s*$|\s*\(?반복\)?\s*$/;
const JUNK = /(https?:\/\/|www\.|©|copyright|all rights reserved|가사\s*출처|^출처|^작사|^작곡|^편곡)/i;
const HYMN_VERSE = /^(\d{1,2})\s*[.)]\s*(.+)$/;

const isChordLine = (line) => {
  const toks = line.replace(/\|/g, " ").split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every((t) => CHORD.test(t));
};

export function cleanPastedLyrics(text) {
  const out = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/ /g, " ").split("\n")) {
    let line = raw.replace(/[ \t]+/g, " ").trim();
    if (line && (isChordLine(line) || JUNK.test(line))) continue;
    if (line && !isHeaderLine(line)) {
      line = line.replace(REPEAT, "").trim();
      if (!line) continue;
    }
    if (!line && (!out.length || out[out.length - 1] === "")) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function stanzas(text) {
  const res = [];
  let cur = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim()) cur.push(raw.trim());
    else if (cur.length) { res.push(cur); cur = []; }
  }
  if (cur.length) res.push(cur);
  return res;
}

function hymnStructure(st) {
  if (st.filter((s) => HYMN_VERSE.test(s[0])).length < 2) return null;
  const sections = [], verses = [];
  let chorus = null;
  for (const s of st) {
    const m = HYMN_VERSE.exec(s[0]);
    if (m) {
      const label = `Verse ${parseInt(m[1], 10)}`;
      sections.push({ label, lines: [m[2].trim(), ...s.slice(1)] });
      verses.push(label);
    } else if (!chorus) {
      chorus = { label: "Chorus", lines: [...s] };
      sections.push(chorus);
    } else chorus.lines.push("", ...s);
  }
  const order = [];
  if (chorus) for (const v of verses) order.push(v, "Chorus");
  return { sections, order };
}

// 머리말이 있으면 그대로, 없으면 반복되는 연을 후렴으로 추정. 반복이 없으면 쭉 이어지는 가사.
export function autoStructure(text) {
  const lines = text.split(/\r?\n/);
  if (lines.some(isHeaderLine)) {
    const numbered = lines.filter((ln, i) => HYMN_VERSE.test(ln.trim()) && (i === 0 || !lines[i - 1].trim())).length;
    const out = [];
    lines.forEach((ln, i) => {
      const s = ln.trim();
      const m = HYMN_VERSE.exec(s);
      if (isHeaderLine(s)) out.push(`[${normalizeLabel(s)}]`);
      else if (numbered >= 2 && m && (i === 0 || !lines[i - 1].trim())) out.push(`[Verse ${parseInt(m[1], 10)}]`, m[2].trim());
      else out.push(ln);
    });
    const sections = parseBody(out.join("\n"));
    const labels = sections.map((s) => s.label);
    const order = [];
    if (numbered >= 2 && labels.filter((l) => l === "Chorus").length === 1) {
      for (const l of labels) if (l.startsWith("Verse")) order.push(l, "Chorus");
    }
    return { sections, order };
  }
  const st = stanzas(text);
  if (!st.length) return { sections: [], order: [] };
  const hymn = hymnStructure(st);
  if (hymn) return hymn;
  const keys = st.map((s) => s.join("\n").replace(/ /g, ""));
  const counts = {};
  for (const k of keys) counts[k] = (counts[k] || 0) + 1;
  if (st.length === 1 || Math.max(...Object.values(counts)) < 2) {
    const ls = [];
    for (const s of st) { if (ls.length) ls.push(""); ls.push(...s); }
    return { sections: [{ label: "", lines: ls }], order: [] };
  }
  const labels = {}, sections = [], order = [];
  let v = 0, c = 0;
  keys.forEach((k, i) => {
    if (!labels[k]) {
      if (counts[k] >= 2) { c++; labels[k] = c === 1 ? "Chorus" : `Chorus ${c}`; }
      else { v++; labels[k] = `Verse ${v}`; }
      sections.push({ label: labels[k], lines: [...st[i]] });
    }
    order.push(labels[k]);
  });
  return { sections, order };
}

// 메모장 파일 하나를 열 때: 이미 [Verse] 로 나뉘어 있으면 그대로, 아니면 자동으로 나눈다.
export function songFromTxt(text, fallbackTitle = "") {
  const song = parseSongText(text);
  if (!isStructured(song)) {
    const body = song.sections.map((s) => s.lines.join("\n")).join("\n\n");
    const { sections, order } = autoStructure(cleanPastedLyrics(body));
    if (sections.length) { song.sections = sections; if (!song.order.length) song.order = order; }
  }
  if (!song.title) song.title = fallbackTitle;
  return song;
}

// ---------------------------------------------------------------- 슬라이드 나누기
export function chunkLines(lines, perSlide) {
  perSlide = Math.max(1, perSlide | 0);
  const groups = [[]];
  for (const ln of lines) {
    if (ln === "") { if (groups[groups.length - 1].length) groups.push([]); }
    else groups[groups.length - 1].push(ln);
  }
  const slides = [];
  for (const g of groups) {
    if (!g.length) continue;
    const n = Math.ceil(g.length / perSlide);
    const base = Math.floor(g.length / n), extra = g.length % n;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const size = base + (i < extra ? 1 : 0);
      slides.push(g.slice(idx, idx + size));
      idx += size;
    }
  }
  return slides;
}

export function safeFilename(name, dflt = "제목없음") {
  const s = (name || "").replace(/[\\/:*?"<>|\r\n\t]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "");
  return s.slice(0, 80) || dflt;
}

// 메모장에서 깨지지 않게: BOM + CRLF
export function txtBlob(text) {
  return new Blob(["﻿" + text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")], { type: "text/plain;charset=utf-8" });
}

// 옛날 메모장(ANSI=cp949) 파일도 읽기
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
  catch { /* 아래로 */ }
  try { return new TextDecoder("euc-kr").decode(buf); } catch { /* 아래로 */ }
  return new TextDecoder("utf-8").decode(buf);
}

// ---------------------------------------------------------------- 교회 가사 모음 파일 (여러 형식)
// · 첫 줄 <제목>
// · 파트 머리말: [Verse] [Chorus (목소리)] / Verse 1 / 1절 / 그리고 글자만 있는 줄 a, b, A, c, v1, p
// · 같은 파트를 여러 번 적어 둔 파일은 한 번만 남기고 부르는 순서는 '순서' 로
const LETTER_RE = /^([A-Za-z])(\d?)$/;
const LETTER_PART = { v: "Verse", c: "Chorus", b: "Bridge", p: "Pre-Chorus", t: "Tag", i: "Intro", o: "Outro", e: "Ending" };

export function songFromAnyTxt(text, fallbackTitle = "") {
  const all = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n")
    .map((l) => l.replace(/[\u200b\u200c\u200d\u2060]/g, ""))
    .map((l) => (/^\s*[-=_~]+\s*$/.test(l) ? "" : l));   // -, ----- 같은 구분선 = 빈 줄
  if (all.slice(0, 6).some((l) => META_RE.test(l))) return parseSongText(all.join("\n"));   // 앱 형식 (제목: ...)
  let title = "";
  let i = 0;
  while (i < all.length && !all[i].trim()) i++;
  const first = i < all.length ? all[i].trim() : "";
  const tm = /^<\s*(.+?)\s*>$/.exec(first);
  const sq = (x) => x.replace(/[\s_?？!.]/g, "").toLowerCase();
  if (tm) { title = tm[1].replace(/[?？]\s*$/, "").trim(); i++; }
  else if (first && fallbackTitle && (sq(first) === sq(fallbackTitle) || sq(fallbackTitle).startsWith(sq(first)))) { title = first; i++; }
  const lines = all.slice(i);
  title = title || fallbackTitle;
  const letterHeads = lines.filter((l) => LETTER_RE.test(l.trim()));
  const numHeads = lines.filter((l) => /^\d{1,2}\.?$/.test(l.trim()));
  const isHead = (t) => LETTER_RE.test(t) || (numHeads.length >= 1 && /^\d{1,2}\.?$/.test(t)) || isHeaderLine(t.replace(/\.+$/, ""));
  const hasHeads = letterHeads.length > 0 || numHeads.length > 0 || lines.some((l) => isHead(l.trim()));
  if (!hasHeads) {
    // 파트 이름 없이 부르는 순서대로 적은 파일: 적힌 그대로 (빈 줄 = 슬라이드 넘김)
    const song = emptySong();
    song.title = title;
    const ls = trimBlanks(lines.map((l) => l.trim()));
    while (ls.length && ls[0] === "") ls.shift();
    if (ls.length) song.sections = [{ label: "", lines: ls }];
    return song;
  }
  // 글자 머리말이 알파벳 순서(a,b,c,d)인지, v/c/b/p 약자인지
  const codes = letterHeads.map((l) => l.trim().toLowerCase());
  const alphabetic = codes.some((c) => /^[a-z]$/.test(c) && !LETTER_PART[c]) || codes.includes("a");
  const labelOf = (line) => {
    const t = line.trim().replace(/\.+$/, "");
    if (/^\d{1,2}$/.test(t)) return `Verse ${+t}`;
    const m = LETTER_RE.exec(t);
    if (m) {
      if (alphabetic) return `Part ${m[1].toUpperCase()}${m[2]}`;
      const name = LETTER_PART[m[1].toLowerCase()];
      return name ? (m[2] ? `${name} ${m[2]}` : name) : `Part ${t.toUpperCase()}`;
    }
    return normalizeLabel(t);
  };
  // 순서대로 파트 모으기
  const occ = [];
  let cur = null;
  for (const l of lines) {
    const t = l.trim();
    if (t && isHead(t)) { cur = { label: labelOf(t), lines: [] }; occ.push(cur); continue; }
    if (!cur) { if (!t) continue; cur = { label: "", lines: [] }; occ.push(cur); }
    cur.lines.push(t);
  }
  for (const o of occ) { o.lines = trimBlanks(o.lines); while (o.lines[0] === "") o.lines.shift(); }
  // 첫 머리말 앞에 적힌 가사 = 첫 Verse
  if (occ.length > 1 && !occ[0].label) occ[0].label = occ.some((o) => /^Verse 1$/.test(o.label)) ? "Verse" : (occ.some((o) => o.label === "Verse") ? "Verse 1" : "Verse");
  const sections = [], order = [];
  const byKey = new Map();
  const baseCount = {};
  for (const o of occ) {
    if (!o.lines.length) continue;
    const body = o.lines.join("\n");
    const k = `${o.label}\u0000${body}`;
    if (byKey.has(k)) { order.push(byKey.get(k)); continue; }
    // 같은 이름인데 가사가 다르면 번호: Verse -> Verse 1, Verse 2
    const base = o.label;
    baseCount[base] = (baseCount[base] || 0) + 1;
    let label = base;
    if (base && baseCount[base] > 1) {
      const first = sections.find((s) => s.base === base && !/\d$/.test(s.label));
      if (first && !/\d$/.test(base)) first.label = `${base} 1`;
      label = /\d$/.test(base) ? `${base}-${baseCount[base]}` : `${base} ${baseCount[base]}`;
      for (let n = 0; n < order.length; n++) if (first && order[n] === base) order[n] = `${base} 1`;
    }
    sections.push({ label, lines: o.lines, base });
    byKey.set(k, label);
    order.push(label);
  }
  const song = emptySong();
  song.title = title;
  song.sections = sections.map(({ label, lines: ls }) => ({ label, lines: ls }));
  const uniq = song.sections.map((s) => s.label);
  song.order = order.join("|") === uniq.join("|") ? [] : order;
  if (song.sections.length === 1 && !song.sections[0].label) song.order = [];
  return song;
}

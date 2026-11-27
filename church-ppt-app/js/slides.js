// 예배 순서 -> 슬라이드 목록, 디자인 기본값.  (윈도우 프로그램의 service.py / design.py 와 같은 규칙)
import { chunkLines, parseBody, parseOrder, resolveOrder } from "./lyrics.js";

export const ITEM = { COVER: "cover", SONG: "song", SCRIPTURE: "scripture", SERMON: "sermon", TEXT: "text" };
export const ITEM_LABELS = { cover: "표지", song: "찬양", scripture: "성경", sermon: "설교", text: "광고/텍스트" };
export const ITEM_ICONS = { cover: "🏠", song: "🎵", scripture: "📖", sermon: "🎤", text: "📝" };

export function defaultData(kind) {
  return {
    cover: { title: "주일 예배", subtitle: "", date: "" },
    song: { title: "", artist: "", key: "", order: "", body: "" },
    scripture: { reference: "", translation: "개역개정", text: "" },
    sermon: { title: "", preacher: "", reference: "", body: "" },
    text: { title: "", body: "" },
  }[kind];
}

export function itemName(item) {
  const d = item.data;
  const name = {
    song: d.title || "(제목 없는 찬양)", scripture: d.reference || "(본문 미입력)",
    sermon: d.title || "(설교 제목 없음)", cover: d.title || "표지", text: d.title || "(제목 없음)",
  }[item.kind];
  return name;
}

export function itemToSong(item) {
  const d = item.data;
  return {
    title: (d.title || "").trim(), artist: (d.artist || "").trim(), key: (d.key || "").trim(),
    order: parseOrder(d.order || ""), sections: parseBody(d.body || ""),
  };
}

const style = (o) => ({ font: "맑은 고딕", size: 40, color: "#FFFFFF", bold: true, outline: false,
  outlineColor: "#000000", outlineWidth: 1.5, shadow: true, ...o });

export function defaultDesign() {
  return {
    name: "기본 - 검정 배경", ratio: "16:9", bgColor: "#000000", bgImage: "", bgDim: 0,
    lyrics: style({ size: 44 }), lyricsAlign: "center", lyricsAnchor: "middle", margin: 0.06, lineSpacing: 1.25,
    showLabel: false, labelStyle: style({ size: 16, bold: false, shadow: false, color: "#BBBBBB" }), showSongTitle: false,
    titleStyle: style({ size: 60 }), headingStyle: style({ size: 40, color: "#FFE08A" }),
    bodyStyle: style({ size: 34, bold: false }), contentAlign: "left",
    linesPerSlide: 2, songTitleSlide: false, blankAfterSong: true, sectionMode: "part", versesPerSlide: 2, autoShrink: true,
  };
}

export const PRESETS = {
  "기본 - 검정 배경": {},
  "방송용 하단 자막": { lyrics: style({ size: 36, outline: true, outlineWidth: 2 }), lyricsAnchor: "bottom", margin: 0.05 },
  "밝은 배경": {
    bgColor: "#F6F1E7", lyrics: style({ size: 44, color: "#2B2B2B", shadow: false }),
    titleStyle: style({ size: 60, color: "#2B2B2B", shadow: false }), headingStyle: style({ size: 40, color: "#7A4E1D", shadow: false }),
    bodyStyle: style({ size: 34, color: "#2B2B2B", bold: false, shadow: false }),
  },
  "네이비": { bgColor: "#16233F", headingStyle: style({ size: 40, color: "#9CC3FF" }) },
};

export function presetDesign(name) {
  return { ...defaultDesign(), ...PRESETS[name], name };
}

// 저장된 디자인에 새 항목이 빠져 있어도 동작하도록
export function normalizeDesign(d) {
  const base = defaultDesign();
  const out = { ...base, ...(d || {}) };
  for (const k of ["lyrics", "labelStyle", "titleStyle", "headingStyle", "bodyStyle"]) out[k] = { ...base[k], ...(d && d[k]) };
  return out;
}

function blocks(text) {
  const res = [];
  let cur = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    if (raw.trim()) cur.push(raw.trim());
    else if (cur.length) { res.push(cur); cur = []; }
  }
  if (cur.length) res.push(cur);
  return res;
}

// slide: {kind: lyrics|cover|content|blank, section, sectionId, heading, label, lines, subtitle, notes, hint, song}
export function songSlides(song, design, ids) {
  const title = song.title || "찬양";
  const { seq } = resolveOrder(song);
  const slides = [];
  const bySong = design.sectionMode === "song";
  const songId = ids.next();
  if (design.songTitleSlide) slides.push({ kind: "cover", section: title, sectionId: songId, heading: title, subtitle: song.artist || "", lines: [], notes: `${title} | 제목` });
  let first = true, lastName = title, lastId = songId;
  seq.forEach((sec, i) => {
    let name, sid;
    if (bySong) { name = title; sid = songId; }
    else {
      name = sec.label ? `${title} - ${sec.label}` : title;
      sid = (i === 0 && !design.songTitleSlide) ? songId : ids.next();
    }
    for (const chunk of chunkLines(sec.lines, design.linesPerSlide)) {
      slides.push({
        kind: "lyrics", section: name, sectionId: sid, heading: first && design.showSongTitle ? title : "",
        label: sec.label, lines: chunk, song: title, notes: sec.label ? `${title} | ${sec.label}` : title,
      });
      first = false;
    }
    lastName = name; lastId = sid;
  });
  if (design.blankAfterSong && slides.length) slides.push({ kind: "blank", section: lastName, sectionId: lastId, lines: [], notes: `${title} 끝` });
  return slides;
}

export function makeIds() { let v = 0; return { next: () => ++v }; }

export function itemSlides(item, design, ids = makeIds()) {
  const d = item.data;
  if (item.kind === "song") return songSlides(itemToSong(item), design, ids);
  if (item.kind === "cover") {
    const sub = [d.subtitle, d.date].filter((x) => x && x.trim());
    return [{ kind: "cover", section: "표지", sectionId: ids.next(), heading: d.title || "", subtitle: sub.join("\n"), lines: [] }];
  }
  if (item.kind === "scripture") {
    const ref = (d.reference || "").trim() || "성경 본문";
    const tr = (d.translation || "").trim();
    const heading = tr ? `${ref} (${tr})` : ref;
    const sid = ids.next();
    const chunks = chunkLines((d.text || "").split(/\r?\n/).map((s) => s.trim()), design.versesPerSlide);
    if (!chunks.length) return [{ kind: "cover", section: `말씀 - ${ref}`, sectionId: sid, heading, lines: [], subtitle: "" }];
    return chunks.map((c) => ({ kind: "content", section: `말씀 - ${ref}`, sectionId: sid, heading, lines: c, notes: heading, hint: "scripture" }));
  }
  if (item.kind === "sermon") {
    const title = (d.title || "").trim() || "설교";
    const sid = ids.next();
    const sub = [d.reference, d.preacher].filter((x) => x && x.trim()).map((x) => x.trim());
    const out = [{ kind: "cover", section: `설교 - ${title}`, sectionId: sid, heading: title, subtitle: sub.join("\n"), lines: [], notes: title }];
    for (const b of blocks(d.body)) out.push({ kind: "content", section: `설교 - ${title}`, sectionId: sid, heading: title, lines: b, notes: title });
    return out;
  }
  const title = (d.title || "").trim();
  const sid = ids.next();
  const bl = blocks(d.body);
  const name = title || "안내";
  if (!bl.length) return [{ kind: "cover", section: name, sectionId: sid, heading: title, lines: [], subtitle: "" }];
  return bl.map((b) => ({ kind: "content", section: name, sectionId: sid, heading: title, lines: b }));
}

export function serviceSlides(items, design) {
  const ids = makeIds();
  return items.flatMap((it) => itemSlides(it, design, ids));
}

// ---------------------------------------------------------------- 글자 크기 자동 맞춤 (대략)
function charEm(ch) {
  const o = ch.codePointAt(0);
  if (ch === " ") return 0.28;
  if ((o >= 0x1100 && o <= 0x11ff) || (o >= 0x3130 && o <= 0x318f) || (o >= 0xac00 && o <= 0xd7af) ||
      (o >= 0x4e00 && o <= 0x9fff) || (o >= 0x3000 && o <= 0x303f) || (o >= 0xff00 && o <= 0xffef)) return 0.95;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[a-z]/i.test(ch)) return 0.52;
  return 0.36;
}
export const textEm = (t) => [...t].reduce((a, c) => a + charEm(c), 0);

export function fitScale(paras, boxW, boxH, spacing, minScale = 0.5) {
  if (boxW <= 0 || boxH <= 0) return 1;
  const height = (scale) => paras.reduce((h, [text, size]) => {
    const s = size * scale;
    const n = text ? Math.max(1, Math.ceil(textEm(text) * s * 1.08 / boxW)) : 1;
    return h + n * s * spacing * 1.2;
  }, 0);
  let scale = 1;
  while (scale > minScale && height(scale) > boxH) scale -= 0.03;
  return Math.max(scale, minScale);
}

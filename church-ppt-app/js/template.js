// "우리 교회 PPT 틀" 모드.
// 교회 PPT 파일을 그대로 틀로 쓴다:
//   · 찬양이 아닌 구역(예배가 곧 시작됩니다, 사도신경, 대표기도/봉독/설교 카드, 말씀 표, 봉헌, 축도, 광고, 마침)은
//     원래 슬라이드를 그대로 복사한다 (영상·사진·표·효과 포함). 이번 주에 바뀌는 글자만 고칠 수 있다.
//   · 찬양 구역은 새 곡으로 바꾼다. 원래 PPT 의 '곡 제목 슬라이드'와 '가사 슬라이드'를 복제해서 글자만 바꾼다.
// PPT 파일은 휴대폰 안(IndexedDB)에만 저장된다.
import { chunkLines, resolveOrder } from "./lyrics.js";
import { itemToSong, sectionName } from "./slides.js";
import { songsFromPptx } from "./pptimport.js";

const NS = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p14: "http://schemas.microsoft.com/office/powerpoint/2010/main",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
};
const RT_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const RT_NOTES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
const CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const SECTION_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";

const parse = (s) => new globalThis.DOMParser().parseFromString(s, "application/xml");
const ser = (doc) => new globalThis.XMLSerializer().serializeToString(doc);
const els = (node, ns, name) => Array.from(node.getElementsByTagNameNS(NS[ns], name));
const kids = (node, ns, name) => Array.from(node.childNodes).filter((c) => c.nodeType === 1 && c.namespaceURI === NS[ns] && c.localName === name);
const squash = (s) => s.replace(/\s+/g, "");

// ------------------------------------------------------------------ 저장 (IndexedDB)
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("cppt", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveTemplate(name, data) {
  const d = await db();
  await new Promise((res, rej) => { const t = d.transaction("files", "readwrite"); t.objectStore("files").put({ name, data }, "template"); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
export async function loadTemplate() {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction("files").objectStore("files").get("template"); t.onsuccess = () => res(t.result || null); t.onerror = () => rej(t.error); });
}
export async function clearTemplate() {
  const d = await db();
  await new Promise((res) => { const t = d.transaction("files", "readwrite"); t.objectStore("files").delete("template"); t.oncomplete = res; });
}

// ------------------------------------------------------------------ 슬라이드 글자
function textOfBody(txBody) {
  return kids(txBody, "a", "p").map((p) => {
    let s = "";
    for (const n of Array.from(p.childNodes)) {
      if (n.localName === "r" || n.localName === "fld") s += els(n, "a", "t").map((t) => t.textContent).join("");
      else if (n.localName === "br") s += "\n";
    }
    return s;
  }).join("\n");
}

function setBodyLines(txBody, lines) {
  const doc = txBody.ownerDocument;
  const paras = kids(txBody, "a", "p");
  const tpl = paras[0];
  let rPr = null;
  for (const p of paras) { const r = kids(p, "a", "r")[0]; if (r && kids(r, "a", "rPr")[0]) { rPr = kids(r, "a", "rPr")[0]; break; } }
  if (!rPr) { const e = tpl && kids(tpl, "a", "endParaRPr")[0]; if (e) { rPr = doc.createElementNS(NS.a, "a:rPr"); for (const at of Array.from(e.attributes)) rPr.setAttribute(at.name, at.value); for (const c of Array.from(e.childNodes)) rPr.appendChild(c.cloneNode(true)); } }
  for (const p of paras) txBody.removeChild(p);
  for (const line of (lines.length ? lines : [""])) {
    const p = tpl ? tpl.cloneNode(true) : doc.createElementNS(NS.a, "a:p");
    for (const c of Array.from(p.childNodes)) if (c.nodeType === 1 && ["r", "br", "fld"].includes(c.localName)) p.removeChild(c);
    if (line) {
      const r = doc.createElementNS(NS.a, "a:r");
      if (rPr) r.appendChild(rPr.cloneNode(true));
      const t = doc.createElementNS(NS.a, "a:t");
      t.textContent = line;
      r.appendChild(t);
      const end = kids(p, "a", "endParaRPr")[0];
      if (end) p.insertBefore(r, end); else p.appendChild(r);
    }
    txBody.appendChild(p);
  }
}

function area(sp) {
  const ext = els(sp, "a", "ext").find((e) => e.parentNode && e.parentNode.localName === "xfrm");
  return ext ? (+ext.getAttribute("cx")) * (+ext.getAttribute("cy")) : 0;
}

// 고칠 수 있는 칸: 글상자(바닥글 제외) 와 표
function fields(doc, footer) {
  const out = [];
  let ti = 0, bi = 0;
  for (const sp of els(doc, "p", "sp")) {
    // 바닥글은 '거의 모든 장에 반복되는 글' 로만 판단 (교회 PPT 는 바닥글 칸을 제목으로도 씀)
    const body = els(sp, "p", "txBody")[0];
    if (!body) continue;
    const text = textOfBody(body).trim();
    if (!text || footer.has(text)) continue;
    out.push({ key: `s${ti++}`, kind: "text", value: text, node: body, area: area(sp) });
  }
  for (const tbl of els(doc, "a", "tbl")) {
    const rows = kids(tbl, "a", "tr").map((tr) => kids(tr, "a", "tc").map((tc) => textOfBody(kids(tc, "a", "txBody")[0] || tc).replace(/\n/g, " ").trim()));
    out.push({ key: `t${bi++}`, kind: "table", value: rows.map((r) => r.join(" | ")).join("\n"), node: tbl });
  }
  return out;
}

function setTable(tbl, text) {
  const rows = kids(tbl, "a", "tr");
  if (!rows.length) return;
  const tpl = rows[0];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const r of rows) tbl.removeChild(r);
  for (const line of lines) {
    const tr = tpl.cloneNode(true);
    const cells = kids(tr, "a", "tc");
    const parts = line.split("|").map((x) => x.trim());
    // 칸 수보다 많이 나뉘면 마지막 칸에 합침
    while (parts.length > cells.length) parts.push(parts.splice(cells.length - 1).join(" | "));
    cells.forEach((tc, i) => { const b = kids(tc, "a", "txBody")[0]; if (b) setBodyLines(b, [parts[i] || ""]); });
    tbl.appendChild(tr);
  }
}

// ------------------------------------------------------------------ 분석
async function openZip(data) {
  const zip = await globalThis.JSZip.loadAsync(data);
  const read = async (p) => { const f = zip.file(p); return f ? f.async("string") : null; };
  const pres = parse(await read("ppt/presentation.xml"));
  const presRels = parse(await read("ppt/_rels/presentation.xml.rels"));
  const relById = {};
  for (const r of els(presRels, "rel", "Relationship")) relById[r.getAttribute("Id")] = r;
  const slidePath = {}, slideRid = {};
  for (const s of els(pres, "p", "sldId")) {
    const rid = s.getAttributeNS(NS.r, "id");
    slideRid[s.getAttribute("id")] = rid;
    slidePath[s.getAttribute("id")] = "ppt/" + relById[rid].getAttribute("Target").replace(/^\/?ppt\//, "").replace(/^\//, "");
  }
  const sections = els(pres, "p14", "section").map((s) => ({ name: s.getAttribute("name"), ids: els(s, "p14", "sldId").map((x) => x.getAttribute("id")) }));
  const docs = {};
  for (const id of Object.keys(slidePath)) docs[id] = parse(await read(slidePath[id]));
  // 거의 모든 슬라이드에 있는 글 = 바닥글
  const freq = {};
  for (const d of Object.values(docs)) for (const t of new Set(els(d, "p", "txBody").map((b) => textOfBody(b).trim()).filter(Boolean))) freq[t] = (freq[t] || 0) + 1;
  const n = Object.keys(docs).length;
  const footer = new Set(Object.keys(freq).filter((t) => freq[t] >= Math.max(3, n * 0.3)));
  return { zip, read, pres, presRels, relById, slidePath, slideRid, sections, docs, footer };
}

const isSpecial = (doc) => els(doc, "p", "pic").length > 0 || els(doc, "p", "graphicFrame").length > 0;

// 교회 PPT 방식 구역 이름: 곡(v1) 곡(c) 곡(b) 곡(p) / 알파벳 파트(A, B..)는 그대로
function partSectionName(title, label, labels) {
  const m = /^Part ([A-Z])$/.exec(label);
  if (m) return `${title}(${m[1]})`;
  if (label === "Verse 1" && !labels.includes("Verse 2")) return `${title}(v)`;
  return sectionName(title, label, { sectionNaming: "short" });
}

// 빈 줄로 나눈 슬라이드가 있으면 그 나눔 그대로, 없으면 n 줄씩
const slideChunks = (lines, n) => (lines.includes("") ? chunkLines(lines, 999) : chunkLines(lines, n));

export async function analyzeTemplate(data) {
  const z = await openZip(data);
  if (!z.sections.length) throw new Error("이 PPT 에는 구역(섹션)이 없습니다. 구역이 나뉜 교회 PPT 를 넣어 주세요.");
  const imported = await songsFromPptx(data);
  const songByKey = new Map(imported.songs.map((s) => [squash(s.title), s]));
  const lyricLike = (sec) => {
    const plain = sec.ids.map((id) => fields(z.docs[id], z.footer)).filter((f) => f.length && !f.some((x) => x.kind === "table"));
    const short = plain.filter((f) => f.length === 1 && f[0].value.split("\n").length <= 3);
    return short.length >= 3 && short.length >= plain.length * 0.8;
  };
  // 구역 -> 덩어리 (같은 곡의 연속 구역은 한 곡)
  const blocks = [];
  let titleSlide = null, lyricSlide = null;
  z.sections.forEach((sec, i) => {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(sec.name);
    const song = m || lyricLike(sec);
    if (!song) { blocks.push({ kind: "fixed", sectionIndex: i, name: sec.name }); return; }
    const title = m ? m[1].trim() : sec.name;
    const key = squash(title);
    const last = blocks[blocks.length - 1];
    const lastId = sec.ids[sec.ids.length - 1];
    const lastF = lastId ? fields(z.docs[lastId], z.footer) : [];
    const endsWithTitle = lastF.length === 1 && squash(lastF[0].value) === key;
    if (last && last.kind === "song" && last.key === key && m) { last.closing = endsWithTitle; return; }   // 같은 곡 다음 파트
    const lead = [];
    for (const id of sec.ids) { if (isSpecial(z.docs[id])) lead.push(id); else break; }
    blocks.push({ kind: "song", key, title, song: songByKey.get(key) || null, sectionIndex: i, lead, closing: endsWithTitle });
    for (const id of sec.ids) {
      const f = fields(z.docs[id], z.footer);
      if (f.length !== 1 || f[0].kind !== "text") continue;
      const lines = f[0].value.split("\n").filter((x) => x.trim());
      if (!titleSlide && lines.length === 1 && squash(lines[0]) === key) titleSlide = id;
      else if (!lyricSlide && lines.length === 2) lyricSlide = id;
    }
  });
  const slideFields = {};
  for (const id of Object.keys(z.docs)) slideFields[id] = fields(z.docs[id], z.footer).map(({ key, kind, value }) => ({ key, kind, value }));
  const songs = blocks.filter((b) => b.kind === "song");
  const closingDefault = songs.filter((b) => b.closing).length > songs.length / 2;
  return { sections: z.sections, blocks, titleSlide, lyricSlide, slideFields, footer: [...z.footer], closingDefault };
}

// 틀로 '예배 순서' 기본값 만들기
export function serviceFromTemplate(analysis, uid) {
  return analysis.blocks.map((b) => b.kind === "fixed"
    ? { id: uid(), kind: "fixed", data: { sectionIndex: b.sectionIndex, name: b.name, edits: {}, skip: false } }
    : { id: uid(), kind: "song", data: { ...(b.song
      ? { title: b.song.title, artist: "", key: "", order: b.song.order.map(lbl).join(", "), body: b.song.sections.map((s) => (s.label ? `[${lbl(s.label)}]\n` : "") + s.lines.join("\n")).join("\n\n") + "\n" }
      : { title: b.title, artist: "", key: "", order: "", body: "" }), tplLead: b.lead, tplClosing: b.closing } });
}
// (A)(B) 같은 알파벳 파트는 Bridge/Chorus 로 바뀌지 않게 "Part A" 로 보관
function lbl(l) { return /^[A-Z]$/.test(l) ? `Part ${l}` : l; }   // (옛 형식 대비)

// ------------------------------------------------------------------ 만들기
export async function buildFromTemplate(data, items, { linesPerSlide = 2 } = {}) {
  const z = await openZip(data);
  const { zip } = z;
  const analysis = await analyzeTemplate(data);
  if (!analysis.lyricSlide) throw new Error("틀 PPT 에서 가사 슬라이드(두 줄짜리)를 찾지 못했습니다.");
  const ct = parse(await z.read("[Content_Types].xml"));
  let slideNum = Math.max(...Object.keys(zip.files).map((f) => (/^ppt\/slides\/slide(\d+)\.xml$/.exec(f) || [0, 0])[1] | 0));
  let sldMax = Math.max(...Object.keys(z.slidePath).map(Number));
  let ridMax = Math.max(...Object.keys(z.relById).map((r) => +(/\d+/.exec(r) || [0])[0]));
  const order = [];          // [{id, rid}]
  const outSections = [];    // [{name, ids:[]}]
  const used = new Set();

  async function cloneSlide(srcId, apply) {
    const src = z.slidePath[srcId];
    const doc = parse(ser(z.docs[srcId]));
    apply(doc);
    slideNum += 1; sldMax += 1; ridMax += 1;
    const path = `ppt/slides/slide${slideNum}.xml`;
    zip.file(path, ser(doc));
    const relsSrc = await z.read(src.replace("slides/", "slides/_rels/") + ".rels");
    if (relsSrc) {
      const rd = parse(relsSrc);
      for (const r of els(rd, "rel", "Relationship")) if (r.getAttribute("Type") === RT_NOTES) r.parentNode.removeChild(r);
      zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`, ser(rd));
    }
    const ov = ct.createElementNS(NS.ct, "Override");
    ov.setAttribute("PartName", "/" + path);
    ov.setAttribute("ContentType", CT_SLIDE);
    ct.documentElement.appendChild(ov);
    const rel = z.presRels.createElementNS(NS.rel, "Relationship");
    rel.setAttribute("Id", `rId${ridMax}`);
    rel.setAttribute("Type", RT_SLIDE);
    rel.setAttribute("Target", `slides/slide${slideNum}.xml`);
    z.presRels.documentElement.appendChild(rel);
    return { id: String(sldMax), rid: `rId${ridMax}` };
  }
  const mainBody = (doc) => {
    const f = fields(doc, z.footer).filter((x) => x.kind === "text");
    return f.length ? f.reduce((a, b) => (b.area > a.area ? b : a)).node : null;
  };
  const textSlide = (srcId, lines) => cloneSlide(srcId, (doc) => { const b = mainBody(doc); if (b) setBodyLines(b, lines); });
  const titleSrc = analysis.titleSlide || analysis.lyricSlide;

  for (const it of items) {
    if (it.kind === "fixed") {
      const sec = z.sections[it.data.sectionIndex];
      if (!sec || it.data.skip) continue;
      for (const id of sec.ids) {
        const edits = (it.data.edits || {})[id];
        if (edits && Object.keys(edits).length) {
          const doc = z.docs[id];
          for (const f of fields(doc, z.footer)) {
            if (edits[f.key] == null || edits[f.key] === f.value) continue;
            if (f.kind === "table") setTable(f.node, edits[f.key]);
            else setBodyLines(f.node, edits[f.key].split("\n"));
          }
          zip.file(z.slidePath[id], ser(doc));
        }
        order.push({ id, rid: z.slideRid[id] });
        used.add(id);
      }
      outSections.push({ name: sec.name, ids: sec.ids.filter((id) => used.has(id)), keepEmpty: true });
      continue;
    }
    if (it.kind === "song") {
      const song = itemToSong(it);
      const title = song.title || "찬양";
      const { seq } = resolveOrder(song);
      const parts = seq.length ? seq : [{ label: "", lines: [] }];
      const labels = song.sections.map((x) => x.label);
      const lead = (it.data.tplLead || []).filter((id) => z.slidePath[id]);
      const closing = it.data.tplClosing ?? analysis.closingDefault;
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        const ids = [];
        if (pi === 0 && lead.length) {
          for (const id of lead) { order.push({ id, rid: z.slideRid[id] }); used.add(id); ids.push(id); }   // 봉헌 카드 등 원래 슬라이드
        } else {
          const t = await textSlide(titleSrc, [title]);
          order.push(t); ids.push(t.id);
        }
        for (const chunk of slideChunks(part.lines, linesPerSlide)) { const s = await textSlide(analysis.lyricSlide, chunk); order.push(s); ids.push(s.id); }
        if (closing && pi === parts.length - 1 && !lead.length) { const t = await textSlide(titleSrc, [title]); order.push(t); ids.push(t.id); }
        outSections.push({ name: part.label ? partSectionName(title, part.label, labels) : title, ids });
      }
      continue;
    }
    // 틀 모드에서 따로 추가한 성경/설교/광고/표지: 제목 슬라이드 + 가사 슬라이드 모양으로
    const d = it.data;
    const head = (d.title || d.reference || "").trim();
    const body = (d.body || d.text || [d.subtitle, d.date].filter(Boolean).join("\n") || "").split(/\n\s*\n/).map((b) => b.split("\n").map((x) => x.trim()).filter(Boolean)).filter((b) => b.length);
    const ids = [];
    if (head) { const t = await textSlide(titleSrc, [head]); order.push(t); ids.push(t.id); }
    for (const b of body) for (const chunk of chunkLines(b, Math.max(linesPerSlide, 4))) { const s = await textSlide(analysis.lyricSlide, chunk); order.push(s); ids.push(s.id); }
    if (ids.length) outSections.push({ name: head || "내용", ids });
  }
  if (!order.length) throw new Error("만들 슬라이드가 없습니다.");

  // 쓰지 않는 원래 슬라이드(옛 찬양 등) 지우기
  for (const id of Object.keys(z.slidePath)) {
    if (used.has(id)) continue;
    const path = z.slidePath[id];
    const relsPath = path.replace("slides/", "slides/_rels/") + ".rels";
    const rels = await z.read(relsPath);
    if (rels) {
      for (const r of els(parse(rels), "rel", "Relationship")) {
        if (r.getAttribute("Type") !== RT_NOTES) continue;
        const np = "ppt/" + r.getAttribute("Target").replace(/^\.\.\//, "");
        zip.remove(np); zip.remove(np.replace("notesSlides/", "notesSlides/_rels/") + ".rels");
        for (const o of els(ct, "ct", "Override")) if (o.getAttribute("PartName") === "/" + np) o.parentNode.removeChild(o);
      }
    }
    zip.remove(path); zip.remove(relsPath);
    for (const o of els(ct, "ct", "Override")) if (o.getAttribute("PartName") === "/" + path) o.parentNode.removeChild(o);
    const rel = z.relById[z.slideRid[id]];
    if (rel && rel.parentNode) rel.parentNode.removeChild(rel);
  }

  // 슬라이드 순서
  const lst = els(z.pres, "p", "sldIdLst")[0];
  while (lst.firstChild) lst.removeChild(lst.firstChild);
  for (const o of order) {
    const e = z.pres.createElementNS(NS.p, "p:sldId");
    e.setAttribute("id", o.id);
    e.setAttributeNS(NS.r, "r:id", o.rid);
    lst.appendChild(e);
  }
  // 구역(섹션)
  const ext = els(z.pres, "p", "ext").find((e) => e.getAttribute("uri") === SECTION_URI);
  const secLst = ext && els(ext, "p14", "sectionLst")[0];
  if (secLst) {
    const old = els(secLst, "p14", "section");
    const tplSec = old[0];
    for (const s of old) secLst.removeChild(s);
    outSections.filter((s) => s.ids.length || s.keepEmpty).forEach((s, i) => {
      const sec = tplSec ? tplSec.cloneNode(false) : z.pres.createElementNS(NS.p14, "p14:section");
      sec.setAttribute("name", s.name);
      sec.setAttribute("id", `{${(crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`).toUpperCase()}}`);
      const l = z.pres.createElementNS(NS.p14, "p14:sldIdLst");
      for (const id of s.ids) { const x = z.pres.createElementNS(NS.p14, "p14:sldId"); x.setAttribute("id", id); l.appendChild(x); }
      sec.appendChild(l);
      secLst.appendChild(sec);
    });
  }
  zip.file("ppt/presentation.xml", ser(z.pres));
  zip.file("ppt/_rels/presentation.xml.rels", ser(z.presRels));
  zip.file("[Content_Types].xml", ser(ct));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 },
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

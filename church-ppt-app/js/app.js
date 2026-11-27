// 교회 PPT 메이커 (모바일 웹앱) - 화면
import * as L from "./lyrics.js";
import * as S from "./slides.js";
import { buildPptx } from "./pptx.js";
import { thumb } from "./preview.js";
import * as B from "./bible.js";

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

// ------------------------------------------------------------------ 저장
const KEY = { service: "cppt.service", library: "cppt.library", design: "cppt.design" };
function load(k, dflt) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; } catch { return dflt; } }
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch { toast("저장 공간이 부족합니다. 배경 사진을 지우거나 보관함 곡을 줄여 주세요."); }
}

function nextSunday() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const state = {
  service: load(KEY.service, null) || { name: `${nextSunday()} 주일예배`, items: [{ id: uid(), kind: "cover", data: { title: "주일 예배", subtitle: "", date: nextSunday() } }] },
  library: load(KEY.library, {}),
  design: S.normalizeDesign(load(KEY.design, null) || S.presetDesign("기본 - 검정 배경")),
  tab: "order",
  editing: null,
};
// 우리 교회 PPT 틀 (휴대폰 안에만 저장)
const tpl = { name: "", data: null, analysis: null, loading: null };
async function tplModule() {
  await loadScript("vendor/jszip.min.js", "JSZip");
  return import("./template.js");
}
async function loadTpl() {
  try {
    const T = await tplModule();
    const saved = await T.loadTemplate();
    if (!saved) return;
    tpl.name = saved.name; tpl.data = saved.data;
    tpl.analysis = await T.analyzeTemplate(saved.data);
    tpl.scriptureInfo = (i) => T.scriptureSectionInfo(tpl.analysis, i);
    render();
  } catch (e) { console.warn(e); }
}
const hasFixed = () => state.service.items.some((it) => it.kind === "fixed");

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { save(KEY.service, state.service); save(KEY.library, state.library); save(KEY.design, state.design); }, 300);
}

// ------------------------------------------------------------------ 공통 UI
function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}
function busy(msg) {
  const b = $("#busy");
  if (msg) { $("#busyMsg").textContent = msg; b.classList.add("show"); } else b.classList.remove("show");
}
function pickFiles(accept, multiple = false, capture = false) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept; inp.multiple = multiple;
    if (capture) inp.setAttribute("capture", "environment");
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}
async function shareOrDownload(blob, filename, mime) {
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const webSearch = (q) => window.open("https://www.google.com/search?q=" + encodeURIComponent(q), "_blank");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function makePpt(items, name) {
  if (tpl.data && items.some((it) => it.kind === "fixed" || it.kind === "song") && hasFixed()) {
    busy("우리 교회 틀로 PPT 만드는 중... (영상이 있어 조금 걸립니다)");
    try {
      const T = await tplModule();
      const blob = await T.buildFromTemplate(tpl.data, items, { linesPerSlide: state.design.linesPerSlide });
      busy();
      toast("우리 교회 틀로 완성!");
      await shareOrDownload(blob, `${today()}_${L.safeFilename(name)}.pptx`,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    } catch (e) { busy(); alert("PPT를 만들지 못했습니다.\n" + (e.message || e)); }
    return;
  }
  const slides = S.serviceSlides(items, state.design);
  if (!slides.length) { toast("만들 슬라이드가 없습니다."); return; }
  busy("PPT 만드는 중...");
  try {
    const blob = await buildPptx(slides, state.design);
    busy();
    const sections = new Set(slides.map((s) => s.sectionId)).size;
    toast(`슬라이드 ${slides.length}장 · 구역 ${sections}개 완성!`);
    await shareOrDownload(blob, `${today()}_${L.safeFilename(name)}.pptx`,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  } catch (e) {
    busy();
    alert("PPT를 만들지 못했습니다.\n" + (e.message || e));
  }
}

// ------------------------------------------------------------------ 탭
function render() {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  const main = $("#main");
  ({ order: renderOrder, library: renderLibrary, design: renderDesign, help: renderHelp })[state.tab](main);
}

// ---- 예배 순서
function renderOrder(main) {
  const items = state.service.items;
  main.innerHTML = `
    ${tpl.data ? `<div class="tplBox"><b>⛪ 우리 교회 PPT 틀</b> · ${esc(tpl.name)}<br><small>${hasFixed()
      ? "📌 항목은 원래 슬라이드 그대로 (눌러서 이번 주 글자만 고치기) · 🎵 찬양만 바꾸면 됩니다"
      : "예배 순서가 틀과 연결되어 있지 않습니다."}</small>
      ${hasFixed() ? "" : `<button class="wide primary" id="tplReset">틀 순서로 예배 순서 만들기</button>`}</div>` : ""}
    <label class="field"><span>예배 이름</span><input id="svcName" value="${esc(state.service.name)}"></label>
    <div class="list">${items.map((it, i) => `
      <div class="card ${it.kind === "fixed" ? "fixed" : ""}" data-id="${it.id}">
        <button class="cardMain" data-act="edit">${S.ITEM_ICONS[it.kind]} <b>${esc(S.ITEM_LABELS[it.kind])}</b> · ${esc(S.itemName(it))}
          <small>${esc(itemInfo(it))}</small></button>
        <div class="cardBtns">
          <button data-act="up" ${i === 0 ? "disabled" : ""}>▲</button>
          <button data-act="down" ${i === items.length - 1 ? "disabled" : ""}>▼</button>
          <button data-act="del">✕</button>
        </div>
      </div>`).join("") || `<p class="empty">아래 버튼으로 예배 순서를 추가하세요.</p>`}
    </div>
    <div class="addRow">
      <button class="primary" data-add="song">+ 찬양</button>
      <button data-add="scripture">+ 성경</button>
      <button data-add="sermon">+ 설교</button>
      <button data-add="text">+ 광고</button>
      <button data-add="cover">+ 순서</button>
    </div>
    <button class="wide primary" id="aiBulk">🤖 이번 주 찬양 한 번에 채우기 (제목 + 찬양팀)</button>
    <button class="big go" id="makeChurch">⛪ 목민 청년부 PPT 만들기</button>
    <button class="wide" id="makeAll">다른 디자인으로 PPT 만들기</button>
    <p class="hint">Verse / Chorus / Bridge 가 PowerPoint <b>구역(섹션)</b>으로 나뉘어 만들어집니다.</p>`;
  $("#svcName").oninput = (e) => { state.service.name = e.target.value; persist(); };
  if ($("#tplReset")) $("#tplReset").onclick = resetServiceFromTpl;
  $("#aiBulk").onclick = aiBulk;
  $("#makeChurch").onclick = makeChurchPpt;
  main.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => addItem(b.dataset.add)));
  main.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => cardAction(id, b.dataset.act)));
  });
  $("#makeAll").onclick = () => {
    const empty = items.filter((it) => it.kind === "song" && !S.itemToSong(it).sections.length).map((it) => it.data.title || "(제목 없음)");
    if (empty.length && !confirm(`가사가 비어 있는 찬양이 있습니다:\n· ${empty.join("\n· ")}\n\n그래도 만들까요?`)) return;
    makePpt(items, state.service.name);
  };
}

function itemInfo(it) {
  if (it.kind === "fixed") {
    if (it.data.skip) return "이번 주 빼기";
    if (it.data.scripture && it.data.scripture.verses) {
      const sc = it.data.scripture, n = Math.ceil(sc.verses.length / (sc.perSlide || 3));
      return `📖 ${sc.label} (${sc.translation}) · ${sc.perSlide || 3}절씩 약 ${n}장`;
    }
    const sec = tpl.analysis && tpl.analysis.sections[it.data.sectionIndex];
    const n = sec ? sec.ids.length : 0;
    const changed = Object.values(it.data.edits || {}).some((e) => Object.keys(e).length);
    return n ? `원래 슬라이드 ${n}장 그대로${changed ? " · ✏️ 글자 고침" : ""}` : "구역 이름만 (슬라이드 없음)";
  }
  if (it.kind !== "song") return "";
  const song = S.itemToSong(it);
  if (!song.sections.length) return "가사 없음";
  const n = S.itemSlides(it, state.design).filter((s) => s.kind !== "blank").length;
  return song.sections.some((s) => s.label) ? `${song.sections.map((s) => s.label).join(" · ")} · ${n}장` : `쭉 이어지는 가사 · ${n}장`;
}

function addItem(kind, data) {
  const d = data || { ...S.defaultData(kind) };
  if (kind === "cover" && !data) d.date = nextSunday();
  const it = { id: uid(), kind, data: d };
  const at = state.service.items.findIndex((x) => x.id === state.lastTouched);
  if (at >= 0 && hasFixed()) { state.service.items.splice(at + 1, 0, it); toast("마지막으로 고친 항목 바로 뒤에 넣었어요. ▲▼ 로 옮길 수 있어요."); }
  else state.service.items.push(it);
  persist();
  openEditor(it.id);
}

function cardAction(id, act) {
  const items = state.service.items;
  const i = items.findIndex((x) => x.id === id);
  if (act === "edit") return openEditor(id);
  if (act === "up" && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
  if (act === "down" && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
  if (act === "del" && confirm(`'${S.itemName(items[i])}' 을(를) 순서에서 뺄까요?`)) items.splice(i, 1);
  persist();
  render();
}

// ---- 보관함
function renderLibrary(main) {
  const q = (state.libQuery || "").replace(/\s/g, "").toLowerCase();
  const titles = Object.keys(state.library).sort((a, b) => a.localeCompare(b, "ko")).filter((t) => !q || t.replace(/\s/g, "").toLowerCase().includes(q));
  main.innerHTML = `
    <div class="row2">
      <button class="primary" id="impTxt">📂 txt·zip 가져오기</button>
      <button class="primary" id="impPpt">📊 기존 PPT에서 가져오기</button>
    </div>
    <button class="wide" id="expNew">🆕 새로 추가한 곡만 txt(zip) 로 받기 (${load("cppt.newSongs", []).filter((t) => state.library[t]).length}곡)</button>
    <button class="wide" id="expAll">💾 보관함 전체 백업 (zip) — 다른 폰에서 [가져오기]</button>
    <p class="hint"><b>기존 PPT</b>: 구역 이름이 "곡 제목(v1)", "곡 제목(c)" 처럼 나뉜 PPT 에서 곡별 가사를 꺼내 옵니다 (슬라이드 나눔 그대로).<br>
      <b>txt</b>: 윈도우 프로그램이나 메모장으로 만든 가사 파일을 여러 개 한꺼번에 고를 수 있어요.
      [Verse 1] 처럼 나뉘어 있으면 그대로, 구분이 없으면 반복되는 부분을 Chorus 로 자동으로 나눕니다.</p>
    <input id="libSearch" class="search" placeholder="🔎 제목 검색" value="${esc(state.libQuery || "")}">
    <div class="list">${titles.map((t) => {
      const song = L.parseSongText(state.library[t]);
      const parts = song.sections.some((s) => s.label) ? song.sections.map((s) => L.labelAbbrev(s.label)).join(" ") : "구분 없음";
      return `<div class="card" data-t="${esc(t)}">
        <button class="cardMain" data-act="add">🎵 <b>${esc(t)}</b><small>${esc(parts)}</small></button>
        <div class="cardBtns"><button data-act="add" class="primary">추가</button><button data-act="txt">txt</button><button data-act="del">✕</button></div>
      </div>`;
    }).join("") || `<p class="empty">보관함이 비어 있습니다.</p>`}</div>`;
  $("#impTxt").onclick = importTxt;
  $("#impPpt").onclick = importPpt;
  $("#expAll").onclick = exportAll;
  $("#expNew").onclick = exportNewSongs;
  $("#libSearch").oninput = (e) => { state.libQuery = e.target.value; renderLibrary(main); const s = $("#libSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); };
  main.querySelectorAll(".card").forEach((card) => {
    const t = card.dataset.t;
    card.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => {
      if (b.dataset.act === "add") {
        const song = L.parseSongText(state.library[t]);
        addItem("song", songData(song, t));
        toast(`'${t}' 을(를) 예배 순서에 추가했습니다.`);
      } else if (b.dataset.act === "txt") {
        shareOrDownload(L.txtBlob(state.library[t]), `${L.safeFilename(t)}.txt`, "text/plain");
      } else if (confirm(`'${t}' 을(를) 보관함에서 지울까요?`)) { delete state.library[t]; persist(); render(); }
    }));
  });
}

const songData = (song, fallback = "") => ({
  title: song.title || fallback, artist: song.artist || "", key: song.key || "",
  order: L.formatOrder(song.order), body: L.sectionsToBody(song.sections),
});

async function importTxt() {
  const files = await pickFiles(".txt,.zip,text/plain,application/zip", true);
  if (!files.length) return;
  busy("가사 파일을 읽는 중...");
  const entries = [];   // [이름, 글자]
  try {
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        await loadScript("vendor/jszip.min.js", "JSZip");
        const zip = await globalThis.JSZip.loadAsync(await f.arrayBuffer());
        for (const z of Object.values(zip.files)) {
          if (z.dir || !/\.txt$/i.test(z.name) || /(^|\/)(__MACOSX|\.)/.test(z.name)) continue;
          const buf = await z.async("arraybuffer");
          entries.push([z.name.split("/").pop(), await L.readTextFile(new Blob([buf]))]);
        }
      } else entries.push([f.name, await L.readTextFile(f)]);
    }
  } catch (e) { busy(); return alert("파일을 읽지 못했습니다.\n" + (e.message || e)); }
  let n = 0, upd = 0;
  for (const [name, text] of entries) {
    const song = L.songFromAnyTxt(text, name.replace(/\.txt$/i, "").replace(/_+$/, "").trim());
    if (!song.sections.length || !song.title) continue;
    const old = findInLibrary(song.title);
    if (old) { delete state.library[old.title]; upd++; }
    state.library[song.title] = L.songToText(song);
    n++;
  }
  busy();
  persist();
  render();
  toast(`${n}곡을 보관함에 넣었습니다.${upd ? ` (${upd}곡은 새 가사로 바꿈)` : ""}`, 5000);
}

function loadScript(src, globalName) {
  if (globalThis[globalName]) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res;
    s.onerror = () => rej(new Error("구성 요소를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요."));
    document.head.appendChild(s);
  });
}

async function importPpt() {
  const [f] = await pickFiles(".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation");
  if (!f) return;
  busy("PPT 에서 가사를 찾는 중...");
  try {
    await loadScript("vendor/jszip.min.js", "JSZip");
    const { songsFromPptx } = await import("./pptimport.js");
    const { songs, skipped } = await songsFromPptx(await f.arrayBuffer());
    busy();
    if (!songs.length) return alert("가사로 보이는 구역을 찾지 못했습니다.\n구역 이름을 '곡 제목(v1)', '곡 제목(c)' 처럼 나눈 PPT 를 넣어 주세요.");
    for (const song of songs) state.library[song.title] = L.songToText(song);
    persist();
    const list = songs.map((s) => `· ${s.title}  (${s.sections.map((x) => x.label ? L.labelAbbrev(x.label) : "구분없음").join(" ")})`).join("\n");
    const addToo = confirm(`${songs.length}곡을 보관함에 넣었습니다.\n\n${list}\n\n` +
      (skipped.length ? `가사가 아니라서 건너뛴 구역: ${skipped.join(", ")}\n\n` : "") +
      "예배 순서에도 이 곡들을 PPT 순서대로 추가할까요?");
    if (addToo) for (const song of songs) state.service.items.push({ id: uid(), kind: "song", data: songData(song) });
    persist();
    render();
  } catch (e) { busy(); alert(e.message || String(e)); }
}

async function exportAll() {
  const titles = Object.keys(state.library);
  if (!titles.length) return toast("보관함이 비어 있습니다.");
  busy("보관함을 묶는 중...");
  await loadScript("vendor/jszip.min.js", "JSZip");
  const zip = new globalThis.JSZip();
  for (const t of titles) zip.file(`${L.safeFilename(t)}.txt`, L.txtBlob(state.library[t]));
  const blob = await zip.generateAsync({ type: "blob" });
  busy();
  await shareOrDownload(blob, `가사보관함_${today()}.zip`, "application/zip");
}

// ---- 디자인
const DESIGN_FIELDS = [
  ["배경", [["bgColor", "배경색", "color"], ["bgImage", "배경 사진", "image"], ["bgDim", "사진 어둡게 %", "range", 0, 90], ["ratio", "화면 비율", "select", [["16:9", "16:9 와이드"], ["4:3", "4:3"]]]]],
  ["가사 글자", [["lyrics.size", "크기", "number", 12, 120], ["lyrics.color", "색", "color"], ["lyrics.bold", "굵게", "check"],
    ["lyrics.outline", "외곽선", "check"], ["lyrics.outlineColor", "외곽선 색", "color"], ["lyrics.shadow", "그림자", "check"], ["lyrics.glow", "은은한 빛(글로우)", "check"],
    ["lyrics.font", "글꼴 (PC에 있는 이름)", "text"],
    ["lyricsAlign", "가로 정렬", "select", [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]]],
    ["lyricsAnchor", "세로 위치", "select", [["top", "위"], ["middle", "가운데"], ["bottom", "아래 (방송 하단 자막)"]]],
    ["lineSpacing", "줄 간격", "number", 0.8, 3, 0.05], ["marginPct", "여백 %", "number", 0, 30]]],
  ["슬라이드 구성", [["linesPerSlide", "가사 한 장에 최대 줄", "number", 1, 10], ["versesPerSlide", "성경 한 장에 최대 절", "number", 1, 10],
    ["sectionMode", "PPT 구역 나누기", "select", [["part", "파트마다 (Verse/Chorus/Bridge)"], ["song", "곡마다"]]],
    ["sectionNaming", "구역 이름", "select", [["long", "곡 - Verse 1"], ["short", "곡(v1) · 곡(c) · 곡(b)"]]],
    ["partTitleSlide", "파트마다 곡 제목 슬라이드로 시작", "check"],
    ["footerText", "모든 장 아래 문구 (예: 2026 Connection 목청)", "text"],
    ["cardImage", "순서 카드 배경 (대표기도·봉독·설교·축도)", "image"],
    ["showLabel", "구석에 파트 이름 표시", "check"], ["showSongTitle", "곡 첫 장에 제목 작게", "check"],
    ["songTitleSlide", "곡마다 제목 슬라이드", "check"], ["blankAfterSong", "곡 끝에 빈 슬라이드", "check"], ["autoShrink", "넘치면 글자 줄이기", "check"]]],
  ["제목·본문 글자", [["titleStyle.size", "표지 제목 크기", "number", 12, 140], ["titleStyle.color", "표지 제목 색", "color"],
    ["headingStyle.size", "성경·설교 제목줄 크기", "number", 12, 120], ["headingStyle.color", "제목줄 색", "color"],
    ["bodyStyle.size", "본문 크기", "number", 12, 120], ["bodyStyle.color", "본문 색", "color"],
    ["contentAlign", "광고·설교 본문 정렬", "select", [["left", "왼쪽"], ["center", "가운데"]]],
    ["scriptureAlign", "성경 본문 정렬", "select", [["", "위와 같게"], ["left", "왼쪽"], ["center", "가운데"]]]]],
];
const getPath = (o, p) => (p === "marginPct" ? Math.round(o.margin * 100) : p.split(".").reduce((a, k) => a[k], o));
function setPath(o, p, v) {
  if (p === "marginPct") { o.margin = v / 100; return; }
  const ks = p.split(".");
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}

const SAMPLES = [
  { kind: "lyrics", heading: "", label: "Verse 1", lines: ["샘플 가사 첫 번째 줄입니다", "두 번째 줄 가사가 여기에"] },
  { kind: "cover", heading: "주일 예배", subtitle: "2026년 11월 29일", lines: [] },
  { kind: "content", heading: "요한복음 3:16 (개역개정)", hint: "scripture", lines: ["16 성경 본문이 이 자리에 표시됩니다."] },
];

function renderDesign(main) {
  const d = state.design;
  main.innerHTML = `
    <div class="tplBox">
      <h3>⛪ 우리 교회 PPT 틀</h3>
      ${tpl.data ? `<p>✅ <b>${esc(tpl.name)}</b><br><small>구역 ${tpl.analysis ? tpl.analysis.sections.length : "?"}개 · 찬양이 아닌 부분(예배 시작, 사도신경, 기도·봉독·설교 카드, 말씀, 봉헌, 축도, 광고, 마침)은 원래 슬라이드 그대로 쓰고 찬양만 바꿉니다.</small></p>`
        : `<p><small>교회에서 쓰는 PPT 파일을 한 번 넣어 두면, 그 파일을 그대로 틀로 써서 매주 찬양만 바꿔 만듭니다. (파일은 이 휴대폰 안에만 저장됩니다)</small></p>`}
      <div class="row2"><button class="primary" id="tplPick">${tpl.data ? "다른 틀로 바꾸기" : "교회 PPT 틀 넣기"}</button>
        <button id="tplClear" ${tpl.data ? "" : "disabled"}>틀 지우기</button></div>
      <button class="wide" id="fontDl">🔤 글꼴(나눔스퀘어 네오) 설치 파일 받기</button>
      <p class="hint">PPT 를 띄우는 컴퓨터에 '나눔스퀘어 네오' 가 없으면 다른 글꼴로 보입니다. 위 버튼으로 받은 파일을 그 컴퓨터에서 열어 [설치] 하세요.</p>
    </div>
    <p class="hint">아래 디자인은 틀 없이 새로 만들 때와 미리보기에 쓰입니다.</p>
    <label class="field"><span>기본 디자인 고르기</span><select id="preset"><option value="">(지금: ${esc(d.name || "직접 설정")})</option>${Object.keys(S.PRESETS).map((n) => `<option>${esc(n)}</option>`).join("")}</select></label>
    <div id="pv" class="pv"></div>
    ${DESIGN_FIELDS.map(([title, fields]) => `<details ${title === "배경" || title === "가사 글자" ? "open" : ""}><summary>${title}</summary>${fields.map(([p, label, type, a, b, step]) => {
      const v = getPath(d, p);
      if (type === "check") return `<label class="chk"><input type="checkbox" data-p="${p}" ${v ? "checked" : ""}> ${label}</label>`;
      if (type === "select") return `<label class="field"><span>${label}</span><select data-p="${p}">${a.map(([val, t]) => `<option value="${val}" ${val === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
      if (type === "image") return `<div class="field"><span>${label}${v ? " ✅" : ""}</span><div class="row2"><button data-img="${p}">사진 선택</button><button data-imgclear="${p}" ${v ? "" : "disabled"}>지우기</button></div></div>`;
      if (type === "range") return `<label class="field"><span>${label}: <b id="dimV">${v}</b></span><input type="range" min="${a}" max="${b}" data-p="${p}" value="${v}"></label>`;
      return `<label class="field"><span>${label}</span><input type="${type}" data-p="${p}" value="${esc(v)}" ${a != null ? `min="${a}" max="${b}"` : ""} ${step ? `step="${step}"` : ""}></label>`;
    }).join("")}</details>`).join("")}
    <p class="hint">"Connection 목청" 은 보내주신 PPT 를 그대로 옮긴 디자인입니다 (글꼴 NanumSquare Neo, 아래 문구, 파트 제목 슬라이드, 십자가 순서 카드).
      글꼴은 PPT 를 여는 컴퓨터에 설치되어 있어야 그대로 보입니다.</p>`;
  const drawPv = () => {
    const pv = $("#pv");
    pv.innerHTML = "";
    const samples = [...SAMPLES, { kind: "cover", heading: "대표 기도", subtitle: "OOO 청년", lines: [], card: true }];
    for (const s of samples) pv.appendChild(thumb({ ...s, heading: s.kind === "lyrics" && d.showSongTitle ? "곡 제목" : s.heading }, d, 150, drawPv));
  };
  drawPv();
  $("#tplPick").onclick = pickTemplate;
  $("#tplClear").onclick = async () => {
    if (!confirm("교회 PPT 틀을 지울까요? (예배 순서의 📌 항목도 함께 빠집니다)")) return;
    (await tplModule()).clearTemplate();
    Object.assign(tpl, { name: "", data: null, analysis: null });
    state.service.items = state.service.items.filter((it) => it.kind !== "fixed");
    persist(); render();
  };
  $("#fontDl").onclick = async () => {
    for (const f of ["NanumSquareNeo-bRg.ttf", "NanumSquareNeo-cBd.ttf"]) {
      const blob = await (await fetch("fonts/" + f)).blob();
      await shareOrDownload(blob, f, "font/ttf");
    }
  };
  $("#preset").onchange = async (e) => {
    if (!e.target.value) return;
    const nd = S.normalizeDesign(S.presetDesign(e.target.value));
    if (nd.cardImageUrl) {
      try { nd.cardImage = await urlToDataUrl(nd.cardImageUrl); } catch { toast("카드 배경 사진을 불러오지 못했습니다."); }
      delete nd.cardImageUrl;
    } else nd.bgImage = d.bgImage;
    state.design = nd;
    persist(); render();
  };
  main.querySelectorAll("[data-p]").forEach((inp) => {
    inp.oninput = inp.onchange = () => {
      let v = inp.type === "checkbox" ? inp.checked : inp.value;
      if (inp.type === "number" || inp.type === "range") v = parseFloat(v) || 0;
      setPath(d, inp.dataset.p, v);
      if (inp.dataset.p === "bgDim") $("#dimV").textContent = v;
      persist(); drawPv();
    };
  });
  main.querySelectorAll("[data-img]").forEach((b) => (b.onclick = async () => {
    const [f] = await pickFiles("image/*");
    if (!f) return;
    d[b.dataset.img] = await shrinkImage(f, 1920, 0.85);
    persist(); render();
  }));
  main.querySelectorAll("[data-imgclear]").forEach((b) => (b.onclick = () => { d[b.dataset.imgclear] = ""; persist(); render(); }));
}

async function urlToDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

async function shrinkImage(file, maxW, q) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const s = Math.min(1, maxW / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", q);
}

// ---- 도움말
function renderHelp(main) {
  setTimeout(() => { const b = $("#aiSetup"); if (b) b.onclick = () => aiKeyDialog(); }, 0);
  main.innerHTML = `<div class="help">
    <h3>⛪ 우리 교회 PPT 틀로 만들기 (추천)</h3>
    <p>1. [디자인] → <b>[교회 PPT 틀 넣기]</b> 에서 교회 PPT 파일을 한 번 고릅니다. (휴대폰 안에만 저장)<br>
    2. [예배 순서] 가 교회 PPT 순서 그대로 채워집니다.<br>
    &nbsp;&nbsp;· 📌 항목(예배가 곧 시작됩니다, 사도신경, 대표기도·봉독·설교 카드, 말씀, 봉헌, 축도, 광고, 마침)은 <b>원래 슬라이드 그대로</b> — 눌러서 이번 주 이름·설교 제목·광고 글자만 고치세요.<br>
    &nbsp;&nbsp;· 🎵 찬양을 눌러 <b>[📚 보관함에서 고르기]</b> 로 이번 주 곡으로 바꾸세요.<br>
    3. [▶ 예배 전체 PPT 만들기] — 구역(섹션)도 교회 PPT 처럼 <code>곡(v1)</code> <code>곡(c)</code> 로 나뉩니다.</p>
    <h3>🤖 무료 AI 로 가사 자동 채우기</h3>
    <p>찬양 제목과 찬양팀만 넣으면 AI(Google Gemini, 무료)가 인터넷에서 가사를 찾아 Verse/Chorus 로 나눠 줍니다.
    처음 한 번 무료 키가 필요합니다 (Google 계정으로 1분, 카드 등록 없음). 하루 무료 사용량 안에서 무료입니다.<br>
    <button class="wide primary" id="aiSetup">🔑 무료 AI 키 설정하기 ${getAiKey() ? "(설정됨 ✅)" : ""}</button>
    · AI 가 가끔 저작권 때문에 가사를 안 보여주거나 틀릴 수 있습니다. 그럴 땐 구글 검색 → 붙여넣기를 쓰세요.</p>
    <h3>📱 홈 화면에 앱으로 설치</h3>
    <p><b>안드로이드(크롬/삼성 인터넷)</b>: 메뉴 ⋮ → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b><br>
    <b>아이폰(사파리)</b>: 아래 공유 버튼 □↑ → <b>홈 화면에 추가</b></p>
    <h3>🎵 찬양 가사 넣기 (모두 무료)</h3>
    <p>1. [+ 찬양] → 제목 입력 → <b>[🔍 가사 검색]</b> (구글이 열려요)<br>
    2. 가사를 길게 눌러 복사 → 돌아와서 <b>[📋 붙여넣기 + 자동 나누기]</b><br>
    3. 반복되는 부분은 Chorus, 나머지는 Verse 로 나뉩니다. 반복이 없으면 쭉 이어지는 가사로 둡니다.<br>
    · <b>[🎼 악보 사진]</b>: 카메라로 찍으면 가사를 읽어요. 띄어쓰기·몇 글자는 꼭 고쳐 주세요.<br>
    · 가사 칸에서 <code>[Verse 1]</code> <code>[Chorus]</code> <code>[Bridge]</code> 로 직접 나눌 수도 있어요. 파트 안의 빈 줄 = 슬라이드 넘김.<br>
    · 순서 칸: <code>V1 C V2 C B C</code> 처럼 쓰면 그 순서로 반복됩니다.</p>
    <h3>💾 메모장 파일</h3>
    <p>[보관함] → <b>[메모장(txt) 가져오기]</b> 로 윈도우 프로그램/메모장 가사 파일을 여러 개 한 번에 넣을 수 있어요.</p>
    <h3>📄 PPT</h3>
    <p>[▶ PPT 만들기] 를 누르면 공유 창이 뜹니다. <b>파일에 저장</b>, 카카오톡으로 보내기, PowerPoint 앱으로 열기를 고르세요.
    휴대폰 PowerPoint 앱에서는 구역(섹션)이 안 보일 수 있지만 PC PowerPoint 에서는 보입니다.</p>
    <p class="hint">모든 데이터는 이 휴대폰 안에만 저장됩니다. 인터넷 없이도 동작합니다 (악보 사진 읽기는 처음 한 번 인터넷 필요).</p>
  </div>`;
}

// ------------------------------------------------------------------ 편집 화면
const FIELDS = {
  song: [["title", "찬양 제목", "예: 주 은혜임을"], ["artist", "찬양팀 / 아티스트", "예: 마커스, 어노인팅, 제이어스"]],
  scripture: [["reference", "본문 구절", "예: 요한복음 3:16-18"], ["translation", "번역본", "개역개정"]],
  sermon: [["title", "설교 제목", ""], ["preacher", "설교자", "예: 김OO 목사"], ["reference", "본문", "예: 요한복음 3:16"]],
  text: [["title", "제목", "예: 교회 소식, 사도신경"]],
  cover: [["title", "제목", "예: 대표 기도, 주일 2부 예배"], ["subtitle", "아래 줄 (이름·부제)", "예: OOO 청년, 이상원 목사"], ["date", "날짜 (선택)", ""]],
};
const BODY = {
  song: ["body", "가사", "가사를 쓰거나 붙여넣으세요.\n\n[Verse 1]\n첫 줄\n둘째 줄\n\n[Chorus]\n후렴..."],
  scripture: ["text", "본문 (한 줄에 한 절)", "16 하나님이 세상을 이처럼 사랑하사...\n17 ..."],
  sermon: ["body", "요점 (빈 줄로 슬라이드 나눔)", "1. 첫째 요점\n설명\n\n2. 둘째 요점"],
  text: ["body", "내용 (빈 줄로 슬라이드 나눔)", ""],
};

function openEditor(id) { state.editing = id; state.lastTouched = id; renderEditor(); $("#editor").classList.add("show"); }
function closeEditor() {
  const it = state.service.items.find((x) => x.id === state.editing);
  if (it && it.kind === "song") {   // 편집한 곡은 자동으로 보관함에 (다음 주에도 쓰도록)
    const song = S.itemToSong(it);
    if (song.title && song.sections.length) {
      const old = findInLibrary(song.title);
      const text = L.songToText(song);
      if (!old || state.library[old.title] !== text) { if (old) delete state.library[old.title]; state.library[song.title] = text; persist(); }
      // 가사 모음에 없던 새 곡이면 txt 파일로도 저장 (OneDrive 가사 폴더에 넣으면 다음 업데이트에 반영)
      if (!isBuiltinSong(song.title) && !load("cppt.newSongs", []).includes(song.title)) {
        markNewSong(song.title);
        if (confirm(`'${song.title}' 은(는) 가사 모음에 없던 새 곡입니다.\n보관함에는 저장했어요.\n\ntxt 파일로도 저장할까요? (가사 폴더에 넣어 두면 좋아요)`)) {
          shareOrDownload(L.txtBlob(text), `${L.safeFilename(song.title)}.txt`, "text/plain");
        }
      }
    }
  }
  state.editing = null; $("#editor").classList.remove("show"); render(); }

function renderEditor() {
  const it = state.service.items.find((x) => x.id === state.editing);
  if (!it) return closeEditor();
  const ed = $("#editor");
  if (it.kind === "fixed") return renderFixedEditor(it, ed);
  const [bk, blabel, bph] = BODY[it.kind] || [];
  ed.innerHTML = `
    <header><button id="edBack">← 완료</button><b>${S.ITEM_ICONS[it.kind]} ${S.ITEM_LABELS[it.kind]}</b><span></span></header>
    <div class="edBody">
      ${FIELDS[it.kind].map(([k, label, ph]) => k === "translation"
        ? `<label class="field"><span>${label}</span><select data-f="translation">${TRANS.map((t) => `<option ${t === (it.data.translation || load("cppt.translation", "개역개정")) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`
        : `<label class="field"><span>${label}</span><input data-f="${k}" value="${esc(it.data[k])}" placeholder="${esc(ph)}"></label>`).join("")}
      ${it.kind === "song" ? `
        <div class="grid3">
          <button class="primary" data-a="ai">🤖 AI 가사 자동 채우기</button>
          <button class="primary" data-a="lib">📚 보관함에서 고르기</button>
          <button class="primary" data-a="search">🔍 가사 검색</button>
          <button class="primary" data-a="paste">📋 붙여넣기+나누기</button>
          <button data-a="auto">⚡ 자동 나누기</button>
          <button data-a="sheet">🎼 악보 사진</button>
          <button data-a="open">📂 txt 열기</button>
          <button data-a="keep">💾 보관함 저장</button>
          <button data-a="txt">⬇ txt 파일</button>
          <button data-a="ppt">📄 이 곡만 PPT</button>
        </div>
        <label class="field"><span>순서(송폼) — 예: V1 C V2 C B C (비우면 적힌 순서대로)</span><input data-f="order" value="${esc(it.data.order)}"></label>` : ""}
      ${it.kind === "scripture" ? `<button class="wide primary" data-a="bibleAuto">📖 본문 자동으로 채우기</button>
        <div class="row2"><button data-a="bible">성서공회에서 열기</button><button data-a="biblePaste">📋 복사한 본문 넣기</button></div>
        <div class="row2">${getAiKey() ? `<button data-a="bibleAi">🤖 AI로 찾기</button>` : "<span></span>"}<label class="field" style="margin:0"><select data-f="perSlide">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${String(it.data.perSlide || 3) === String(n) ? "selected" : ""}>한 장에 ${n}절</option>`).join("")}</select></label></div>
        <p class="hint">구절만 넣고 [본문 자동으로 채우기] — 인터넷 없이도 됩니다. 또는 성서공회 페이지에서 복사해서 [복사한 본문 넣기].</p>` : ""}
      ${it.kind === "cover" ? `
        <p class="hint">빠른 입력 (순서 카드)</p>
        <div class="grid3">${["예배가 곧 시작됩니다.|기도로 예배를 준비 해주세요.|0", "대표 기도|", "성경 봉독|", "설교|", "봉헌|", "봉헌 기도|", "축   도|", "광   고|총무", "결단 찬양|"]
          .map((q) => `<button data-quick="${esc(q)}">${esc(q.split("|")[0].replace(/\s+/g, " "))}</button>`).join("")}</div>
        <label class="chk"><input type="checkbox" data-card ${it.data.card !== false ? "checked" : ""}> 순서 카드 배경 사용 ${state.design.cardImage ? "" : "(디자인에서 카드 배경을 정하면 적용)"}</label>
        <button class="wide" data-a="sunday">이번 주일 날짜 넣기</button>` : ""}
      ${bk ? `<label class="field"><span>${blabel}</span><textarea data-f="${bk}" rows="12" placeholder="${esc(bph)}">${esc(it.data[bk])}</textarea></label>` : ""}
      <p id="edInfo" class="info"></p>
      <div id="edPv" class="pv"></div>
    </div>`;
  $("#edBack").onclick = closeEditor;
  ed.querySelectorAll("[data-f]").forEach((inp) => (inp.oninput = () => { it.data[inp.dataset.f] = inp.value; persist(); schedulePv(it); }));
  const titleIn = ed.querySelector('[data-f="title"]');
  if (titleIn && it.kind === "song") {
    titleIn.setAttribute("autocomplete", "off");
    // 제목만 입력해도 보관함(txt) 가사를 찾아 넣기
    const fillFromLibrary = (v) => {
      const mine = findInLibrary(v);
      if (!mine) return false;
      const cur = (it.data.body || "").trim();
      if (cur && L.songToText(S.itemToSong(it)) !== L.songToText({ ...mine, title: it.data.title }) && !confirm(`보관함의 '${mine.title}' 가사로 바꿀까요?`)) return true;
      applySong(it, mine, false);
      toast(`📚 보관함의 '${mine.title}' 가사를 넣었습니다.`);
      return true;
    };
    attachTeamAutocomplete(titleIn, (v) => { it.data.title = v; persist(); fillFromLibrary(v); }, titleSuggestions, true);
    titleIn.addEventListener("change", () => { if (!(it.data.body || "").trim()) fillFromLibrary(titleIn.value); });
  }
  const team = ed.querySelector('[data-f="artist"]');
  if (team) { team.setAttribute("autocomplete", "off"); attachTeamAutocomplete(team, (v) => { it.data.artist = v; persist(); }); }
  ed.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => editorAction(it, b.dataset.a)));
  ed.querySelectorAll("[data-quick]").forEach((b) => (b.onclick = () => {
    const [title, sub, card] = b.dataset.quick.split("|");
    it.data.title = title; it.data.subtitle = sub || ""; it.data.date = ""; it.data.card = card !== "0";
    persist(); renderEditor();
  }));
  const cardBox = ed.querySelector("[data-card]");
  if (cardBox) cardBox.onchange = () => { it.data.card = cardBox.checked; persist(); drawEditorPreview(it); };
  drawEditorPreview(it);
}

let pvTimer = null;
function schedulePv(it) { clearTimeout(pvTimer); pvTimer = setTimeout(() => drawEditorPreview(it), 350); }

function drawEditorPreview(it) {
  const slides = S.itemSlides(it, state.design);
  const pv = $("#edPv");
  if (!pv) return;
  pv.innerHTML = "";
  slides.slice(0, 60).forEach((s, i) => {
    const wrap = document.createElement("figure");
    wrap.appendChild(thumb(s, state.design, 150, () => drawEditorPreview(it)));
    const cap = document.createElement("figcaption");
    cap.textContent = `${i + 1}. ${s.label || { lyrics: "가사", cover: "제목", content: "내용", blank: "빈 화면" }[s.kind]}`;
    wrap.appendChild(cap);
    pv.appendChild(wrap);
  });
  const info = $("#edInfo");
  if (it.kind === "song") {
    const song = S.itemToSong(it);
    const { missing } = L.resolveOrder(song);
    const n = slides.filter((s) => s.kind !== "blank").length;
    info.textContent = !song.sections.length ? "" :
      (song.sections.some((s) => s.label) ? `파트 ${song.sections.length}개: ${song.sections.map((s) => s.label || "(구분없음)").join(", ")} · 슬라이드 ${n}장` : `쭉 이어지는 가사 · 슬라이드 ${n}장`) +
      (missing.length ? `\n⚠ 순서에 있지만 가사에 없는 파트: ${missing.join(", ")}` : "");
  } else info.textContent = `슬라이드 ${slides.length}장`;
}

function applySong(it, song, keepTitle = false) {
  const d = { ...songData(song, it.data.title), tplLead: it.data.tplLead, tplClosing: it.data.tplClosing };
  if (keepTitle && it.data.title) d.title = it.data.title;
  if (!d.artist) d.artist = it.data.artist;
  it.data = d;
  persist();
  renderEditor();
}

function keepInLibrary(it, quiet = false) {
  const song = S.itemToSong(it);
  if (!song.title) { if (!quiet) toast("찬양 제목을 먼저 입력해 주세요."); return; }
  if (!song.sections.length) { if (!quiet) toast("가사가 비어 있습니다."); return; }
  state.library[song.title] = L.songToText(song);
  persist();
  toast(`보관함에 저장했습니다: ${song.title}`);
}

const confirmReplace = (it) => !(it.data.body || "").trim() || confirm("지금 가사를 새 가사로 바꿀까요?");

async function autoSplit(it, raw) {
  const clean = L.cleanPastedLyrics(raw);
  const song = S.itemToSong(it);
  if (getAiKey()) {   // AI 가 곡 구조를 보고 Verse/Chorus/Bridge 를 정함
    busy("AI 가 Verse / Chorus / Bridge 를 나누는 중...");
    try {
      const G = await import("./gemini.js");
      const s = await G.splitLyrics(clean, it.data.title.trim());
      busy();
      song.sections = s.sections; song.order = s.order;
      applySong(it, song, true);
      toast("AI 가 파트를 나눴습니다. 틀린 곳은 직접 고쳐 주세요.", 4500);
      return;
    } catch (e) { busy(); toast(`AI 나누기 실패 (${e.message}) — 간단한 규칙으로 나눴습니다.`, 5000); }
  }
  const { sections, order } = L.autoStructure(clean);
  song.sections = sections;
  song.order = order.length ? order : song.order;
  applySong(it, song, true);
  if (!getAiKey()) toast("간단한 규칙으로 나눴습니다. [도움말]에서 무료 AI 키를 넣으면 AI 가 곡 구조에 맞게 나눠 줍니다.", 6000);
}

async function editorAction(it, a) {
  const d = it.data;
  if (a === "lib") return pickFromLibrary(it);
  if (a === "ai") return aiFill(it);
  if (a === "bibleAuto") {
    const tr = (d.translation || "").trim() || load("cppt.translation", "개역개정");
    const r = await autoScripture(d.reference, tr);
    if (!r) return;
    d.reference = B.refLabel(r.ref.book, r.verses).replace(/(\d+)장 /, "$1:").replace(/절$/, "").replace(/ - (\d+)장 /, "-$1:");
    d.translation = r.translation;
    d.text = r.verses.map((v) => `${B.verseNo(v)} ${v.text}`).join("\n");
    persist(); renderEditor();
    return toast(`${r.verses.length}절을 넣었습니다. (${r.translation})`);
  }
  if (a === "bibleAi") {
    const ref = (d.reference || "").trim();
    if (!ref) return toast("본문 구절을 입력해 주세요. (예: 사도행전 6:1-7)");
    if (!getAiKey()) return aiKeyDialog(() => editorAction(it, "bibleAi"));
    const tr = (d.translation || "").trim() || load("cppt.translation", "개역개정");
    busy(`${ref} (${tr}) 본문을 찾는 중...`);
    try {
      const G = await import("./gemini.js");
      const r = await G.fetchScripture(ref, tr);
      busy();
      const label = G.scriptureLabel(r.book, r.verses).replace(/(\d+)장 /, "$1:").replace(/절$/, "").replace(/ - (\d+)장 /, "-$1:");
      d.reference = label; d.translation = tr;
      d.text = r.verses.map((v) => `${B.verseNo(v)} ${v.text}`).join("\n");
      persist(); renderEditor();
      return toast(`${r.verses.length}절을 넣었습니다. 한 번 확인해 주세요.`);
    } catch (e) { busy(); if (e.kind === "key") return aiKeyDialog(); if (confirm(`${e.message}\n\n구글에서 본문을 검색할까요?`)) webSearch(`${ref} ${tr}`); return; }
  }
  if (a === "search") {
    if (!d.title.trim()) return toast("먼저 찬양 제목을 입력해 주세요.");
    webSearch(`${d.title} ${d.artist || ""} 가사`);
    toast("가사를 길게 눌러 복사한 뒤, 돌아와서 [붙여넣기 + 자동 나누기] 를 누르세요.", 6000);
  } else if (a === "paste") {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { /* 권한 없음 */ }
    if (!text.trim()) return toast("복사된 글자를 읽지 못했어요. 가사 칸을 길게 눌러 붙여넣은 뒤 [자동 나누기] 를 누르세요.", 6000);
    if (!confirmReplace(it)) return;
    await autoSplit(it, text);
    if (d.title.trim()) keepInLibrary(it, true);
  } else if (a === "auto") {
    if (!(d.body || "").trim()) return toast("가사 칸에 가사를 먼저 넣어 주세요.");
    await autoSplit(it, d.body);
  } else if (a === "sheet") {
    const files = await pickFiles("image/*", true);
    if (!files.length || !confirmReplace(it)) return;
    try {
      await ensureTesseract();
      const { readSheetMusic } = await import("./ocr.js");
      busy("악보 읽는 중...");
      const song = await readSheetMusic(files, d.title.trim(), (m) => busy(m));
      busy();
      applySong(it, song, !!d.title.trim());
      alert("악보에서 가사를 읽었습니다.\n\n⚠ 무료 글자 인식이라 띄어쓰기가 없고 몇 글자는 틀릴 수 있어요. 꼭 확인하고 고쳐 주세요.");
    } catch (e) { busy(); alert(e.message || String(e)); }
  } else if (a === "open") {
    const [f] = await pickFiles(".txt,text/plain");
    if (!f || !confirmReplace(it)) return;
    applySong(it, L.songFromTxt(await L.readTextFile(f), f.name.replace(/\.txt$/i, "")));
  } else if (a === "keep") keepInLibrary(it);
  else if (a === "txt") {
    const song = S.itemToSong(it);
    if (!song.title) return toast("찬양 제목을 먼저 입력해 주세요.");
    shareOrDownload(L.txtBlob(L.songToText(song)), `${L.safeFilename(song.title)}.txt`, "text/plain");
  } else if (a === "ppt") makePpt([it], d.title || "찬양");
  else if (a === "bible") {
    if (!d.reference.trim()) return toast("본문 구절을 입력해 주세요. (예: 요한복음 3:16-18)");
    openBible(d.reference, (d.translation || "").trim() || load("cppt.translation", "개역개정"));
  } else if (a === "biblePaste") {
    const ref = B.parseRef(d.reference);
    if (!ref) return toast("본문 구절을 먼저 바르게 입력해 주세요. (예: 요 3:16-18, 사도행전 6장 1-7절)", 5000);
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { /* 권한 없음 */ }
    if (!text.trim()) text = d.text || "";
    const vs = versesFromPaste(text, ref, (d.translation || "").trim() || load("cppt.translation", "개역개정"));
    if (!vs.length) return toast("복사한 글에서 절을 찾지 못했어요. 본문 칸에 길게 눌러 붙여넣은 뒤 다시 눌러 주세요.", 6000);
    d.text = vs.map((v) => `${v.v} ${v.text}`).join("\n");
    persist(); renderEditor();
    toast(`${B.refLabel(ref.book, vs)} · ${vs.length}절을 넣었습니다.${missingNote(ref, vs)}`, 6000);
  } else if (a === "sunday") { d.date = nextSunday(); persist(); renderEditor(); }
}

let tessLoading = null;
function ensureTesseract() {
  if (globalThis.Tesseract) return Promise.resolve();
  if (!tessLoading) tessLoading = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "vendor/tesseract.min.js";
    s.onload = res;
    s.onerror = () => { tessLoading = null; rej(new Error("글자 인식 기능을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.")); };
    document.head.appendChild(s);
  });
  return tessLoading;
}

// ------------------------------------------------------------------ 우리 교회 틀
async function pickTemplate() {
  const [f] = await pickFiles(".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation");
  if (!f) return;
  busy("교회 PPT 를 살펴보는 중...");
  try {
    const T = await tplModule();
    const data = await f.arrayBuffer();
    const analysis = await T.analyzeTemplate(data);
    await T.saveTemplate(f.name, data);
    Object.assign(tpl, { name: f.name, data, analysis, scriptureInfo: (i) => T.scriptureSectionInfo(analysis, i) });
    // 미리보기도 교회 PPT 와 같은 모양으로
    const nd = S.normalizeDesign(S.presetDesign("Connection 목청"));
    try { nd.cardImage = await urlToDataUrl(nd.cardImageUrl); } catch { /* 없음 */ }
    delete nd.cardImageUrl;
    nd.linesPerSlide = state.design.linesPerSlide || 2;
    state.design = nd;
    busy();
    const songs = analysis.blocks.filter((b) => b.kind === "song").length;
    const fixed = analysis.blocks.filter((b) => b.kind === "fixed").length;
    if (confirm(`틀을 저장했습니다.\n\n· 그대로 쓰는 부분: ${fixed}개 (${analysis.blocks.filter((b) => b.kind === "fixed").map((b) => b.name).join(", ")})\n· 찬양: ${songs}곡\n\n지금 예배 순서를 이 틀의 순서로 새로 만들까요?`)) resetServiceFromTpl(true);
    // 틀 안의 찬양도 보관함에 넣어 둔다
    for (const b of analysis.blocks) if (b.kind === "song" && b.song && !state.library[b.song.title]) state.library[b.song.title] = L.songToText(b.song);
    persist(); render();
  } catch (e) { busy(); alert(e.message || String(e)); }
}

async function resetServiceFromTpl(skipConfirm) {
  if (!tpl.analysis) return;
  if (skipConfirm !== true && state.service.items.length && !confirm("지금 예배 순서를 지우고 틀 순서로 새로 만들까요?")) return;
  const T = await tplModule();
  state.service.items = T.serviceFromTemplate(tpl.analysis, uid);
  persist(); render();
}

function renderFixedEditor(it, ed) {
  const a = tpl.analysis;
  const sec = a && a.sections[it.data.sectionIndex];
  ed.innerHTML = `
    <header><button id="edBack">← 완료</button><b>📌 ${esc(it.data.name)}</b><span></span></header>
    <div class="edBody">
      ${!a ? `<p class="empty">교회 PPT 틀을 불러오는 중이거나 없습니다. [디자인] 에서 틀을 넣어 주세요.</p>` : `
      <p class="hint">원래 슬라이드를 그대로 씁니다 (영상·사진·표·글꼴 포함). 이번 주에 바뀌는 글자만 고치세요.</p>
      <label class="chk"><input type="checkbox" id="fxSkip" ${it.data.skip ? "checked" : ""}> 이번 주에는 이 부분 빼기</label>
      ${tpl.scriptureInfo && tpl.scriptureInfo(it.data.sectionIndex) ? scriptureBoxHtml(it.data.scripture) : ""}
      ${sec.ids.length ? sec.ids.map((id, n) => {
        const fs = a.slideFields[id] || [];
        const edits = (it.data.edits || {})[id] || {};
        return `<div class="slideEd"><h4>${n + 1}번째 장${fs.length ? "" : " · 고칠 글자 없음 (그대로)"}</h4>${fs.map((f) => `
          <label class="field"><span>${f.kind === "table" ? "표 (한 줄 = 표의 한 줄, | 로 칸 나눔)" : "글자"}</span>
          <textarea rows="${Math.min(10, f.value.split("\n").length + 1)}" data-sid="${id}" data-key="${f.key}">${esc(edits[f.key] ?? f.value)}</textarea></label>`).join("")}</div>`;
      }).join("") : `<p class="hint">이 구역은 제목만 있는 구역입니다 (슬라이드 없음).</p>`}
      <button class="wide" id="fxReset">원래 글자로 되돌리기</button>`}
    </div>`;
  $("#edBack").onclick = closeEditor;
  if (!a) return;
  $("#fxSkip").onchange = (e) => { it.data.skip = e.target.checked; persist(); };
  if ($("#scrOpen")) bindScriptureBox(it, () => renderEditor());
  ed.querySelectorAll("textarea[data-sid]").forEach((ta) => (ta.oninput = () => {
    it.data.edits = it.data.edits || {};
    const e = (it.data.edits[ta.dataset.sid] = it.data.edits[ta.dataset.sid] || {});
    const orig = (a.slideFields[ta.dataset.sid] || []).find((f) => f.key === ta.dataset.key);
    if (orig && ta.value === orig.value) delete e[ta.dataset.key]; else e[ta.dataset.key] = ta.value;
    persist();
  }));
  $("#fxReset").onclick = () => { if (confirm("이 부분을 원래 글자로 되돌릴까요?")) { it.data.edits = {}; persist(); renderEditor(); } };
}

function pickFromLibrary(it) {
  const titles = Object.keys(state.library).sort((a, b) => a.localeCompare(b, "ko"));
  if (!titles.length) return toast("보관함이 비어 있습니다.");
  const box = document.createElement("div");
  box.className = "pick";
  box.innerHTML = `<div><h3>📚 보관함에서 고르기</h3><input class="search" placeholder="🔎 제목 검색"><div class="list"></div><button class="wide">닫기</button></div>`;
  const list = box.querySelector(".list");
  const draw = (q) => {
    list.innerHTML = titles.filter((t) => !q || t.replace(/\s/g, "").includes(q.replace(/\s/g, ""))).map((t) => `<button class="wide" data-t="${esc(t)}">🎵 ${esc(t)}</button>`).join("");
    list.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
      const keep = { tplLead: it.data.tplLead, tplClosing: it.data.tplClosing };
      it.data = { ...songData(L.parseSongText(state.library[b.dataset.t]), b.dataset.t), ...keep };
      persist(); box.remove(); renderEditor();
      toast(`'${b.dataset.t}' 로 바꿨습니다.`);
    }));
  };
  draw("");
  box.querySelector("input").oninput = (e) => draw(e.target.value);
  box.querySelector("button.wide:last-child").onclick = () => box.remove();
  document.body.appendChild(box);
}

// ------------------------------------------------------------------ 말씀 본문 자동 채우기
const TRANS = ["개역개정", "개역한글", "새번역", "쉬운성경", "현대인의성경", "공동번역 개정판", "우리말성경", "NIV", "ESV", "KJV"];
function scriptureBoxHtml(scr) {
  const tr = (scr && scr.translation) || load("cppt.translation", "개역개정");
  const per = (scr && scr.perSlide) || 3;
  return `<div class="tplBox">
    <b>📖 말씀 본문 채우기</b>
    <label class="field"><span>본문 (예: 사도행전 6:1-7, 행 6장 1-7절)</span><input id="scrRef" value="${esc((scr && scr.ref) || "")}" placeholder="사도행전 6:1-7"></label>
    <div class="row2">
      <label class="field"><span>번역본</span><select id="scrTr">${TRANS.map((t) => `<option ${t === tr ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="field"><span>한 장에 몇 절</span><select id="scrPer">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === per ? "selected" : ""}>${n}절</option>`).join("")}</select></label>
    </div>
    <button class="wide primary" id="scrAuto">📖 본문 자동으로 채우기</button>
    <p class="hint">구절만 넣고 누르면 ${per}절씩 원래 말씀 슬라이드에 들어갑니다. 개역개정은 한 번 가져온 장이 폰에 저장되어 다음부터 인터넷 없이 자동입니다. (개역한글은 앱에 내장)</p>
    <details><summary>성서공회에서 복사해서 넣기 (복사한 장은 저장)</summary>
    <div class="row2"><button id="scrOpen">① 성서공회에서 열기</button><button id="scrPasteBtn">② 복사한 본문 넣기</button></div>
    <p class="hint">성서공회 페이지에서 본문을 길게 눌러 복사 → 돌아와서 ②. 입력한 구절만 골라 넣습니다.</p>
    <label class="field"><span>(②가 안 되면 여기에 길게 눌러 붙여넣기)</span><textarea id="scrPaste" rows="2" placeholder="여기에 붙여넣기"></textarea></label></details>
    <details><summary>성경 파일 넣기 (개역개정 등)</summary><p class="hint">가지고 있는 성경 txt 파일(한 줄에 '창1:1 태초에...')을 넣으면 위에서 고른 번역본으로 이 폰 안에만 저장되고, 인터넷 없이 자동으로 채워집니다.</p>
      <button class="wide" id="scrFile">📂 성경 파일 넣기</button></details>
    ${getAiKey() ? `<button class="wide" id="scrGo">🤖 AI로 찾아서 채우기</button>` : ""}
    ${scr && scr.verses ? `<label class="field"><span>들어갈 본문 — ${esc(scr.label || "")} (틀린 곳은 고치세요, 한 줄에 '장:절 본문')</span>
      <textarea id="scrText" rows="8">${esc(scr.verses.map((v) => `${v.c}:${B.verseNo(v)} ${v.text}`).join("\n"))}</textarea></label>
      <button class="wide" id="scrClear">본문 채우기 끄기 (원래 슬라이드로)</button>` : `<p class="hint">본문이 원래 말씀 슬라이드 모양(표)으로 들어가고, '성경 봉독' 카드의 구절도 바뀝니다.</p>`}
  </div>`;
}

// 구절 -> 본문 {ref, verses, translation} | null
// 1) 이 폰에 있는 성경 (개역한글 내장, 한 번 가져온 개역개정 장)  2) AI 키가 있으면 자동으로 가져와 저장
// 3) 없으면 성서공회를 열어 한 번 복사 (복사한 장은 저장되어 다음부터 자동)
async function autoScripture(refText, tr, { onPasteNeeded } = {}) {
  refText = (refText || "").trim();
  if (!refText) { toast("본문 구절을 입력해 주세요. (예: 사도행전 6:1-7)"); return null; }
  const ref = B.parseRef(refText);
  if (!ref) { toast("구절을 알아보지 못했어요. 예: 사도행전 6:1-7, 요 3:16, 시 23편, 롬 8:38-9:2", 6000); return null; }
  save("cppt.translation", tr);
  let data = null;
  try {
    if (await B.hasBible(tr)) { busy(`${tr} 성경을 여는 중...`); data = await B.loadBible(tr); busy(); }
  } catch (e) { busy(); if (!B.BUNDLED[tr]) toast(e.message, 6000); }
  const have = data ? B.versesFromBible(data, ref) : [];
  if (have.length) return { ref, verses: have, translation: tr };
  if (data && !data._partial) { toast(`${ref.book} ${ref.c1}장${ref.v1 ? ` ${ref.v1}절` : ""} 을(를) 찾지 못했어요. 장·절 번호를 확인해 주세요.`, 6000); return null; }
  if (getAiKey()) {
    busy(`${refText} (${tr}) 본문을 가져오는 중...`);
    try {
      const G = await import("./gemini.js");
      const r = await G.fetchScripture(refText, tr);
      busy();
      await B.saveVerses(tr, ref.code, r.verses, ref.v1 == null ? [ref.c1] : []).catch(() => {});
      return { ref, verses: r.verses, translation: tr };
    } catch (e) { busy(); if (e.kind === "key") { aiKeyDialog(); return null; } toast(`AI 가 본문을 못 가져왔어요: ${e.message}`, 5000); }
  }
  const pick = await choose(`📖 ${ref.book} ${ref.c1}장 (${tr})`,
    `이 장은 아직 폰에 저장된 ${tr} 본문이 없어요.<br><b>한 번만 가져오면 저장돼서 다음부터는 인터넷 없이 자동</b>으로 들어갑니다.`,
    [["file", `📂 ${tr} 성경 파일 넣기 (txt, 한 번만)`], ["bsk", "① 성서공회에서 열기 → 장 전체 복사 → ② 넣기"], ["key", "🤖 무료 AI 키 넣고 매번 자동으로"], ...(tr !== "개역한글" ? [["krv", "이번만 개역한글로 넣기"]] : []), ["", "닫기"]]);
  if (pick === "bsk") {
    openBible(refText, tr);
    if (onPasteNeeded) onPasteNeeded();
    toast("본문을 길게 눌러 장 전체를 복사한 뒤, 돌아와서 [② 복사한 본문 넣기] 를 누르세요.", 7000);
  } else if (pick === "key") aiKeyDialog(() => toast("AI 키가 저장됐어요. [본문 자동으로 채우기] 를 다시 눌러 주세요.", 5000));
  else if (pick === "krv") return autoScripture(refText, "개역한글");
  else if (pick === "file") { if (await importBibleFile(tr)) return autoScripture(refText, tr); }
  return null;
}

// 성서공회에서 복사한 글 -> 장 전체를 이 폰에 저장하고, 원하는 구절만 돌려줌
function versesFromPaste(text, ref, tr) {
  const all = B.versesFromCopied(text, { ...ref, v1: null, v2: null });
  if (all.length && !B.BUNDLED[tr]) B.saveVerses(tr, ref.code, all, B.wholeChapters(all)).catch(() => {});
  return B.versesFromCopied(text, ref);
}

// 가진 성경 txt 파일을 이 폰 안에 저장 ("창1:1 태초에..." 처럼 한 줄에 한 절)
async function importBibleFile(tr) {
  const [f] = await pickFiles(".txt,text/plain");
  if (!f) return false;
  const text = await L.readTextFile(f);
  const r = B.parseBibleTxt(text);
  if (r.verses < 100) { alert("성경 본문을 읽지 못했어요.\n한 줄에 '창1:1 태초에 ...' 처럼 '책 장:절 본문' 모양인 txt 파일이어야 합니다."); return false; }
  await B.saveBible(tr, r.data);
  toast(`${tr} 성경 ${r.books}권 · ${r.verses.toLocaleString()}절을 저장했습니다. 이제 인터넷 없이 자동으로 채워집니다.`, 6000);
  return true;
}

function choose(title, html, options) {
  return new Promise((done) => {
    const box = document.createElement("div");
    box.className = "pick";
    box.innerHTML = `<div><h3>${title}</h3><p class="hint">${html}</p>${options.map(([k, label]) => `<button class="wide ${k && k === options[0][0] ? "primary" : ""}" data-k="${k}">${label}</button>`).join("")}</div>`;
    box.onclick = (e) => { const b = e.target.closest("button[data-k]"); if (!b) return; box.remove(); done(b.dataset.k); };
    document.body.appendChild(box);
  });
}

// 성서공회 성경 페이지 열기 (성서공회에 없는 번역본은 구글 검색)
function openBible(refText, tr) {
  const ref = B.parseRef(refText);
  if (!ref) { toast("구절을 알아보지 못했어요. 예: 사도행전 6:1-7, 요 3:16, 시 23편", 5000); return null; }
  if (B.BSK_VERSIONS[tr]) {
    window.open(B.bskUrl(ref, tr), "_blank");
    if (ref.c2 > ref.c1) toast(`${ref.c1}장을 열었습니다. ${ref.c2}장까지 이어지면 다음 장도 복사해서 한 번 더 넣어 주세요.`, 7000);
  } else webSearch(`${refText} ${tr}`);
  return ref;
}

function missingNote(ref, vs) {
  if (ref.v1 == null || ref.c1 !== ref.c2) return "";
  const want = ref.v2 - ref.v1 + 1;
  return vs.length < want ? ` (${want - vs.length}절이 빠졌어요 — 그 부분도 복사해서 넣어 주세요)` : "";
}

function bindScriptureBox(it, rerender) {
  $("#scrTr").onchange = (e) => save("cppt.translation", e.target.value);
  $("#scrPer").onchange = (e) => { if (it.data.scripture) { it.data.scripture.perSlide = +e.target.value; persist(); } };
  const autoGo = async () => {
    const refText = $("#scrRef").value.trim();
    const tr = $("#scrTr").value, per = +$("#scrPer").value;
    const r = await autoScripture(refText, tr, { onPasteNeeded: () => { const dt = $("#scrOpen").closest("details"); if (dt) dt.open = true; } });
    if (!r) return;
    const label = B.refLabel(r.ref.book, r.verses);
    it.data.scripture = { ref: refText, translation: r.translation, perSlide: per, book: r.ref.book, verses: r.verses, label };
    setReadingCard(label);
    persist(); rerender();
    toast(`${label} (${r.translation}) · ${r.verses.length}절을 넣었습니다.`, 5000);
  };
  $("#scrAuto").onclick = autoGo;
  $("#scrFile").onclick = () => importBibleFile($("#scrTr").value);
  $("#scrRef").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); autoGo(); } };
  $("#scrOpen").onclick = () => {
    const refText = $("#scrRef").value.trim();
    if (!refText) return toast("본문을 입력해 주세요. (예: 사도행전 6:1-7)");
    save("cppt.translation", $("#scrTr").value);
    openBible(refText, $("#scrTr").value);
  };
  const apply = (text) => {
    const refText = $("#scrRef").value.trim();
    const ref = B.parseRef(refText);
    if (!ref) return toast("본문 칸에 구절을 바르게 입력해 주세요. (예: 사도행전 6:1-7)", 5000);
    const tr = $("#scrTr").value, per = +$("#scrPer").value;
    let vs = versesFromPaste(text, ref, tr);
    if (!vs.length) return toast("복사한 글에서 절 번호를 찾지 못했어요. 성경 본문을 절 번호까지 같이 복사해 주세요.", 6000);
    const old = it.data.scripture;
    if (old && old.ref === refText && old.translation === tr && ref.c2 > ref.c1) {   // 여러 장: 이어 붙이기
      const m = new Map(old.verses.map((v) => [`${v.c}:${v.v}`, v]));
      for (const v of vs) m.set(`${v.c}:${v.v}`, v);
      vs = [...m.values()].sort((a, b) => a.c - b.c || a.v - b.v);
    }
    const label = B.refLabel(ref.book, vs);
    it.data.scripture = { ref: refText, translation: tr, perSlide: per, book: ref.book, verses: vs, label };
    setReadingCard(label);
    persist(); rerender();
    toast(`${label} · ${vs.length}절을 넣었습니다.${missingNote(ref, vs)}`, 6000);
  };
  $("#scrPasteBtn").onclick = async () => {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { /* 권한 없음 */ }
    if (!text.trim()) { $("#scrPaste").focus(); return toast("복사한 글을 읽지 못했어요. 아래 칸을 길게 눌러 붙여넣어 주세요.", 5000); }
    apply(text);
  };
  $("#scrPaste").oninput = (e) => { if (e.target.value.trim().length > 5) apply(e.target.value); };
  if ($("#scrGo")) $("#scrGo").onclick = async () => {
    const ref = $("#scrRef").value.trim();
    if (!ref) return toast("본문을 입력해 주세요. (예: 사도행전 6:1-7)");
    const tr = $("#scrTr").value, per = +$("#scrPer").value;
    save("cppt.translation", tr);
    busy(`${ref} (${tr}) 본문을 찾는 중...`);
    try {
      const G = await import("./gemini.js");
      const r = await G.fetchScripture(ref, tr);
      busy();
      const label = G.scriptureLabel(r.book, r.verses);
      it.data.scripture = { ref, translation: tr, perSlide: per, book: r.book, verses: r.verses, label };
      setReadingCard(label);
      persist(); rerender();
      toast(`${label} · ${r.verses.length}절을 넣었습니다. 한 번 확인해 주세요.`, 5000);
    } catch (e) {
      busy();
      if (e.kind === "key") return aiKeyDialog();
      if (confirm(`${e.message}\n\n성서공회 페이지를 열까요?`)) openBible(ref, tr);
    }
  };
  const ta = $("#scrText");
  if (ta) ta.oninput = () => {
    const vs = [];
    for (const l of ta.value.split("\n")) { const m = /^(\d+)\s*[:：]\s*(\d+)(?:-(\d+))?\s+(.+)$/.exec(l.trim()); if (m) vs.push({ c: +m[1], v: +m[2], ...(m[3] ? { vEnd: +m[3] } : {}), text: m[4] }); }
    it.data.scripture.verses = vs; persist();
  };
  const clr = $("#scrClear");
  if (clr) clr.onclick = () => { delete it.data.scripture; persist(); rerender(); };
}

// '성경 봉독' 카드의 구절 칸을 바꾼다 (예: 사도행전 6장 1-7절)
function setReadingCard(label) {
  if (!tpl.analysis) return;
  for (const item of state.service.items) {
    if (item.kind !== "fixed") continue;
    const sec = tpl.analysis.sections[item.data.sectionIndex];
    for (const id of (sec ? sec.ids : [])) {
      const fs = tpl.analysis.slideFields[id] || [];
      if (!fs.some((f) => f.kind === "text" && f.value.replace(/\s+/g, "") === "성경봉독")) continue;
      const target = fs.find((f) => f.kind === "text" && f.value.replace(/\s+/g, "") !== "성경봉독");
      if (!target) continue;
      item.data.edits = item.data.edits || {};
      item.data.edits[id] = { ...(item.data.edits[id] || {}), [target.key]: label };
    }
  }
}

// ------------------------------------------------------------------ 무료 AI (Gemini)
const getAiKey = () => { try { return localStorage.getItem("cppt.geminiKey") || ""; } catch { return ""; } };

function aiKeyDialog(then) {
  const box = document.createElement("div");
  box.className = "pick";
  box.innerHTML = `<div>
    <h3>🔑 무료 AI 키 설정 (처음 한 번)</h3>
    <p class="hint">1. 아래 [키 만드는 곳 열기] → Google 계정으로 로그인<br>
    2. <b>Create API key (API 키 만들기)</b> 를 누르고 만들어진 키를 <b>복사</b><br>
    3. 여기로 돌아와 붙여넣고 [저장]<br>
    카드 등록 없이 무료입니다. 키는 이 휴대폰 안에만 저장됩니다.</p>
    <button class="wide" id="kOpen">🌐 키 만드는 곳 열기</button>
    <label class="field"><span>AI 키</span><input id="kIn" placeholder="AIza..." value="${esc(getAiKey())}" autocomplete="off"></label>
    <div class="row2"><button class="primary" id="kSave">저장</button><button id="kClose">닫기</button></div>
    <p id="kMsg" class="info"></p></div>`;
  document.body.appendChild(box);
  box.querySelector("#kOpen").onclick = () => window.open("https://aistudio.google.com/apikey", "_blank");
  box.querySelector("#kClose").onclick = () => box.remove();
  box.querySelector("#kSave").onclick = async () => {
    const k = box.querySelector("#kIn").value.trim();
    const msg = box.querySelector("#kMsg");
    if (!k) { msg.textContent = "키를 붙여넣어 주세요."; return; }
    msg.textContent = "확인하는 중...";
    const G = await import("./gemini.js");
    try {
      const model = await G.testKey(k);
      G.setKey(k);
      msg.textContent = `✅ 연결 성공 (${model})`;
      setTimeout(() => { box.remove(); if (state.tab === "help") render(); if (then) then(); }, 700);
    } catch (e) { msg.textContent = "❌ " + (e.message || e); }
  };
}

async function aiFill(it) {
  const d = it.data;
  if (!d.title.trim()) return toast("먼저 찬양 제목을 입력해 주세요.");
  const mine = findInLibrary(d.title);
  if (mine) {   // 우리가 모아 둔 가사가 있으면 그것을 먼저
    if (!confirmReplace(it)) return;
    applySong(it, mine, false);
    return toast(`가사 보관함의 '${mine.title}' 을(를) 넣었습니다.`);
  }
  if (!getAiKey()) return aiKeyDialog(() => aiFill(it));
  if (!confirmReplace(it)) return;
  const G = await import("./gemini.js");
  busy(`'${d.title}' 가사를 AI 가 찾는 중... (10~30초)`);
  try {
    const song = await G.findLyrics(d.title.trim(), (d.artist || "").trim());
    busy();
    applySong(it, song, true);
    keepInLibrary(it, true);
    alert("가사를 채웠습니다.\n\n⚠ AI 결과는 틀릴 수 있으니 한 번 확인해 주세요.");
  } catch (e) {
    busy();
    if (e.kind === "key") return aiKeyDialog(() => aiFill(it));
    if (confirm(`${e.message}\n\n구글에서 가사 검색을 열까요? (복사 → [붙여넣기+나누기])`)) webSearch(`${d.title} ${d.artist || ""} 가사`);
  }
}

function aiBulk() {
  const songItems = state.service.items.filter((it) => it.kind === "song");
  const box = document.createElement("div");
  box.className = "pick";
  box.innerHTML = `<div>
    <h3>🤖 이번 주 찬양 한 번에 채우기</h3>
    <p class="hint">한 줄에 한 곡씩 <b>제목 / 찬양팀</b> 으로 적으세요. 예배 순서의 🎵 찬양 자리에 <b>위에서부터 차례로</b> 들어갑니다${songItems.length ? ` (지금 ${songItems.length}자리)` : ""}. 자리가 모자라면 뒤에 추가합니다.</p>
    <p class="hint">가사 보관함에 있는 곡은 보관함 가사를 그대로 쓰고, 없는 곡만 AI 가 찾습니다.</p>
    <textarea id="bulkIn" rows="8" placeholder="나는 예배자 입니다 / 어노인팅\n새 힘 얻으리 / 마커스\n믿음 따라 / 제이어스"></textarea>
    <div class="row2"><button class="primary" id="bulkGo">AI 로 채우기</button><button id="bulkClose">닫기</button></div></div>`;
  document.body.appendChild(box);
  box.querySelector("#bulkClose").onclick = () => box.remove();
  box.querySelector("#bulkGo").onclick = async () => {
    const lines = box.querySelector("#bulkIn").value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    box.remove();
    const G = await import("./gemini.js");
    const ok = [], fail = [];
    let slot = 0;
    for (let i = 0; i < lines.length; i++) {
      const [title, team = ""] = lines[i].split(/\s*[\/|]\s*|\s+-\s+/);
      busy(`(${i + 1}/${lines.length}) '${title}' 찾는 중...`);
      try {
        let song = findInLibrary(title);
        if (!song) {
          if (!getAiKey()) throw Object.assign(new Error("보관함에 없음 · AI 키를 넣으면 찾아 드려요"), { kind: "nokey" });
          song = await G.findLyrics(title, team);
          if (i < lines.length - 1) await new Promise((r) => setTimeout(r, 1500));   // 무료 사용량 보호
        }
        const items = state.service.items;
        const slots = items.filter((it) => it.kind === "song");
        let it = slots[slot++];
        if (it) applySongSilently(it, song);
        else {
          it = { id: uid(), kind: "song", data: songData(song, title) };
          const lastSong = items.lastIndexOf(slots[slots.length - 1]);
          if (lastSong >= 0) items.splice(lastSong + 1, 0, it); else items.push(it);
        }
        state.library[song.title] = L.songToText(song);
        ok.push(song.title);
      } catch (e) {
        if (e.kind === "key" || e.kind === "limit") { fail.push(`${title} (${e.message})`); break; }
        fail.push(`${title} (${e.message})`);
        slot++;
      }
      persist();
    }
    busy();
    render();
    alert(`완료: ${ok.length}곡${ok.length ? "\n· " + ok.join("\n· ") : ""}` +
      (fail.length ? `\n\n못 찾은 곡 (구글 검색 → 붙여넣기로 넣어 주세요):\n· ${fail.join("\n· ")}` : "") +
      "\n\n⚠ AI 결과는 틀릴 수 있으니 PPT 만들기 전에 한 번 확인해 주세요.");
  };
}

function applySongSilently(it, song) {
  it.data = { ...songData(song, it.data.title), tplLead: it.data.tplLead, tplClosing: it.data.tplClosing };
}

// ------------------------------------------------------------------ 보관함에서 같은 곡 찾기 (띄어쓰기 무시)
function findInLibrary(title) {
  const k = (title || "").replace(/\s+/g, "").toLowerCase();
  if (!k) return null;
  const t = Object.keys(state.library).find((x) => x.replace(/\s+/g, "").toLowerCase() === k);
  return t ? { ...L.parseSongText(state.library[t]), title: t } : null;
}

// ------------------------------------------------------------------ 찬양팀 자동완성
const TEAMS = ["마커스워십", "어노인팅", "제이어스 (J-US)", "위러브 (WELOVE)", "예수전도단", "디사이플스", "피아워십 (F.I.A)",
  "아이자야씩스티원", "레위지파", "히즈윌", "시와그림", "다윗의장막", "캠퍼스워십", "원펠로우십", "오버플로우", "꿈이있는자유",
  "소리엘", "뉴젠워십", "팀룩워십", "예람워십", "브리지임팩트", "김복유", "소진영", "심형진", "천관웅", "홍이삭", "조수아",
  "어노인팅 예배캠프", "아침", "옹기장이", "좋은씨앗", "주리", "강명식", "최인혁", "Hillsong Worship", "Hillsong United",
  "Elevation Worship", "Bethel Music", "Maverick City Music", "Planetshakers", "Jesus Culture", "Chris Tomlin", "Passion"];
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const chosung = (s) => [...s].map((c) => { const o = c.charCodeAt(0) - 0xac00; return o >= 0 && o < 11172 ? CHO[Math.floor(o / 588)] : c; }).join("");
const norm = (s) => s.replace(/[\s()]/g, "").toLowerCase();
function teamSuggestions(q) {
  const lib = Object.values(state.library).map((t) => (/^\s*(아티스트|가수)\s*[:：]\s*(.+)$/m.exec(t) || [])[2]).filter(Boolean);
  const all = [...new Set([...lib.map((x) => x.trim()), ...TEAMS])];
  const n = norm(q), c = chosung(n);
  if (!n) return [];
  const isCho = /^[ㄱ-ㅎ]+$/.test(n);
  const score = (t) => { const a = norm(t); if (a.startsWith(n)) return 0; if (isCho && chosung(a).startsWith(c)) return 1; if (a.includes(n)) return 2; return 9; };
  return all.map((t) => [score(t), t]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "ko")).slice(0, 8).map(([, t]) => t);
}
function titleSuggestions(q) {
  const n = norm(q), c = chosung(n);
  if (!n) return [];
  const isCho = /^[ㄱ-ㅎ]+$/.test(n);   // 초성만 쳤을 때만 초성 검색
  const score = (t) => { const a = norm(t); if (a === n) return -1; if (a.startsWith(n)) return 0; if (isCho && chosung(a).startsWith(c)) return 1; if (a.includes(n)) return 2; if (isCho && c.length >= 2 && chosung(a).includes(c)) return 3; return 9; };
  return Object.keys(state.library).map((t) => [score(t), t]).filter(([sc]) => sc < 9)
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "ko")).slice(0, 8).map(([, t]) => t);
}

function attachTeamAutocomplete(input, onPick, suggest = teamSuggestions, keepParens = false) {
  const wrap = document.createElement("div");
  wrap.className = "ac";
  input.parentNode.insertBefore(wrap, input.nextSibling);
  let items = [], idx = -1;
  const draw = () => {
    wrap.innerHTML = items.map((t, i) => `<div class="${i === idx ? "on" : ""}" data-i="${i}">${esc(t)}</div>`).join("");
    wrap.style.display = items.length ? "block" : "none";
    wrap.querySelectorAll("[data-i]").forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); pick(+d.dataset.i); }));
  };
  const pick = (i) => { if (!items[i]) return; input.value = keepParens ? items[i] : items[i].replace(/\s*\(.*\)$/, ""); items = []; idx = -1; draw(); onPick(input.value); };
  input.addEventListener("input", () => { items = suggest(input.value); idx = items.length ? 0 : -1; draw(); });
  input.addEventListener("keydown", (e) => {
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx + 1) % items.length; draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; draw(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(idx < 0 ? 0 : idx); }
    else if (e.key === "Escape") { items = []; draw(); }
  });
  input.addEventListener("blur", () => setTimeout(() => { items = []; draw(); }, 150));
}

// ------------------------------------------------------------------ 목민 청년부 PPT (기본 틀, 앱에 들어 있음)
const CHURCH = { name: "목민 청년부 PPT", url: "church/mokmin.pptx" };

async function ensureChurchTemplate() {
  if (tpl.data) return true;
  busy("목민 청년부 PPT 틀을 받는 중... (처음 한 번, 약 25MB)");
  try {
    const res = await fetch(CHURCH.url);
    if (!res.ok) throw new Error("틀 파일을 받지 못했습니다.");
    const data = await res.arrayBuffer();
    const T = await tplModule();
    const analysis = await T.analyzeTemplate(data);
    await T.saveTemplate(CHURCH.name, data);
    Object.assign(tpl, { name: CHURCH.name, data, analysis, scriptureInfo: (i) => T.scriptureSectionInfo(analysis, i) });
    for (const b of analysis.blocks) if (b.kind === "song" && b.song && !findInLibrary(b.song.title)) state.library[b.song.title] = L.songToText(b.song);
    busy();
    return true;
  } catch (e) { busy(); alert((e.message || e) + "\n인터넷 연결을 확인해 주세요."); return false; }
}

// 지금 넣은 찬양을 목민 청년부 틀의 찬양 자리에 차례로 넣는다
async function fitServiceToChurch() {
  const T = await tplModule();
  const frame = T.serviceFromTemplate(tpl.analysis, uid);
  const mySongs = state.service.items.filter((it) => it.kind === "song" && S.itemToSong(it).sections.length);
  const slots = frame.filter((it) => it.kind === "song");
  mySongs.forEach((s, i) => {
    if (slots[i]) slots[i].data = { ...s.data, tplLead: slots[i].data.tplLead, tplClosing: slots[i].data.tplClosing };
    else { const last = frame.lastIndexOf(slots[slots.length - 1]); frame.splice(last + 1 + (i - slots.length), 0, s); }
  });
  state.service.items = frame;
  persist();
}

async function makeChurchPpt() {
  if (!(await ensureChurchTemplate())) return;
  if (!hasFixed()) {
    const n = state.service.items.filter((it) => it.kind === "song").length;
    if (!confirm(`예배 순서를 목민 청년부 PPT 구성(예배 시작 · 사도신경 · 찬양 · 대표기도 · 말씀 · 봉헌 · 축도 · 광고 · 마침)으로 맞출까요?${n ? `\n지금 넣은 찬양 ${n}곡은 찬양 자리에 차례로 들어갑니다.` : ""}`)) return;
    await fitServiceToChurch();
    render();
    toast("목민 청년부 구성으로 맞췄습니다. 📌 항목(기도자·설교·광고)을 확인하고 다시 누르세요.", 6000);
    return;
  }
  const empty = state.service.items.filter((it) => it.kind === "song" && !S.itemToSong(it).sections.length).map((it) => it.data.title || "(제목 없음)");
  if (empty.length && !confirm(`가사가 비어 있는 찬양이 있습니다:\n· ${empty.join("\n· ")}\n\n그래도 만들까요?`)) return;
  makePpt(state.service.items, state.service.name);
}

// 기본 가사 모음에 있던 곡인지 / 새로 추가한 곡 목록
const isBuiltinSong = (title) => {
  const k = title.replace(/\s+/g, "");
  const h = load("cppt.builtin", { hashes: {} }).hashes || {};
  const tplSongs = tpl.analysis ? tpl.analysis.blocks.filter((b) => b.kind === "song").map((b) => b.title) : [];
  return [...Object.keys(h), ...tplSongs].some((t) => t.replace(/\s+/g, "") === k);
};
const markNewSong = (title) => { const l = load("cppt.newSongs", []); if (!l.includes(title)) { l.push(title); save("cppt.newSongs", l); } };

async function exportNewSongs() {
  const titles = load("cppt.newSongs", []).filter((t) => state.library[t]);
  if (!titles.length) return toast("새로 추가한 곡이 없습니다.");
  busy("새 곡을 묶는 중...");
  await loadScript("vendor/jszip.min.js", "JSZip");
  const zip = new globalThis.JSZip();
  for (const t of titles) zip.file(`${L.safeFilename(t)}.txt`, L.txtBlob(state.library[t]));
  const blob = await zip.generateAsync({ type: "blob" });
  busy();
  await shareOrDownload(blob, `새로추가한곡_${today()}.zip`, "application/zip");
}

// ------------------------------------------------------------------ 기본 가사 보관함 (목민 청년부 가사 모음, 앱에 들어 있음)
const hashText = (t) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; };
async function loadBuiltinLibrary() {
  try {
    const res = await fetch("lyrics/library.json", { cache: "no-cache" });
    if (!res.ok) return;
    const { version, songs } = await res.json();
    const prev = load("cppt.builtin", { version: "", hashes: {} });
    if (prev.version === version) return;
    let added = 0, updated = 0;
    for (const [title, text] of Object.entries(songs)) {
      const mine = findInLibrary(title);
      if (!mine) { state.library[title] = text; added++; continue; }
      const cur = state.library[mine.title];
      // 휴대폰에서 직접 고친 곡은 그대로 두고, 예전 기본 가사 그대로인 곡만 새 가사로
      if (cur !== text && prev.hashes[mine.title] === hashText(cur)) { delete state.library[mine.title]; state.library[title] = text; updated++; }
      else if (!prev.version && cur !== text) { delete state.library[mine.title]; state.library[title] = text; updated++; }
    }
    const hashes = {};
    for (const [title, text] of Object.entries(songs)) hashes[title] = hashText(text);
    save("cppt.builtin", { version, hashes });
    persist();
    if (added || updated) { toast(`목민 청년부 가사 모음: ${added}곡 추가${updated ? `, ${updated}곡 새 가사` : ""}`, 5000); render(); }
  } catch { /* 오프라인 등 */ }
}

// ------------------------------------------------------------------ 시작
document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
render();
loadTpl();
loadBuiltinLibrary();
if (document.fonts) document.fonts.load('bold 20px "NanumSquare Neo Regular"').then(() => render()).catch(() => {});
if ("serviceWorker" in navigator && location.protocol === "https:") {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => r.update()).catch(() => {});
  // 새 버전이 설치되면 바로 새 버전으로 (만들던 내용은 저장되어 있음)
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    if (document.querySelector("#busy.show")) return toast("새 버전이 있습니다. 작업이 끝나면 앱을 다시 열어 주세요.", 6000);
    location.reload();
  });
}

// 인터넷 될 때 개역한글 성경을 미리 받아 둔다 (그다음부터는 인터넷 없이도 본문 자동 채우기)
if ("serviceWorker" in navigator && location.protocol === "https:" && "caches" in window) {
  setTimeout(async () => {
    try {
      if (!navigator.onLine || (await caches.match("bible/krv.json", { ignoreSearch: true }))) return;
      await navigator.serviceWorker.ready;
      await fetch("bible/krv.json");
    } catch { /* 다음에 */ }
  }, 8000);
}

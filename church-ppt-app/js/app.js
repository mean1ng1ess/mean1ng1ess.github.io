// 교회 PPT 메이커 (모바일 웹앱) - 화면
import * as L from "./lyrics.js";
import * as S from "./slides.js";
import { buildPptx } from "./pptx.js";
import { thumb } from "./preview.js";

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
const naver = (q) => window.open("https://search.naver.com/search.naver?query=" + encodeURIComponent(q), "_blank");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function makePpt(items, name) {
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
    <label class="field"><span>예배 이름</span><input id="svcName" value="${esc(state.service.name)}"></label>
    <div class="list">${items.map((it, i) => `
      <div class="card" data-id="${it.id}">
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
      <button data-add="cover">+ 표지</button>
    </div>
    <button class="big go" id="makeAll">▶ 예배 전체 PPT 만들기</button>
    <p class="hint">Verse / Chorus / Bridge 가 PowerPoint <b>구역(섹션)</b>으로 나뉘어 만들어집니다.</p>`;
  $("#svcName").oninput = (e) => { state.service.name = e.target.value; persist(); };
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
  state.service.items.push(it);
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
      <button class="primary" id="impTxt">📂 txt 가져오기</button>
      <button id="expAll">💾 전체 내보내기</button>
    </div>
    <p class="hint">윈도우 프로그램이나 메모장으로 만든 가사 파일을 여러 개 한꺼번에 고를 수 있어요.
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
  $("#expAll").onclick = exportAll;
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
  const files = await pickFiles(".txt,text/plain", true);
  if (!files.length) return;
  let n = 0, auto = 0;
  for (const f of files) {
    const text = await L.readTextFile(f);
    const wasStructured = L.isStructured(L.parseSongText(text));
    const song = L.songFromTxt(text, f.name.replace(/\.txt$/i, ""));
    if (!song.sections.length) continue;
    if (!wasStructured && L.isStructured(song)) auto++;
    state.library[song.title] = L.songToText(song);
    n++;
  }
  persist();
  render();
  toast(`${n}곡을 보관함에 넣었습니다.${auto ? ` (그중 ${auto}곡은 Verse/Chorus 자동 구분)` : ""}`, 5000);
}

async function exportAll() {
  const titles = Object.keys(state.library);
  if (!titles.length) return toast("보관함이 비어 있습니다.");
  const files = titles.map((t) => new File([L.txtBlob(state.library[t])], `${L.safeFilename(t)}.txt`, { type: "text/plain" }));
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: "가사 파일" }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  for (const f of files) await shareOrDownload(f, f.name, "text/plain");
}

// ---- 디자인
const DESIGN_FIELDS = [
  ["배경", [["bgColor", "배경색", "color"], ["bgImage", "배경 사진", "image"], ["bgDim", "사진 어둡게 %", "range", 0, 90], ["ratio", "화면 비율", "select", [["16:9", "16:9 와이드"], ["4:3", "4:3"]]]]],
  ["가사 글자", [["lyrics.size", "크기", "number", 12, 120], ["lyrics.color", "색", "color"], ["lyrics.bold", "굵게", "check"],
    ["lyrics.outline", "외곽선", "check"], ["lyrics.outlineColor", "외곽선 색", "color"], ["lyrics.shadow", "그림자", "check"],
    ["lyrics.font", "글꼴 (PC에 있는 이름)", "text"],
    ["lyricsAlign", "가로 정렬", "select", [["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]]],
    ["lyricsAnchor", "세로 위치", "select", [["top", "위"], ["middle", "가운데"], ["bottom", "아래 (방송 하단 자막)"]]],
    ["lineSpacing", "줄 간격", "number", 0.8, 3, 0.05], ["marginPct", "여백 %", "number", 0, 30]]],
  ["슬라이드 구성", [["linesPerSlide", "가사 한 장에 최대 줄", "number", 1, 10], ["versesPerSlide", "성경 한 장에 최대 절", "number", 1, 10],
    ["sectionMode", "PPT 구역 나누기", "select", [["part", "파트마다 (Verse/Chorus/Bridge)"], ["song", "곡마다"]]],
    ["showLabel", "구석에 파트 이름 표시", "check"], ["showSongTitle", "곡 첫 장에 제목 작게", "check"],
    ["songTitleSlide", "곡마다 제목 슬라이드", "check"], ["blankAfterSong", "곡 끝에 빈 슬라이드", "check"], ["autoShrink", "넘치면 글자 줄이기", "check"]]],
  ["제목·본문 글자", [["titleStyle.size", "표지 제목 크기", "number", 12, 140], ["titleStyle.color", "표지 제목 색", "color"],
    ["headingStyle.size", "성경·설교 제목줄 크기", "number", 12, 120], ["headingStyle.color", "제목줄 색", "color"],
    ["bodyStyle.size", "본문 크기", "number", 12, 120], ["bodyStyle.color", "본문 색", "color"],
    ["contentAlign", "본문 정렬", "select", [["left", "왼쪽"], ["center", "가운데"]]]]],
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
    <label class="field"><span>기본 디자인 고르기</span><select id="preset"><option value="">(지금: ${esc(d.name || "직접 설정")})</option>${Object.keys(S.PRESETS).map((n) => `<option>${esc(n)}</option>`).join("")}</select></label>
    <div id="pv" class="pv"></div>
    ${DESIGN_FIELDS.map(([title, fields]) => `<details ${title === "배경" || title === "가사 글자" ? "open" : ""}><summary>${title}</summary>${fields.map(([p, label, type, a, b, step]) => {
      const v = getPath(d, p);
      if (type === "check") return `<label class="chk"><input type="checkbox" data-p="${p}" ${v ? "checked" : ""}> ${label}</label>`;
      if (type === "select") return `<label class="field"><span>${label}</span><select data-p="${p}">${a.map(([val, t]) => `<option value="${val}" ${val === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
      if (type === "image") return `<div class="field"><span>${label}</span><div class="row2"><button id="bgPick">사진 선택</button><button id="bgClear" ${v ? "" : "disabled"}>지우기</button></div></div>`;
      if (type === "range") return `<label class="field"><span>${label}: <b id="dimV">${v}</b></span><input type="range" min="${a}" max="${b}" data-p="${p}" value="${v}"></label>`;
      return `<label class="field"><span>${label}</span><input type="${type}" data-p="${p}" value="${esc(v)}" ${a != null ? `min="${a}" max="${b}"` : ""} ${step ? `step="${step}"` : ""}></label>`;
    }).join("")}</details>`).join("")}
    <p class="hint">가지고 있는 PPT 파일의 디자인을 그대로 쓰는 기능은 윈도우 프로그램에서만 됩니다.</p>`;
  const drawPv = () => {
    const pv = $("#pv");
    pv.innerHTML = "";
    for (const s of SAMPLES) pv.appendChild(thumb({ ...s, heading: s.kind === "lyrics" && d.showSongTitle ? "곡 제목" : s.heading }, d, 150, drawPv));
  };
  drawPv();
  $("#preset").onchange = (e) => {
    if (!e.target.value) return;
    const keepBg = d.bgImage;
    state.design = S.normalizeDesign(S.presetDesign(e.target.value));
    state.design.bgImage = keepBg;
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
  $("#bgPick").onclick = async () => {
    const [f] = await pickFiles("image/*");
    if (!f) return;
    d.bgImage = await shrinkImage(f, 1920, 0.85);
    persist(); render();
  };
  $("#bgClear").onclick = () => { d.bgImage = ""; persist(); render(); };
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
  main.innerHTML = `<div class="help">
    <h3>📱 홈 화면에 앱으로 설치</h3>
    <p><b>안드로이드(크롬/삼성 인터넷)</b>: 메뉴 ⋮ → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b><br>
    <b>아이폰(사파리)</b>: 아래 공유 버튼 □↑ → <b>홈 화면에 추가</b></p>
    <h3>🎵 찬양 가사 넣기 (모두 무료)</h3>
    <p>1. [+ 찬양] → 제목 입력 → <b>[🔍 가사 검색]</b> (네이버가 열려요)<br>
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
  song: [["title", "찬양 제목", "예: 주 은혜임을"], ["artist", "아티스트 (선택)", ""]],
  scripture: [["reference", "본문 구절", "예: 요한복음 3:16-18"], ["translation", "번역본", "개역개정"]],
  sermon: [["title", "설교 제목", ""], ["preacher", "설교자", "예: 김OO 목사"], ["reference", "본문", "예: 요한복음 3:16"]],
  text: [["title", "제목", "예: 교회 소식, 사도신경"]],
  cover: [["title", "제목", "예: 주일 2부 예배"], ["subtitle", "부제", "예: OO교회"], ["date", "날짜", ""]],
};
const BODY = {
  song: ["body", "가사", "가사를 쓰거나 붙여넣으세요.\n\n[Verse 1]\n첫 줄\n둘째 줄\n\n[Chorus]\n후렴..."],
  scripture: ["text", "본문 (한 줄에 한 절)", "16 하나님이 세상을 이처럼 사랑하사...\n17 ..."],
  sermon: ["body", "요점 (빈 줄로 슬라이드 나눔)", "1. 첫째 요점\n설명\n\n2. 둘째 요점"],
  text: ["body", "내용 (빈 줄로 슬라이드 나눔)", ""],
};

function openEditor(id) { state.editing = id; renderEditor(); $("#editor").classList.add("show"); }
function closeEditor() { state.editing = null; $("#editor").classList.remove("show"); render(); }

function renderEditor() {
  const it = state.service.items.find((x) => x.id === state.editing);
  if (!it) return closeEditor();
  const ed = $("#editor");
  const [bk, blabel, bph] = BODY[it.kind] || [];
  ed.innerHTML = `
    <header><button id="edBack">← 완료</button><b>${S.ITEM_ICONS[it.kind]} ${S.ITEM_LABELS[it.kind]}</b><span></span></header>
    <div class="edBody">
      ${FIELDS[it.kind].map(([k, label, ph]) => `<label class="field"><span>${label}</span><input data-f="${k}" value="${esc(it.data[k])}" placeholder="${esc(ph)}"></label>`).join("")}
      ${it.kind === "song" ? `
        <div class="grid3">
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
      ${it.kind === "scripture" ? `<button class="primary wide" data-a="bible">🔍 인터넷에서 본문 검색</button><p class="hint">검색된 본문을 복사해서 아래에 붙여넣으세요. 앞에 절 번호를 쓰면 작게 표시됩니다.</p>` : ""}
      ${it.kind === "cover" ? `<button class="wide" data-a="sunday">이번 주일 날짜 넣기</button>` : ""}
      ${bk ? `<label class="field"><span>${blabel}</span><textarea data-f="${bk}" rows="12" placeholder="${esc(bph)}">${esc(it.data[bk])}</textarea></label>` : ""}
      <p id="edInfo" class="info"></p>
      <div id="edPv" class="pv"></div>
    </div>`;
  $("#edBack").onclick = closeEditor;
  ed.querySelectorAll("[data-f]").forEach((inp) => (inp.oninput = () => { it.data[inp.dataset.f] = inp.value; persist(); schedulePv(it); }));
  ed.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => editorAction(it, b.dataset.a)));
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
  const d = songData(song, it.data.title);
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

function autoSplit(it, raw) {
  const { sections, order } = L.autoStructure(L.cleanPastedLyrics(raw));
  const song = S.itemToSong(it);
  song.sections = sections;
  song.order = order.length ? order : song.order;
  applySong(it, song, true);
  toast(sections.some((s) => s.label) ? "반복되는 부분을 Chorus 로 나눴습니다. 틀리면 직접 고쳐 주세요." : "반복이 없어 쭉 이어지는 가사로 두었습니다. (빈 줄 = 슬라이드 넘김)", 4500);
}

async function editorAction(it, a) {
  const d = it.data;
  if (a === "search") {
    if (!d.title.trim()) return toast("먼저 찬양 제목을 입력해 주세요.");
    naver(`${d.title} ${d.artist || ""} 가사`);
    toast("가사를 길게 눌러 복사한 뒤, 돌아와서 [붙여넣기 + 자동 나누기] 를 누르세요.", 6000);
  } else if (a === "paste") {
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { /* 권한 없음 */ }
    if (!text.trim()) return toast("복사된 글자를 읽지 못했어요. 가사 칸을 길게 눌러 붙여넣은 뒤 [자동 나누기] 를 누르세요.", 6000);
    if (!confirmReplace(it)) return;
    autoSplit(it, text);
    if (d.title.trim()) keepInLibrary(it, true);
  } else if (a === "auto") {
    if (!(d.body || "").trim()) return toast("가사 칸에 가사를 먼저 넣어 주세요.");
    autoSplit(it, d.body);
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
    naver(`${d.reference} ${d.translation || ""}`);
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

// ------------------------------------------------------------------ 시작
document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
render();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

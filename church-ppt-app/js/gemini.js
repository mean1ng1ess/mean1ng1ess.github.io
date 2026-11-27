// 무료 AI(Google Gemini, 무료 사용량) 로 찬양 제목 + 찬양팀 -> 가사 찾기 / 파트 나누기.
// 키는 Google 계정으로 무료로 만들 수 있고, 이 휴대폰 안(localStorage)에만 저장된다.
import { autoStructure, cleanPastedLyrics, isStructured, parseSongText } from "./lyrics.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const KEY = "cppt.geminiKey";
const MODEL = "cppt.geminiModel";
export const KEY_URL = "https://aistudio.google.com/apikey";

export const getKey = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const setKey = (k) => { try { localStorage.setItem(KEY, k.trim()); localStorage.removeItem(MODEL); } catch { /* 무시 */ } };

export class AiError extends Error {
  constructor(msg, kind = "error") { super(msg); this.kind = kind; }
}

async function call(path, key, body, fetchFn) {
  let res;
  try {
    res = await fetchFn(`${BASE}/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AiError("인터넷 연결을 확인해 주세요.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) throw new AiError("AI 키가 올바르지 않습니다. 키를 다시 붙여넣어 주세요.", "key");
    if (res.status === 403) throw new AiError("이 키로는 AI 를 쓸 수 없습니다. 새 키를 만들어 주세요.", "key");
    if (res.status === 429) throw new AiError("오늘 무료 사용량을 다 썼거나 너무 빨리 요청했습니다. 잠시 뒤 다시 해 주세요.", "limit");
    throw new AiError(`AI 오류: ${msg}`);
  }
  return data;
}

// 키로 쓸 수 있는 'Flash' 모델 중 가장 새 것 (Lite 는 정확도가 낮아 뒤로)
export async function pickModel(key, fetchFn = fetch) {
  try { const m = localStorage.getItem(MODEL); if (m) return m; } catch { /* 없음 */ }
  const data = await call("models?pageSize=200", key, null, fetchFn);
  const ok = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/(image|tts|audio|live|embedding|exp|thinking)/.test(n));
  const ver = (n) => parseFloat(/^gemini-([\d.]+)/.exec(n)[1]);
  ok.sort((a, b) => (/lite/.test(a) - /lite/.test(b)) || (ver(b) - ver(a)) || (/preview/.test(a) - /preview/.test(b)));
  const model = ok[0] || "gemini-2.5-flash";
  try { localStorage.setItem(MODEL, model); } catch { /* 무시 */ }
  return model;
}

const PROMPT = (title, team) => `교회 예배 PPT 자막을 준비하고 있습니다. 아래 찬양의 가사를 Google 검색으로 찾아 주세요.

찬양 제목: ${title}
찬양팀/아티스트: ${team || "(모름 - 가장 많이 알려진 한국 찬양)"}

규칙:
- 신뢰할 수 있는 가사 페이지에서 찾은 가사를 그대로 옮기고, 지어내거나 추측하거나 빠진 부분을 채우지 마세요.
- 확실하게 전체 가사를 찾지 못하면 <not_found>이유</not_found> 만 답하세요.
- 찾으면 아래 형식의 <song> 블록 하나만 답하세요. 설명, 코드, 번역은 넣지 마세요.
- 파트 이름은 Verse 1, Verse 2, Pre-Chorus, Chorus, Bridge, Tag, Intro, Outro, Ending 중에서 고르세요. (찬송가: 1절 = Verse 1, 후렴 = Chorus)
- 같은 파트는 한 번만 쓰고, 반복은 '순서' 줄에 적으세요 (원곡에서 부르는 순서).
- 파트 구분이 없는 곡이면 [ ] 머리말과 순서 줄 없이 가사만 쓰세요.
- 한 줄은 화면에 보기 좋게 8~18글자 정도로 끊어 주세요.

<song>
제목: (제목)
아티스트: (찬양팀)
순서: Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus

[Verse 1]
가사
가사

[Chorus]
가사
</song>`;

function textOf(data) {
  const c = (data.candidates || [])[0];
  if (!c) {
    const r = data.promptFeedback && data.promptFeedback.blockReason;
    throw new AiError(r ? "AI 가 이 요청을 거절했습니다." : "AI 응답이 비어 있습니다.", "blocked");
  }
  if (c.finishReason === "RECITATION") throw new AiError("AI 가 저작권 때문에 가사 전체를 보여주지 않았습니다.", "blocked");
  if (c.finishReason === "SAFETY" || c.finishReason === "PROHIBITED_CONTENT") throw new AiError("AI 가 이 요청을 거절했습니다.", "blocked");
  return ((c.content && c.content.parts) || []).map((p) => p.text || "").join("");
}

export async function findLyrics(title, team, { key = getKey(), fetchFn = fetch } = {}) {
  if (!key) throw new AiError("AI 키가 없습니다.", "key");
  const model = await pickModel(key, fetchFn);
  const data = await call(`models/${model}:generateContent`, key, {
    contents: [{ role: "user", parts: [{ text: PROMPT(title, team) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 },
  }, fetchFn);
  const text = textOf(data);
  const nf = /<not_found>([\s\S]*?)<\/not_found>/.exec(text);
  const m = /<song>([\s\S]*?)<\/song>/.exec(text);
  if (!m) throw new AiError(nf ? nf[1].trim() || "가사를 찾지 못했습니다." : "가사를 찾지 못했습니다.", "notfound");
  const song = parseSongText(m[1].trim());
  if (!song.sections.length) throw new AiError("가사를 찾지 못했습니다.", "notfound");
  if (!isStructured(song)) {
    const body = song.sections.map((s) => s.lines.join("\n")).join("\n\n");
    const r = autoStructure(cleanPastedLyrics(body));
    if (r.sections.length) { song.sections = r.sections; if (!song.order.length) song.order = r.order; }
  }
  song.title = song.title || title;
  if (!song.artist && team) song.artist = team;
  return song;
}

const SPLIT_PROMPT = (title, raw) => `교회 예배 PPT 자막용으로 아래 찬양 가사를 파트별로 정리해 주세요. (검색하지 말고 아래 가사만 쓰세요)
${title ? `찬양 제목: ${title}\n` : ""}
규칙:
- 단어를 바꾸거나 더하거나 빼지 마세요. 줄바꿈만 화면에 보기 좋게 (한 줄 8~18글자) 다듬어도 됩니다.
- 곡의 구조를 보고 파트를 정하세요. 반복된다고 무조건 Chorus 가 아닙니다:
  · 곡의 중심 메시지/제목이 들어 있고 여러 번 반복되는 부분 = Chorus
  · 이야기가 진행되며 매번 가사가 다른 부분 = Verse 1, Verse 2 ...
  · Chorus 바로 앞에서 고조시키는 짧은 부분 = Pre-Chorus
  · 곡 후반에 한 번 나오는 새로운 부분 = Bridge,  끝에 반복하는 짧은 마무리 = Tag
  · 같은 Verse 를 두 번 부르면 Verse 로 두고 순서에 두 번 적으세요.
- 파트 이름: Verse 1, Verse 2, Verse 3, Pre-Chorus, Chorus, Chorus 2, Bridge, Tag, Intro, Outro, Ending
- 같은 파트는 한 번만 쓰고, 부르는 순서(반복 포함)는 '순서' 줄에 적으세요.
- 코드(G, Am7), x2, 출처 같은 줄은 빼세요.
- 파트 구분이 없는 곡(기도문 등)이면 [ ] 머리말 없이 가사만 쓰세요.
- 아래 형식의 <song> 블록 하나만 답하세요.

<song>
제목: ${title || "(제목)"}
순서: Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus

[Verse 1]
가사
</song>

가사:
${raw}`;

// 붙여넣은 가사를 AI 가 Verse/Chorus/Bridge 로 정리 (단어는 그대로)
export async function splitLyrics(raw, title = "", { key = getKey(), fetchFn = fetch } = {}) {
  if (!key) throw new AiError("AI 키가 없습니다.", "key");
  const model = await pickModel(key, fetchFn);
  const data = await call(`models/${model}:generateContent`, key, {
    contents: [{ role: "user", parts: [{ text: SPLIT_PROMPT(title, raw) }] }],
    generationConfig: { temperature: 0.1 },
  }, fetchFn);
  const m = /<song>([\s\S]*?)<\/song>/.exec(textOf(data));
  if (!m) throw new AiError("AI 가 가사를 나누지 못했습니다.", "notfound");
  const song = parseSongText(m[1].trim());
  if (!song.sections.length) throw new AiError("AI 가 가사를 나누지 못했습니다.", "notfound");
  if (title) song.title = title;
  return song;
}

export const TRANSLATIONS = ["개역개정", "개역한글", "새번역", "쉬운성경", "현대인의성경", "공동번역 개정판", "우리말성경", "NIV", "ESV", "KJV"];

const BIBLE_PROMPT = (ref, tr) => `교회 예배 PPT 에 넣을 성경 본문을 Google 검색으로 찾아 주세요.

본문: ${ref}
번역본: ${tr}

규칙:
- 반드시 '${tr}' 번역의 본문을 글자 그대로 옮기세요. 다른 번역을 섞거나, 요약하거나, 지어내지 마세요.
- 각주 표시(예: '1)구제' 의 '1)'), 소제목, 설명은 빼세요.
- 한 줄에 한 절씩, 앞에 '장:절' 을 붙이세요.
- 책 이름은 줄이지 말고 정식 이름으로 (예: 행 -> 사도행전, 요 -> 요한복음).
- 확실한 본문을 찾지 못하면 <not_found>이유</not_found> 만 답하세요.
- 아래 형식의 <scripture> 블록 하나만 답하세요.

<scripture>
책: 사도행전
6:1 그 때에 제자가 더 많아졌는데 ...
6:2 열두 사도가 ...
</scripture>`;

// 성경 본문 찾기 -> { book, verses: [{ c, v, text }] }
export async function fetchScripture(ref, tr = "개역개정", { key = getKey(), fetchFn = fetch } = {}) {
  if (!key) throw new AiError("AI 키가 없습니다.", "key");
  const model = await pickModel(key, fetchFn);
  const data = await call(`models/${model}:generateContent`, key, {
    contents: [{ role: "user", parts: [{ text: BIBLE_PROMPT(ref, tr) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0 },
  }, fetchFn);
  const text = textOf(data);
  const m = /<scripture>([\s\S]*?)<\/scripture>/.exec(text);
  if (!m) {
    const nf = /<not_found>([\s\S]*?)<\/not_found>/.exec(text);
    throw new AiError(nf ? nf[1].trim() || "본문을 찾지 못했습니다." : "본문을 찾지 못했습니다.", "notfound");
  }
  return parseScriptureText(m[1]);
}

// "책: 사도행전" + "6:1 본문" 줄들 -> { book, verses }
export function parseScriptureText(body) {
  let book = "";
  const verses = [];
  for (const raw of body.split("\n")) {
    const l = raw.trim();
    const b = /^책\s*[:：]\s*(.+)$/.exec(l);
    if (b) { book = b[1].trim(); continue; }
    const v = /^(\d+)\s*[:：장]\s*(\d+)\s*절?\s+(.+)$/.exec(l);
    if (v) verses.push({ c: +v[1], v: +v[2], text: v[3].replace(/\d+\)(?=\S)/g, "").trim() });
  }
  if (!verses.length) throw new AiError("본문을 찾지 못했습니다.", "notfound");
  return { book, verses };
}

// "사도행전 6장 1-7절",  장이 넘어가면 "사도행전 6장 1절 - 7장 2절"
export function scriptureLabel(book, verses) {
  if (!verses.length) return book;
  const a = verses[0], z = verses[verses.length - 1];
  if (a.c === z.c) return `${book} ${a.c}장 ${a.v === z.v ? a.v : `${a.v}-${z.v}`}절`;
  return `${book} ${a.c}장 ${a.v}절 - ${z.c}장 ${z.v}절`;
}

export async function testKey(key, fetchFn = fetch) {
  try { localStorage.removeItem(MODEL); } catch { /* 무시 */ }
  return pickModel(key, fetchFn);
}

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

export async function testKey(key, fetchFn = fetch) {
  try { localStorage.removeItem(MODEL); } catch { /* 무시 */ }
  return pickModel(key, fetchFn);
}

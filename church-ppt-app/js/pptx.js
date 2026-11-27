// 슬라이드 목록 -> .pptx (PptxGenJS). PowerPoint '구역(섹션)' 으로 Verse/Chorus/Bridge 를 나눈다.
import { fitScale } from "./slides.js";

const hex = (c) => (c || "#FFFFFF").replace("#", "").toUpperCase().padStart(6, "0").slice(0, 6);

function runOpts(style, size) {
  const o = { fontFace: style.font, fontSize: Math.max(6, Math.round(size * 10) / 10), color: hex(style.color), bold: !!style.bold };
  if (style.outline) o.outline = { size: style.outlineWidth, color: hex(style.outlineColor) };
  if (style.shadow) o.shadow = { type: "outer", color: "000000", opacity: 0.7, blur: 4, offset: 2, angle: 45 };
  if (style.glow) o.glow = { size: 10, opacity: 0.13, color: hex(style.color) };
  return o;
}

// paras: [{text, style, size, prefix?:{text, style, size}}]
function addText(slide, box, paras, align, valign, spacing, shrink) {
  const [x, y, w, h] = box; // inch
  const scale = shrink ? fitScale(paras.map((p) => [(p.prefix ? p.prefix.text + " " : "") + p.text, p.size]), w * 72, h * 72, spacing) : 1;
  const runs = [];
  paras.forEach((p, i) => {
    const last = i === paras.length - 1;
    if (p.prefix) runs.push({ text: p.prefix.text + " ", options: runOpts(p.prefix.style, p.prefix.size * scale) });
    runs.push({ text: p.text, options: { ...runOpts(p.style, p.size * scale), breakLine: !last } });
  });
  if (!runs.length) return;
  slide.addText(runs, { x, y, w, h, align, valign, margin: 0, lineSpacingMultiple: spacing, fit: "none", wrap: true });
}

export function slideSize(design) {
  return design.ratio === "4:3" ? [10, 7.5] : [13.333, 7.5];
}

export function drawSlide(pptx, slide, spec, d) {
  const [W, H] = slideSize(d);
  if (d.bgImage) {
    slide.background = { data: d.bgImage };
    if (d.bgDim > 0) slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: "000000", transparency: 100 - Math.min(90, d.bgDim) }, line: { type: "none" } });
  } else slide.background = { color: hex(d.bgColor) };
  if (spec.notes) slide.addNotes(spec.notes);
  if (d.footerText) {
    const fs = d.footerStyle;
    addText(slide, [W / 2 - 2.25, H - 0.55, 4.5, 0.4], [{ text: d.footerText, style: fs, size: fs.size }], "center", "middle", 1, false);
  }
  if (spec.kind === "blank") return;

  const mx = W * d.margin, my = W * d.margin * 0.75;
  const X = mx, Y = my, BW = W - 2 * mx, BH = H - 2 * my;
  const valign = { top: "top", middle: "middle", bottom: "bottom" };

  if (spec.kind === "lyrics") {
    let top = Y;
    if (spec.heading) {
      const hs = d.labelStyle;
      addText(slide, [X, Y, BW, H * 0.1], [{ text: spec.heading, style: hs, size: hs.size + 6 }], "center", "top", 1, true);
      top = Y + H * 0.1;
    }
    if (d.showLabel && spec.label) {
      const ls = d.labelStyle;
      addText(slide, [mx * 0.4, my * 0.4, W * 0.3, H * 0.08], [{ text: spec.label, style: ls, size: ls.size }], "left", "top", 1, false);
    }
    addText(slide, [X, top, BW, Y + BH - top], spec.lines.map((t) => ({ text: t, style: d.lyrics, size: d.lyrics.size })),
      d.lyricsAlign, valign[d.lyricsAnchor] || "middle", d.lineSpacing, d.autoShrink);
    return;
  }
  if (spec.kind === "cover" && spec.card && d.cardImage) {
    // 순서 카드: 십자가 배경 + 제목 / 흰 줄 / 이름  (원래 PPT 의 위치 그대로, 13.33in 기준)
    const sx = W / 13.333;
    slide.background = { data: d.cardImage };
    const ts = d.cardTitleStyle, ss = d.cardSubStyle;
    addText(slide, [1.93 * sx, 2.3, 9.48 * sx, 1.11], [{ text: spec.heading || "", style: ts, size: ts.size }], "center", "middle", 1, d.autoShrink);
    slide.addShape(pptx.ShapeType.roundRect, { x: 4.43 * sx, y: 3.71, w: 4.47 * sx, h: 0.05, fill: { color: "FFFFFF" }, line: { type: "none" }, rectRadius: 0.02 });
    const sub = (spec.subtitle || "").split("\n").filter((x) => x.trim());
    if (sub.length) addText(slide, [1.93 * sx, 4.06, 9.48 * sx, 0.84 * sub.length], sub.map((t) => ({ text: t.trim(), style: ss, size: ss.size })), "center", "top", 1, d.autoShrink);
    return;
  }
  if (spec.kind === "cover") {
    const paras = [{ text: spec.heading || "", style: d.titleStyle, size: d.titleStyle.size }];
    for (const ln of (spec.subtitle || "").split("\n")) if (ln.trim()) paras.push({ text: ln.trim(), style: d.bodyStyle, size: d.bodyStyle.size * 0.8 });
    addText(slide, [X, Y, BW, BH], paras, "center", "middle", 1.15, d.autoShrink);
    return;
  }
  // content  (성경 본문은 정렬을 따로 정할 수 있음)
  const align = spec.hint === "scripture" && d.scriptureAlign ? d.scriptureAlign : d.contentAlign;
  let bodyTop = Y;
  if (spec.heading) {
    const hs = spec.hint === "scripture" ? { ...d.headingStyle, color: d.bodyStyle.color } : d.headingStyle;
    addText(slide, [X, Y, BW, BH * 0.17], [{ text: spec.heading, style: hs, size: hs.size }], align, "middle", 1, d.autoShrink);
    bodyTop = Y + BH * 0.21;
  }
  const bs = d.bodyStyle;
  const paras = spec.lines.map((ln) => {
    const m = spec.hint === "scripture" ? /^(\d{1,3}(?:-\d{1,3})?)\s+(.+)$/.exec(ln) : null;
    if (m) return { text: m[2], style: bs, size: bs.size, prefix: { text: m[1], style: { ...d.headingStyle, color: bs.color, outline: bs.outline }, size: bs.size * 0.65 } };
    return { text: ln, style: bs, size: bs.size };
  });
  addText(slide, [X, bodyTop, BW, Y + BH - bodyTop], paras, align, spec.heading ? "top" : "middle", d.lineSpacing, d.autoShrink);
}

// PptxGenJS 는 같은 이름의 구역을 하나로 합치므로, 다시 나오는 Chorus 등은 "(2)" 를 붙인다.
export function sectionTitles(slides) {
  const used = new Map();
  const bySid = new Map();
  for (const s of slides) {
    if (bySid.has(s.sectionId)) continue;
    const base = s.section || "구역";
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    bySid.set(s.sectionId, n === 1 ? base : `${base} (${n})`);
  }
  return bySid;
}

export async function buildPptx(slides, design, PptxGen = globalThis.PptxGenJS) {
  if (!slides.length) throw new Error("만들 슬라이드가 없습니다. 예배 순서에 항목을 추가해 주세요.");
  const pptx = new PptxGen();
  pptx.layout = design.ratio === "4:3" ? "LAYOUT_4x3" : "LAYOUT_WIDE";
  pptx.title = "예배 PPT";
  const titles = sectionTitles(slides);
  const added = new Set();
  let lastSid = null;
  for (const spec of slides) {
    const t = titles.get(spec.sectionId);
    if (spec.sectionId !== lastSid && !added.has(t)) { pptx.addSection({ title: t }); added.add(t); }
    lastSid = spec.sectionId;
    const slide = pptx.addSlide({ sectionTitle: t });
    drawSlide(pptx, slide, spec, design);
  }
  return pptx.write({ outputType: "blob" });
}

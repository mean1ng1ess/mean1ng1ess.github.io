// 슬라이드 미리보기 (캔버스). 실제 PPT 와 거의 같은 배치.
import { slideSize } from "./pptx.js";

const imgCache = new Map();
function bgImage(src, onload) {
  if (!src) return null;
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = onload;
    img.src = src;
    imgCache.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

function wrap(ctx, text, maxW) {
  const out = [];
  let line = "";
  for (const word of text.split(/(\s+)/)) {
    const test = line + word;
    if (ctx.measureText(test).width > maxW && line.trim()) {
      out.push(line.trim());
      line = word.trimStart();
      while (ctx.measureText(line).width > maxW && line.length > 1) {   // 아주 긴 단어(띄어쓰기 없는 한글)
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    } else line = test;
  }
  if (line.trim() || !out.length) out.push(line.trim());
  return out;
}

function font(st, px) { return `${st.bold ? "bold " : ""}${Math.max(1, px)}px "${st.font}", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`; }

function drawParas(ctx, box, paras, align, anchor, spacing, k, shrink) {
  const [x, y, w, h] = box;
  const layout = (f) => {
    let total = 0;
    const items = paras.map((p) => {
      const px = p.size * k * f;
      ctx.font = font(p.style, px);
      const lines = wrap(ctx, p.text || " ", w);
      const lh = px * 1.2 * spacing;
      total += lines.length * lh;
      return { p, px, lines, lh };
    });
    return { items, total };
  };
  let f = 1, L = layout(f);
  while (shrink && L.total > h && f > 0.5) { f -= 0.05; L = layout(f); }
  let cy = anchor === "top" ? y : anchor === "bottom" ? y + h - L.total : y + (h - L.total) / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";
  const tx = align === "left" ? x : align === "right" ? x + w : x + w / 2;
  for (const it of L.items) {
    ctx.font = font(it.p.style, it.px);
    for (const ln of it.lines) {
      const yy = cy + it.lh / 2;
      const st = it.p.style;
      if (st.shadow) { ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillText(ln, tx + Math.max(1, 2 * k), yy + Math.max(1, 2 * k)); }
      if (st.glow) { ctx.save(); ctx.shadowColor = "rgba(255,255,255,.45)"; ctx.shadowBlur = 10 * k; ctx.fillStyle = st.color; ctx.fillText(ln, tx, yy); ctx.restore(); }
      if (st.outline) { ctx.lineWidth = Math.max(1, st.outlineWidth * k * 2); ctx.strokeStyle = st.outlineColor; ctx.lineJoin = "round"; ctx.strokeText(ln, tx, yy); }
      ctx.fillStyle = st.color;
      ctx.fillText(ln, tx, yy);
      cy += it.lh;
    }
  }
}

export function paintSlide(canvas, spec, d, onAsync) {
  const [Win, Hin] = slideSize(d);
  const W = Win * 72, H = Hin * 72;             // pt
  const ctx = canvas.getContext("2d");
  const k = canvas.width / W;
  ctx.fillStyle = d.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const useCard = spec && spec.kind === "cover" && spec.card && d.cardImage;
  const img = bgImage(useCard ? d.cardImage : d.bgImage, onAsync);
  if (img) {
    const tr = canvas.width / canvas.height, ir = img.naturalWidth / img.naturalHeight;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (ir > tr) { sw = sh * tr; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / tr; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    if (d.bgDim) { ctx.fillStyle = `rgba(0,0,0,${Math.min(90, d.bgDim) / 100})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }
  const R = (x, y, w, h) => [x * k, y * k, w * k, h * k];
  if (d.footerText) drawParas(ctx, R(W / 2 - 162, H - 40, 324, 29), [{ text: d.footerText, style: d.footerStyle, size: d.footerStyle.size }], "center", "middle", 1, k, false);
  if (!spec || spec.kind === "blank") return;
  if (useCard) {
    const sx = W / 960;
    drawParas(ctx, R(139 * sx, 166, 683 * sx, 80), [{ text: spec.heading || "", style: d.cardTitleStyle, size: d.cardTitleStyle.size }], "center", "middle", 1, k, d.autoShrink);
    ctx.fillStyle = "#fff";
    ctx.fillRect(...R(319 * sx, 267, 322 * sx, 3.6));
    const sub = (spec.subtitle || "").split("\n").filter((x) => x.trim());
    if (sub.length) drawParas(ctx, R(139 * sx, 292, 683 * sx, 61 * sub.length), sub.map((t) => ({ text: t.trim(), style: d.cardSubStyle, size: d.cardSubStyle.size })), "center", "top", 1, k, d.autoShrink);
    return;
  }
  const mx = W * d.margin, my = W * d.margin * 0.75;
  const X = mx, Y = my, BW = W - 2 * mx, BH = H - 2 * my;
  if (spec.kind === "lyrics") {
    let top = Y;
    if (spec.heading) {
      drawParas(ctx, R(X, Y, BW, H * 0.1), [{ text: spec.heading, style: d.labelStyle, size: d.labelStyle.size + 6 }], "center", "top", 1, k, true);
      top = Y + H * 0.1;
    }
    if (d.showLabel && spec.label) drawParas(ctx, R(mx * 0.4, my * 0.4, W * 0.3, H * 0.08), [{ text: spec.label, style: d.labelStyle, size: d.labelStyle.size }], "left", "top", 1, k, false);
    drawParas(ctx, R(X, top, BW, Y + BH - top), spec.lines.map((t) => ({ text: t, style: d.lyrics, size: d.lyrics.size })), d.lyricsAlign, d.lyricsAnchor, d.lineSpacing, k, d.autoShrink);
  } else if (spec.kind === "cover") {
    const paras = [{ text: spec.heading || "", style: d.titleStyle, size: d.titleStyle.size }];
    for (const ln of (spec.subtitle || "").split("\n")) if (ln.trim()) paras.push({ text: ln.trim(), style: d.bodyStyle, size: d.bodyStyle.size * 0.8 });
    drawParas(ctx, R(X, Y, BW, BH), paras, "center", "middle", 1.15, k, d.autoShrink);
  } else {
    const align = spec.hint === "scripture" && d.scriptureAlign ? d.scriptureAlign : d.contentAlign;
    let bodyTop = Y;
    if (spec.heading) {
      drawParas(ctx, R(X, Y, BW, BH * 0.17), [{ text: spec.heading, style: d.headingStyle, size: d.headingStyle.size }], align, "middle", 1, k, d.autoShrink);
      bodyTop = Y + BH * 0.21;
    }
    drawParas(ctx, R(X, bodyTop, BW, Y + BH - bodyTop), spec.lines.map((t) => ({ text: t, style: d.bodyStyle, size: d.bodyStyle.size })),
      align, spec.heading ? "top" : "middle", d.lineSpacing, k, d.autoShrink);
  }
}

export function thumb(spec, d, width = 240, onAsync) {
  const [Win, Hin] = slideSize(d);
  const c = document.createElement("canvas");
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  c.width = Math.round(width * dpr);
  c.height = Math.round(width * dpr * Hin / Win);
  c.style.width = width + "px";
  paintSlide(c, spec, d, onAsync);
  return c;
}

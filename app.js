/* Законы РФ 2002–2026 — статический интерфейс. Данные: data/laws.json */
"use strict";

let LAWS = [];          // [{n,t,c,d,y,i,st,ev,ed,a,tp,w,b}]
let aud = "anti";       // вкладка аудитории: anti | pro | all
let view = "stage";     // вид: stage | year | topic | graph
let query = "";
const PAGE = 12;        // карточек на колонку до «ещё»
const shown = {};       // счётчик доп. карточек на колонку
let graphRAF = null;    // анимация сетки

const STAGE_ORDER = ["Внесён","На рассмотрении","Принят Госдумой","Совет Федерации","У Президента","Опубликован (действует)","Архив"];
const STAGE_COLORS = {"Опубликован (действует)":"var(--green)","У Президента":"var(--blue)","Совет Федерации":"var(--blue)","Принят Госдумой":"var(--acc)","На рассмотрении":"var(--grey)","Внесён":"var(--grey)","Архив":"var(--line)"};

async function load() {
  const meta = await fetch("data/meta.json").then(r => r.json()).catch(() => ({}));
  document.getElementById("updated").textContent = meta.updated
    ? "обновлено: " + meta.updated.replace("T", " ") : "";
  LAWS = await fetch("data/laws.json").then(r => r.json());
  renderTiles();
  renderFresh();
  render();
}

function dkey(l) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(l.d || "");
  return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0;
}

function esc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function billUrl(l){ return "https://sozd.duma.gov.ru/bill/" + l.n; }

function audMark(l){ return l.a === "anti" ? "🔴" : l.a === "pro" ? "🟢" : "⚪"; }

function match(l) {
  if (aud === "anti" && l.a !== "anti") return false;
  if (aud === "pro" && l.a !== "pro") return false;
  if (query) {
    const q = query.toLowerCase();
    if (!(l.t + " " + l.n + " " + l.i + " " + l.c).toLowerCase().includes(q)) return false;
  }
  return true;
}

function renderTiles() {
  const acts = LAWS.filter(l => l.st === "Опубликован (действует)");
  const inwork = LAWS.filter(l => l.st !== "Архив" && l.st !== "Опубликован (действует)");
  const anti = LAWS.filter(l => l.a === "anti");
  const pro = LAWS.filter(l => l.a === "pro");
  const tiles = [
    {n: acts.length, l: "принято и действует законов", c: "green", a: "all", v: "stage"},
    {n: inwork.length, l: "на рассмотрении / внесено сейчас", c: "blue", a: "all", v: "stage"},
    {n: anti.length, l: "всего «не для людей»", c: "red", a: "anti", v: "topic"},
    {n: pro.length, l: "всего «для людей»", c: "gold", a: "pro", v: "topic"},
  ];
  document.getElementById("tiles").innerHTML = tiles.map((t, i) =>
    `<div class="tile ${t.c}" data-a="${t.a}" data-v="${t.v}">
       <div class="n">${t.n.toLocaleString("ru")}</div><div class="l">${t.l}</div></div>`).join("");
  document.querySelectorAll(".tile").forEach(el =>
    el.addEventListener("click", () => {
      aud = el.dataset.a; view = el.dataset.v;
      syncTabs(); render();
    }));
}

function renderFresh() {
  const fresh = [...LAWS].filter(l => l.d).sort((a, b) => dkey(b) - dkey(a)).slice(0, 30);
  document.getElementById("fresh").innerHTML = fresh.map(l =>
    `<a class="chip" href="${billUrl(l)}" target="_blank" rel="noopener">
       <div class="d">${esc(l.d)} · ${audMark(l)}</div>
       <div class="t">${esc(l.t)}</div></a>`).join("");
}

function groupLaws() {
  const key = l => view === "stage" ? l.st : view === "year" ? (l.y || "—") : l.tp;
  const g = new Map();
  for (const l of LAWS) {
    if (!match(l)) continue;
    const k = key(l);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(l);
  }
  let keys = [...g.keys()];
  if (view === "stage") keys.sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
  else if (view === "year") keys.sort((a, b) => (b === "—" ? 1 : b) - (a === "—" ? 1 : a));
  else keys.sort((a, b) => g.get(b).length - g.get(a).length);
  return keys.map(k => [k, g.get(k)]);
}

function render() {
  stopGraph();
  const board = document.getElementById("board");
  if (view === "graph") return renderGraph(board);
  const groups = groupLaws();
  board.innerHTML = `<div class="board">` + groups.map(([k, laws]) => {
    const id = view + "|" + k;
    const colc = view === "stage" ? (STAGE_COLORS[k] || "var(--grey)") : "var(--acc)";
    const limit = PAGE + (shown[id] || 0);
    laws.sort((a, b) => dkey(b) - dkey(a));
    const cards = laws.slice(0, limit).map(cardHtml).join("");
    const rest = laws.length - limit;
    return `<div class="col" style="--colc:${colc}">
      <h3><span>${esc(k)}</span><span class="cnt">${laws.length.toLocaleString("ru")}</span></h3>
      <div class="cards">${cards}
        ${rest > 0 ? `<button class="morebtn" data-g="${esc(id)}">показать ещё (${rest.toLocaleString("ru")})</button>` : ""}
      </div></div>`;
  }).join("") + `</div>`;

  document.querySelectorAll(".card").forEach(c =>
    c.addEventListener("click", e => {
      if (e.target.tagName === "A") return;
      c.classList.toggle("open");
    }));
  document.querySelectorAll(".morebtn").forEach(b =>
    b.addEventListener("click", () => {
      shown[b.dataset.g] = (shown[b.dataset.g] || 0) + 60;
      render();
    }));
}

function cardHtml(l) {
  const why = (l.a !== "unknown" && l.w && l.w.length)
    ? `<div class="why">${l.a === "anti" ? "⚡ против людей: " : "💚 за людей: "}${l.w.map(w => esc(w)).join(" · ")}</div>`
    : "";
  const note = l.c ? `<div class="note">${esc(l.c)}</div>` : "";
  return `<div class="card ${l.a}">
     <div class="crow"><span class="num"><a href="${billUrl(l)}" target="_blank" rel="noopener">${esc(l.n)}</a></span><span class="dt">${esc(l.d)}</span><span class="mark">${audMark(l)}</span></div>
     <div class="t">${esc(l.t)}</div>
     ${why}${note}
     <div class="more">${esc(l.ev || "")}${l.ed ? " · " + esc(l.ed) : ""}${l.i ? "<br>инициатор: " + esc(l.i) : ""}</div>
     <a class="ext" href="${billUrl(l)}" target="_blank" rel="noopener">карточка в Госдуме →</a>
     <span class="tp">${esc(l.tp)}</span>
   </div>`;
}

/* ===== Сетка законов (Zettelkasten) =====
   Ребро = два законопроекта правят один и тот же базовый закон. */
function buildGraphData() {
  const pool = LAWS.filter(l => l.b && match(l));
  const baseCount = {};
  for (const l of pool) baseCount[l.b] = (baseCount[l.b] || 0) + 1;
  const topBases = Object.entries(baseCount).sort((a, b) => b[1] - a[1]).slice(0, 60).map(e => e[0]);
  const nodes = [];
  const byBase = {};
  for (const b of topBases) {
    const items = pool.filter(l => l.b === b).sort((a, b) => dkey(b) - dkey(a)).slice(0, 5);
    byBase[b] = [];
    for (const l of items) {
      byBase[b].push(nodes.length);
      nodes.push(l);
    }
  }
  const edges = [];
  for (const b in byBase) {
    const ids = byBase[b];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        edges.push([ids[i], ids[j]]);
  }
  // хабы-«базовые законы» как крупные узлы-метки
  const hubs = topBases.map((b, i) => ({hub: true, label: b, base: b, idx: nodes.length + i}));
  return {nodes, edges, hubs, baseCount};
}

function renderGraph(board) {
  const G = buildGraphData();
  board.innerHTML = `
    <div class="graphwrap">
      <div class="graphlegend">
        <span><i class="dot red"></i>не для людей</span>
        <span><i class="dot green"></i>для людей</span>
        <span><i class="dot grey"></i>без оценки</span>
        <span class="hint">размер узла = сколько правок тянет · клик — открыть в Госдуме</span>
      </div>
      <canvas id="gcanvas" width="1200" height="760"></canvas>
      <div class="graphnote">Сетка: связаны законопроекты, правящие один и тот же закон (${G.hubs.length} самых правимых законов, ${G.nodes.length} законопроектов, ${G.edges.length} связей). Наведи мышь — увидишь название.</div>
    </div>`;
  const canvas = document.getElementById("gcanvas");
  drawForceGraph(canvas, G);
}

function drawForceGraph(canvas, G) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const nodes = G.nodes.map((l, i) => ({
    l, x: W / 2 + Math.cos(i * 2.4) * (100 + i), y: H / 2 + Math.sin(i * 2.4) * (100 + i),
    vx: 0, vy: 0, deg: 0,
    col: l.a === "anti" ? "#e05555" : l.a === "pro" ? "#43b581" : "#5a6675",
  }));
  for (const [a, b] of G.edges) { nodes[a].deg++; nodes[b].deg++; }
  const maxDeg = Math.max(1, ...nodes.map(n => n.deg));
  const hubs = G.hubs.map((h, i) => {
    const a = (i / G.hubs.length) * Math.PI * 2;
    return {h, x: W / 2 + Math.cos(a) * W * 0.38, y: H / 2 + Math.sin(a) * H * 0.38};
  });
  // каждый узел тянется к хабу своего базового закона — получаются созвездия
  const hubOf = new Array(nodes.length).fill(-1);
  G.hubs.forEach((h, i) => nodes.forEach((n, j) => { if (n.l.b === h.base) hubOf[j] = i; }));

  function step() {
    const k = 2200;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const m = nodes[j];
        let dx = n.x - m.x, dy = n.y - m.y;
        let d2 = dx * dx + dy * dy || 1;
        if (d2 < 40000) {
          const f = k / d2;
          dx *= f; dy *= f;
          n.vx += dx; n.vy += dy; m.vx -= dx; m.vy -= dy;
        }
      }
      // притяжение к центру
      n.vx += (W / 2 - n.x) * 0.0008 * n.x / W * 4;
      n.vy += (H / 2 - n.y) * 0.0008 * n.y / H * 4;
      // притяжение к своему базовому закону
      const hi = hubOf[i];
      if (hi >= 0) {
        n.vx += (hubs[hi].x - n.x) * 0.006;
        n.vy += (hubs[hi].y - n.y) * 0.006;
      }
    }
    // хабы следуют за своими узлами
    for (let i = 0; i < hubs.length; i++) {
      let sx = 0, sy = 0, c = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (hubOf[j] === i) { sx += nodes[j].x; sy += nodes[j].y; c++; }
      }
      if (c) { hubs[i].x += (sx / c - hubs[i].x) * 0.05; hubs[i].y += (sy / c - hubs[i].y) * 0.05; }
    }
    for (const [a, b] of G.edges) {
      const n = nodes[a], m = nodes[b];
      const dx = m.x - n.x, dy = m.y - n.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 90) * 0.02;
      n.vx += dx / d * f; n.vy += dy / d * f;
      m.vx -= dx / d * f; m.vy -= dy / d * f;
    }
    for (const n of nodes) {
      n.vx *= 0.82; n.vy *= 0.82;
      n.x = Math.max(20, Math.min(W - 20, n.x + Math.max(-8, Math.min(8, n.vx))));
      n.y = Math.max(20, Math.min(H - 20, n.y + Math.max(-8, Math.min(8, n.vy))));
    }
  }

  // вьюпорт как в Obsidian: зум колесом, панорама перетаскиванием
  const vp = {z: 1, x: 0, y: 0};
  const toWorld = (px, py) => [(px - vp.x) / vp.z, (py - vp.y) / vp.z];
  let drag = null, moved = false, hover = null;

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(vp.z, 0, 0, vp.z, vp.x, vp.y);
    ctx.strokeStyle = "rgba(140,155,175,0.13)";
    ctx.lineWidth = 1 / vp.z;
    ctx.beginPath();
    for (const [a, b] of G.edges) {
      ctx.moveTo(nodes[a].x, nodes[a].y);
      ctx.lineTo(nodes[b].x, nodes[b].y);
    }
    ctx.stroke();
    ctx.font = "bold 12px Inter, system-ui";
    ctx.textBaseline = "middle";
    for (const h of hubs) {
      const label = h.h.label.length > 42 ? h.h.label.slice(0, 41) + "…" : h.h.label;
      const w = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(11,14,19,0.72)";
      ctx.fillRect(h.x - 5, h.y - 9, w + 10, 18);
      ctx.fillStyle = "#c9973a";
      ctx.fillText(label, h.x, h.y);
    }
    ctx.textBaseline = "alphabetic";
    for (const n of nodes) {
      const r = (2.6 + (n.deg / maxDeg) * 6.5) * (n === hover ? 1.6 : 1);
      ctx.fillStyle = n.col;
      ctx.globalAlpha = hover && n !== hover ? 0.55 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // подсказка поверх, в экранных координатах
    if (hover) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const tw = Math.min(W - 20, 430);
      const lines = wrap(ctx, audMark(hover.l) + " " + hover.l.t, tw - 16);
      const hgt = 12 + lines.length * 15;
      const bx = Math.min(hover.sx + 14, W - tw - 6), by = Math.max(4, hover.sy - 12);
      ctx.fillStyle = "rgba(14,17,22,0.96)";
      ctx.strokeStyle = "rgba(140,155,175,0.45)";
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, hgt, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e8edf4";
      lines.forEach((ln, i) => ctx.fillText(ln, bx + 8, by + 16 + i * 15));
    }
  }

  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    const [x, y] = toWorld(px, py);
    let best = null, bd = 160 / vp.z;
    for (const n of nodes) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    if (best) { best.sx = px; best.sy = py; }
    return {n: best, px, py};
  }

  function loop() {
    step();
    draw();
    graphRAF = requestAnimationFrame(loop);
  }
  loop();

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nz = Math.max(0.35, Math.min(5, vp.z * k));
    const f = nz / vp.z;
    vp.x = px - (px - vp.x) * f;
    vp.y = py - (py - vp.y) * f;
    vp.z = nz;
  }, {passive: false});

  canvas.addEventListener("mousedown", e => {
    const p = pick(e);
    drag = {px: p.px, py: p.py};
    moved = false;
  });
  window.addEventListener("mouseup", () => { drag = null; });
  canvas.addEventListener("mousemove", e => {
    const p = pick(e);
    if (drag) {
      const dx = p.px - drag.px, dy = p.py - drag.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      vp.x += dx; vp.y += dy;
      drag = {px: p.px, py: p.py};
      return;
    }
    hover = p.n;
    canvas.style.cursor = p.n ? "pointer" : "grab";
  });
  canvas.addEventListener("click", e => {
    if (moved) return;
    const p = pick(e);
    if (p.n) window.open(billUrl(p.n.l), "_blank", "noopener");
  });
}

function wrap(ctx, text, w) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const word of words) {
    const t = cur ? cur + " " + word : word;
    if (ctx.measureText(t).width > w && cur) { lines.push(cur); cur = word; }
    else cur = t;
    if (lines.length >= 4) break;
  }
  if (cur && lines.length < 5) lines.push(cur);
  return lines.slice(0, 5);
}

function stopGraph() {
  if (graphRAF) { cancelAnimationFrame(graphRAF); graphRAF = null; }
}

function syncTabs() {
  document.querySelectorAll("#audTabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.a === aud));
  document.querySelectorAll("#viewTabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.v === view));
}

document.getElementById("audTabs").addEventListener("click", e => {
  if (e.target.dataset.a) { aud = e.target.dataset.a; syncTabs(); render(); }
});
document.getElementById("viewTabs").addEventListener("click", e => {
  if (e.target.dataset.v) { view = e.target.dataset.v; syncTabs(); render(); }
});
let qTimer;
document.getElementById("q").addEventListener("input", e => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { query = e.target.value.trim(); render(); }, 250);
});

load();

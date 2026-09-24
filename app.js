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
   Детерминированная кластерная раскладка: каждый базовый закон — «созвездие»,
   законопроекты лежат вокруг него по спирали подсолнуха. Ноль физики —
   картинка всегда стабильная и читаемая. */
function buildGraphData() {
  const pool = LAWS.filter(l => l.b && match(l));
  const baseCount = {};
  for (const l of pool) baseCount[l.b] = (baseCount[l.b] || 0) + 1;
  const topBases = Object.entries(baseCount).sort((a, b) => b[1] - a[1]).slice(0, 48).map(e => e[0]);
  const clusters = topBases.map(base => ({
    base,
    count: baseCount[base],
    bills: pool.filter(l => l.b === base).sort((a, b) => dkey(b) - dkey(a)).slice(0, 6),
  }));
  return {clusters, baseCount};
}

function renderGraph(board) {
  const G = buildGraphData();
  const total = G.clusters.reduce((s, c) => s + c.bills.length, 0);
  const edges = G.clusters.reduce((s, c) => s + c.bills.length, 0);
  board.innerHTML = `
    <div class="graphwrap">
      <div class="graphlegend">
        <span><i class="dot red"></i>не для людей</span>
        <span><i class="dot green"></i>для людей</span>
        <span><i class="dot grey"></i>без оценки</span>
        <span class="hint">колесо — зум · тянуть — перемещать · клик по точке — открыть в Госдуме</span>
      </div>
      <canvas id="gcanvas" width="1240" height="820"></canvas>
      <div class="graphnote">Каждое созвездие — один базовый закон, точки вокруг — законопроекты, которые его правят (${G.clusters.length} самых правимых законов, ${total} законопроектов). Наведи — название, клик — карточка в Госдуме.</div>
    </div>`;
  drawClusterGraph(document.getElementById("gcanvas"), G);
}

function drawClusterGraph(canvas, G) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // --- раскладка: созвездия на сетке ---
  const cell = Math.max(...G.clusters.map(c => c.bills.length)) * 10 + 170;
  const cols = Math.ceil(Math.sqrt(G.clusters.length));
  const jitter = (str, amp) => {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000 / 1000 - 0.5) * 2 * amp;
  };
  const hubs = [];
  const nodes = [];  // {l, hx, hy (индекс хаба), ang, rad, phase, col}
  G.clusters.forEach((c, i) => {
    const gx = (i % cols) * cell + cell / 2;
    const gy = Math.floor(i / cols) * cell + cell / 2;
    const hx = gx + jitter(c.base, cell * 0.12);
    const hy = gy + jitter(c.base + "~", cell * 0.12);
    const R = 34 + Math.sqrt(c.bills.length) * 34;
    hubs.push({label: c.base, hx, hy, R, count: c.count,
               spin: (i % 2 ? 1 : -1) * (0.018 + 0.008 * (i % 3))});  // созвездия вращаются в разные стороны
    c.bills.forEach((l, k) => {
      nodes.push({l, hi: i, ang: k * 2.399963 + 0.7, rad: R * Math.sqrt((k + 0.6) / c.bills.length),
                  phase: (k * 1.7 + i) % 6.28,
                  col: l.a === "anti" ? "#e05555" : l.a === "pro" ? "#43b581" : "#5a6675"});
    });
  });
  const rows = Math.ceil(G.clusters.length / cols);
  const offX = (W - (cols - 0.2) * cell) / 2, offY = (H - (rows - 0.1) * cell) / 2;
  for (const h of hubs) { h.x = h.hx + offX; h.y = h.hy + offY; }
  for (const n of nodes) { n.hx = hubs[n.hi].hx + offX; n.hy = hubs[n.hi].hy + offY; }

  // --- вьюпорт: авто-fit, зум колесом, панорама ---
  const minX = Math.min(...hubs.map(h => h.hx)) - 150 + offX, maxX = Math.max(...hubs.map(h => h.hx)) + 150 + offX;
  const minY = Math.min(...hubs.map(h => h.hy)) - 80 + offY, maxY = Math.max(...hubs.map(h => h.hy)) + 110 + offY;
  const fitZ = Math.max(0.3, Math.min(2.2, Math.min(W / (maxX - minX), H / (maxY - minY))));
  const vp = {z: fitZ, x: (W - (maxX + minX) * fitZ) / 2, y: (H - (maxY + minY) * fitZ) / 2};
  const toWorld = (px, py) => [(px - vp.x) / vp.z, (py - vp.y) / vp.z];
  let drag = null, moved = false, hover = null;

  function nodePos(n, t) {
    // медленное орбитальное вращение + псевдо-глубина (z качается — точка «дышит» к камере)
    const a = n.ang + t * hubs[n.hi].spin;
    const z = Math.sin(t * 0.35 + n.phase);            // -1..1 глубина
    return {
      x: n.hx + Math.cos(a) * n.rad,
      y: n.hy + Math.sin(a) * n.rad * 0.92 + z * 3,
      z, scale: 1 + 0.28 * z, glow: 0.68 + 0.32 * (z + 1) / 2,
    };
  }

  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(vp.z, 0, 0, vp.z, vp.x, vp.y);
    // лучи к базам; под курсором — ярче только у выбранной точки
    ctx.lineWidth = 1 / vp.z;
    const hiHover = hover ? hover.hi : -1;
    nodes.forEach((n, i) => {
      const p = nodePos(n, t);
      const hot = i === nodes.indexOf(hover);
      ctx.strokeStyle = hot ? "rgba(232,163,61,0.9)"
        : n.col === "#5a6675" ? "rgba(120,135,155,0.20)"
        : n.col === "#e05555" ? "rgba(224,85,85,0.26)" : "rgba(67,181,129,0.30)";
      ctx.beginPath(); ctx.moveTo(hubs[n.hi].x, hubs[n.hi].y); ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    // узлы: размер и яркость от «глубины» — живой 3D-мерцательный слой
    nodes.forEach((n, i) => {
      const p = nodePos(n, t);
      const hot = i === nodes.indexOf(hover);
      const r = (5 + p.scale * 1.6) * (hot ? 1.7 : 1);
      ctx.globalAlpha = hot ? 1 : p.glow;
      if (hot) {
        ctx.strokeStyle = "#e8a33d"; ctx.lineWidth = 2 / vp.z;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 / vp.z, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = n.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    });
    // подписи созвездий с лёгким «дыханием»
    ctx.textAlign = "center";
    hubs.forEach((h, i) => {
      const bob = Math.sin(t * 0.6 + i * 1.3) * 2;
      const label = h.label.length > 38 ? h.label.slice(0, 37) + "…" : h.label;
      ctx.font = "bold 13px Inter, system-ui";
      const w = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(11,14,19,0.8)";
      ctx.fillRect(h.x - w / 2 - 6, h.y - 11 + bob, w + 12, 20);
      ctx.fillStyle = "#c9973a";
      ctx.fillText(label, h.x, h.y + 4 + bob);
    });
    ctx.textAlign = "left";
    // подсказка (экранные координаты, без затемнения сцены)
    if (hover) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const tw = Math.min(W - 20, 440);
      const lines = wrap(ctx, audMark(hover.l) + " " + hover.l.t, tw - 16);
      const hgt = 12 + lines.length * 15;
      const bx = Math.min(hover.sx + 14, W - tw - 6), by = Math.max(4, hover.sy - 14);
      ctx.fillStyle = "rgba(14,17,22,0.97)";
      ctx.strokeStyle = "rgba(232,163,61,0.6)";
      ctx.beginPath(); ctx.roundRect(bx, by, tw, hgt, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e8edf4";
      lines.forEach((ln, i) => ctx.fillText(ln, bx + 8, by + 16 + i * 15));
    }
  }

  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    const [x, y] = toWorld(px, py);
    const t = performance.now() / 1000;
    let best = null, bd = 160 / vp.z;
    nodes.forEach((n, i) => {
      const p = nodePos(n, t);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = {n: i, p}; }
    });
    if (best) { hover = nodes[best.n]; hover.sx = px; hover.sy = py; }
    else hover = null;
    return {px, py};
  }

  let graphRAF = null;
  function loop() {
    draw(performance.now() / 1000);
    graphRAF = requestAnimationFrame(loop);
  }
  loop();
  // отладочный крюк: принудительная подсветка узла (используется тестами)
  canvas.__setHover = i => { hover = nodes[i % nodes.length]; hover.sx = W / 2; hover.sy = H / 3; };

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nz = Math.max(0.3, Math.min(6, vp.z * k));
    const f = nz / vp.z;
    vp.x = px - (px - vp.x) * f;
    vp.y = py - (py - vp.y) * f;
    vp.z = nz;
  }, {passive: false});
  canvas.addEventListener("mousedown", e => {
    pick(e); drag = {px: e.clientX, py: e.clientY}; moved = false;
    canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mouseup", () => { drag = null; canvas.style.cursor = "grab"; });
  canvas.addEventListener("mousemove", e => {
    if (drag) {
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - drag.px) * (W / rect.width);
      const dy = (e.clientY - drag.py) * (H / rect.height);
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      vp.x += dx; vp.y += dy;
      drag = {px: e.clientX, py: e.clientY};
      return;
    }
    pick(e);
    canvas.style.cursor = hover ? "pointer" : "grab";
  });
  canvas.addEventListener("click", e => {
    if (moved || !hover) return;
    window.open(billUrl(hover.l), "_blank", "noopener");
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

function stopGraph() {}

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

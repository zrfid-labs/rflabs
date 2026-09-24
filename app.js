/* Законы РФ 2002–2026 — статический интерфейс. Данные: data/laws.json */
"use strict";

let LAWS = [];          // [{n,t,c,d,y,i,st,ev,ed,a,tp,w,b}]
let aud = "anti";       // вкладка аудитории: anti | pro | all
let view = "stage";     // вид: stage | year | topic | graph
let query = "";
let yearFilter = "";
let cycleTimer = null;
const PAGE = 12;        // карточек на колонку до «ещё»
const shown = {};       // счётчик доп. карточек на колонку
let graphRAF = null;    // анимация сетки

const STAGE_ORDER = ["Внесён","На рассмотрении","Принят Госдумой","Совет Федерации","У Президента","Опубликован (действует)","Архив"];
const STAGE_COLORS = {"Опубликован (действует)":"var(--green)","У Президента":"var(--blue)","Совет Федерации":"var(--blue)","Принят Госдумой":"var(--acc)","На рассмотрении":"var(--grey)","Внесён":"var(--grey)","Архив":"var(--line)"};

async function load() {
  const meta = await fetch("data/meta.json").then(r => r.json()).catch(() => ({}));
  document.getElementById("updated").textContent = meta.updated
    ? "обновлено: " + meta.updated.replace("T", " ") : "";
  try {
    LAWS = await fetch("data/laws.json").then(r => { if (!r.ok) throw 0; return r.json(); });
  } catch (e) {
    try {
      LAWS = await fetch("https://raw.githubusercontent.com/zrfid-labs/rflabs/main/data/laws.json")
        .then(r => { if (!r.ok) throw 0; return r.json(); });
      document.getElementById("updated").textContent += " · зеркало raw.githubusercontent";
    } catch (e2) {
      document.getElementById("tiles").innerHTML =
        `<div class="tile red" style="grid-column:1/-1"><div class="l">Не удалось загрузить данные. Зеркала: <a href="https://raw.githubusercontent.com/zrfid-labs/rflabs/main/index.html">raw.githubusercontent</a> · <a href="https://cdn.jsdelivr.net/gh/zrfid-labs/rflabs@main/index.html">jsDelivr</a> · страница проекта: <a href="https://github.com/zrfid-labs/rflabs">github.com/zrfid-labs/rflabs</a>. Попробуйте VPN.</div></div>`;
      return;
    }
  }
  const ys = LAWS.filter(l => l.y).map(l => l.y);
  if (ys.length) {
    const range = Math.max(2002, Math.min(...ys)) + "–" + Math.max(...ys);
    document.querySelector("h1 .muted").textContent = range;
    document.title = "Законы РФ " + range + ": для людей и не для людей";
  }
  renderTiles();
  renderFresh();
  render();
  initYearControls();
}

function initYearControls() {
  const sel = document.getElementById("yearSel");
  const years = [...new Set(LAWS.filter(l => l.y).map(l => l.y))].sort((a, b) => b - a);
  sel.innerHTML = `<option value="">все годы</option>` + years.map(y => `<option value="${y}">${y}</option>`).join("");
  sel.addEventListener("change", () => { stopCycle(); yearFilter = sel.value; render(); });
  document.getElementById("cycle").addEventListener("click", () => {
    if (cycleTimer) { stopCycle(); return; }
    let i = 0;
    cycleTimer = setInterval(() => {
      yearFilter = String(years[i % years.length]);
      sel.value = yearFilter;
      render();
      i++;
    }, 2500);
    document.getElementById("cycle").textContent = "⏸ стоп";
  });
}
function stopCycle() {
  if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
  document.getElementById("cycle").textContent = "▶ годы";
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
  if (yearFilter && String(l.y || "") !== yearFilter) return false;
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
  const cov = LAWS.filter(l => l.dg).length;
  tiles.push({n: `${cov}`, l: "разборов написано (растёт каждую ночь)", c: "gold", a: "all", v: "topic"});
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
  const chart = yearChartHtml();
  board.innerHTML = chart + `<div class="board">` + groups.map(([k, laws]) => {
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
  const digest = l.dg ? `<div class="dg">${l.dg.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("")}</div>` : "";
  return `<div class="card ${l.a}">
     <div class="crow"><span class="num"><a href="${billUrl(l)}" target="_blank" rel="noopener">${esc(l.n)}</a></span><span class="dt">${esc(l.d)}</span><span class="mark">${audMark(l)}</span></div>
     <div class="t">${esc(l.t)}</div>
     ${why}${note}
     <div class="more">${esc(l.ev || "")}${l.ed ? " · " + esc(l.ed) : ""}${l.i ? "<br>инициатор: " + esc(l.i) : ""}</div>
     ${digest}
     <a class="ext" href="${billUrl(l)}" target="_blank" rel="noopener">карточка в Госдуме →</a>
     <span class="tp">${esc(l.tp)}</span>
   </div>`;
}

/* ===== График принятых законов: линии по годам (2002→сегодня), всегда виден ===== */
function yearChartHtml() {
  const acts = LAWS.filter(l => l.st === "Опубликован (действует)" && l.y && l.y >= 2002 && l.a !== "unknown");
  const byYear = {};
  for (const l of acts) {
    byYear[l.y] = byYear[l.y] || {anti: 0, pro: 0};
    byYear[l.y][l.a]++;
  }
  const years = Object.keys(byYear).sort((a, b) => a - b);
  if (years.length < 2) return "";
  const W = 1000, H = 240, PADL = 36, PADR = 12, PADT = 14, PADB = 26;
  const max = Math.max(4, ...years.map(y => byYear[y].anti + byYear[y].pro));
  const x = i => PADL + i * (W - PADL - PADR) / (years.length - 1);
  const y = v => H - PADB - v * (H - PADT - PADB) / max;
  const line = key => years.map((yr, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(byYear[yr][key]).toFixed(1)}`).join(" ");
  const dots = key => years.map((yr, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(byYear[yr][key]).toFixed(1)}" r="3" fill="${key === "anti" ? "#e05555" : "#43b581"}"><title>${yr}: 🔴 ${byYear[yr].anti} / 🟢 ${byYear[yr].pro}</title></circle>`).join("");
  const grid = [0.25, 0.5, 0.75, 1].map(f =>
    `<line x1="${PADL}" x2="${W - PADR}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="rgba(140,155,175,0.15)"/><text x="4" y="${y(max * f) + 4}" fill="#8b98a9" font-size="10">${Math.round(max * f)}</text>`).join("");
  const ylabels = years.map((yr, i) =>
    (yr % 5 === 0 || i === years.length - 1)
      ? `<text x="${x(i)}" y="${H - 8}" fill="#8b98a9" font-size="10" text-anchor="middle">${yr}</text>` : "").join("");
  const lastYear = years[years.length - 1];
  return `<div class="statwrap">
    <div class="clegend"><b>📊 Принятые и действующие законы по годам</b>
      <span class="lg"><i class="dot red"></i>против</span><span class="lg"><i class="dot green"></i>за людей</span>
      <span class="hint">наведи на точку — цифры года</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:230px">
      ${grid}
      <path d="${line("anti")}" fill="none" stroke="#e05555" stroke-width="2.2"/>
      <path d="${line("pro")}" fill="none" stroke="#43b581" stroke-width="2.2"/>
      ${dots("anti")}${dots("pro")}
      <line x1="${PADL}" x2="${W - PADR}" y1="${H - PADB}" y2="${H - PADB}" stroke="rgba(140,155,175,0.4)"/>
      ${ylabels}
    </svg>
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

  // ===== настоящее 3D: сцена-галактика с перспективой =====
  const hubs = [], nodes = [];
  const NH = G.clusters.length;
  const jitter3 = (str, amp) => {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000 / 1000 - 0.5) * 2 * amp;
  };
  G.clusters.forEach((c, i) => {
    const rr = 420 * Math.sqrt((i + 0.5) / NH);
    const th = i * 2.399963;
    const hx = rr * Math.cos(th), hz = rr * Math.sin(th), hy = jitter3(c.base, 90);
    hubs.push({label: c.base, x: hx, y: hy, z: hz, count: c.count,
               spin: (i % 2 ? 1 : -1) * (0.05 + 0.02 * (i % 3))});
    const R = 60 + Math.sqrt(c.bills.length) * 42;
    c.bills.forEach((l, k) => {
      const y = 1 - (k + 0.5) / c.bills.length * 2;
      const r = Math.sqrt(1 - y * y);
      const a = k * 2.399963;
      nodes.push({l, hi: i,
        x: R * r * Math.cos(a), y: R * y, z: R * r * Math.sin(a),
        col: l.a === "anti" ? "#e05555" : l.a === "pro" ? "#43b581" : "#5a6675"});
    });
  });

  // камера: авто-вращение, докрутка мышью, зум колесом
  let yaw = 0.6, pitch = 0.42, zoom = 1.15, auto = true;
  const FOV = 1400, CX = W / 2, CY = H / 2;

  function project(x, y, z) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let X = x * cy - z * sy, Z = x * sy + z * cy;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    let Y2 = y * cp - Z * sp, Z2 = y * sp + Z * cp;
    const s = FOV / (FOV + Z2);
    return {sx: CX + X * s * zoom * 1.35, sy: CY + Y2 * s * zoom * 1.35, s, depth: Z2};
  }

  let drag = null, moved = false, hover = null;
  let screenPos = [];   // экранные позиции узлов текущего кадра

  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const hubsP = hubs.map((h, i) => {
      const bob = Math.sin(t * 0.6 + i * 1.3) * 4;
      const p = project(h.x, h.y + bob, h.z);
      return {...h, p, i};
    });
    const nodesP = nodes.map((n, i) => {
      const h = hubs[n.hi];
      const a = t * h.spin;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = n.x * ca - n.z * sa, z = n.x * sa + n.z * ca;
      const p = project(h.x + x, h.y + n.y, h.z + z);
      return {...n, p, i};
    });
    screenPos = nodesP.map(n => [n.p.sx, n.p.sy]);
    const all = [
      ...hubsP.map(h => ({kind: "hub", ...h})),
      ...nodesP.map(n => ({kind: "node", ...n})),
    ].sort((a, b) => b.p.depth - a.p.depth);

    ctx.lineWidth = 1;
    nodesP.forEach(n => {
      const h = hubs[n.hi];
      const a1 = project(h.x, h.y, h.z);
      ctx.strokeStyle = nodes[n.i] === hover
        ? "rgba(232,163,61,0.95)"
        : n.col === "#5a6675" ? "rgba(120,135,155,0.16)"
        : n.col === "#e05555" ? "rgba(224,85,85,0.22)" : "rgba(67,181,129,0.26)";
      ctx.beginPath();
      ctx.moveTo(a1.sx, a1.sy);
      ctx.lineTo(n.p.sx, n.p.sy);
      ctx.stroke();
    });

    for (const o of all) {
      const near = Math.max(0, Math.min(1, 1 - o.p.depth / 900));
      if (o.kind === "hub") {
        const size = 9 * o.p.s * zoom;
        ctx.globalAlpha = 0.25 + 0.55 * near;
        ctx.fillStyle = "#c9973a";
        ctx.beginPath(); ctx.arc(o.p.sx, o.p.sy, Math.max(2, size * 0.35), 0, 7); ctx.fill();
        if (o.p.depth < 250) {
          const label = o.label.length > 40 ? o.label.slice(0, 39) + "…" : o.label;
          ctx.font = "bold " + Math.max(9, 13 * o.p.s * zoom * 0.9) + "px Inter, system-ui";
          ctx.textAlign = "center";
          const w = ctx.measureText(label).width;
          ctx.fillStyle = "rgba(11,14,19,0.75)";
          ctx.fillRect(o.p.sx - w / 2 - 5, o.p.sy - size * 0.35 - 21, w + 10, 17);
          ctx.fillStyle = "#c9973a";
          ctx.globalAlpha = 0.45 + 0.55 * near;
          ctx.fillText(label, o.p.sx, o.p.sy - size * 0.35 - 8);
          ctx.textAlign = "left";
        }
      } else {
        const hot = nodes[o.i] === hover;
        const r = (3.4 + 2.2 * near) * o.p.s * zoom * (hot ? 1.8 : 1);
        ctx.globalAlpha = hot ? 1 : 0.35 + 0.65 * near;
        if (hot) {
          ctx.strokeStyle = "#e8a33d"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(o.p.sx, o.p.sy, r + 4, 0, 7); ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = o.col;
        ctx.beginPath(); ctx.arc(o.p.sx, o.p.sy, r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (hover) {
      const hp = nodesP[nodes.indexOf(hover)];
      if (hp) { hover.sx = hp.p.sx; hover.sy = hp.p.sy; }
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
    let best = null, bd = 200;
    screenPos.forEach(([sx, sy], i) => {
      const d = (sx - px) ** 2 + (sy - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    hover = best === null ? null : nodes[best];
    return {px, py};
  }

  function loop() {
    if (auto && !drag) yaw += 0.0018;
    draw(performance.now() / 1000);
    requestAnimationFrame(loop);
  }
  loop();

  canvas.__setHover = i => { hover = nodes[i % nodes.length]; };

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    zoom = Math.max(0.4, Math.min(4, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  }, {passive: false});
  canvas.addEventListener("mousedown", e => { drag = {x: e.clientX, y: e.clientY}; moved = false; canvas.style.cursor = "grabbing"; });
  window.addEventListener("mouseup", () => { drag = null; canvas.style.cursor = "grab"; });
  canvas.addEventListener("mousemove", e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; auto = false; }
      yaw += dx * 0.005;
      pitch = Math.max(-0.7, Math.min(0.9, pitch + dy * 0.004));
      drag = {x: e.clientX, y: e.clientY};
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

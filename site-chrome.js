/* Общий каркас для внутренних страниц: плитки-счётчики + свежие законопроекты.
   Требует в разметке: #tiles и #fresh */
"use strict";
function escC(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

async function renderChrome() {
  const meta = await fetch("data/meta.json").then(r => r.json()).catch(() => ({}));
  const up = document.getElementById("updated");
  if (up && meta.updated) up.textContent = "обновлено: " + meta.updated.replace("T", " ");
  let LAWS = [];
  try { LAWS = await fetch("data/laws.json").then(r => r.json()); } catch (e) { return; }

  const acts = LAWS.filter(l => l.st === "Опубликован (действует)");
  const inwork = LAWS.filter(l => l.st !== "Архив" && l.st !== "Опубликован (действует)");
  const anti = LAWS.filter(l => l.a === "anti");
  const pro = LAWS.filter(l => l.a === "pro");
  const tiles = [
    {n: acts.length, l: "принято и действует законов", c: "green"},
    {n: inwork.length, l: "на рассмотрении / внесено сейчас", c: "blue"},
    {n: anti.length, l: "всего «не для людей»", c: "red"},
    {n: pro.length, l: "всего «для людей»", c: "gold"},
  ];
  const cov = LAWS.filter(l => l.dg).length;
  tiles.push({n: cov, l: "разборов написано (растёт каждую ночь)", c: "gold"});
  const tilesEl = document.getElementById("tiles");
  if (tilesEl) tilesEl.innerHTML = tiles.map(t =>
    `<div class="tile ${t.c}"><div class="n">${t.n.toLocaleString("ru")}</div><div class="l">${t.l}</div></div>`).join("");

  function dkey(l) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(l.d || "");
    return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0;
  }
  const fresh = [...LAWS].filter(l => l.d).sort((a, b) => dkey(b) - dkey(a)).slice(0, 30);
  const freshEl = document.getElementById("fresh");
  if (freshEl) freshEl.innerHTML = fresh.map(l =>
    `<a class="chip" href="https://sozd.duma.gov.ru/bill/${escC(l.n)}" target="_blank" rel="noopener">
      <div class="d">${escC(l.d)} · ${l.a === "anti" ? "🔴" : l.a === "pro" ? "🟢" : "⚪"}</div>
      <div class="t">${escC(l.t)}</div></a>`).join("");
}

renderChrome();

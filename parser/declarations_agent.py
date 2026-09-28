# -*- coding: utf-8 -*-
"""
Декларации-агент: доходы депутатов Госдумы из официальных деклараций
(агрегатор declarator.org, данные — официальные декларации с сайта Госдумы).

Инкрементально: за ночь обрабатывает до N персон, кеш в data/declarations_cache.json.
Результат: data/declarations.json -> блок «Доходы депутатов» на сайте.
"""
import json
import os
import re
import subprocess
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASE = "https://declarator.org"
CACHE = os.path.join(ROOT, "data", "declarations_cache.json")
OUT = os.path.join(ROOT, "data", "declarations.json")
PER_NIGHT = 25
PAUSE = 2.5


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"})
    data = urllib.request.urlopen(req, timeout=40).read()
    return data.decode("utf-8", errors="replace")


def cell(td):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", td)).strip()


def parse_person(html, pid, url):
    """Возвращает {'name':..., 'rows':[{year,label,income,realty,transport}]}"""
    t = re.search(r"<title>\s*([^<-]+)", html)
    name = (t.group(1) if t else pid).strip()
    i = html.find("Доход, руб.")
    if i < 0:
        return None
    tbl_start = html.rfind("<table", 0, i)
    tbl = html[tbl_start:html.find("</table>", i)]
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S):
        tds = [cell(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) < 2 or "Скрыть" in tds[0]:
            continue
        ym = re.search(r"(20\d\d)", tds[0])
        inc = re.search(r"([\d\s]+)(?:[.,](\d\d))?\s*руб", tds[1]) if len(tds) > 1 else None
        if not (ym and inc):
            continue
        income = int(inc.group(1).replace(" ", "") + (inc.group(2) or ""))
        realty = re.search(r"([\d\s]+)\s*м2", tds[2]) if len(tds) > 2 else None
        rows.append({"year": int(ym.group(1)), "label": tds[0][:60],
                     "income": income,
                     "realty_m2": int(realty.group(1).replace(" ", "")) if realty else 0,
                     "transport": (re.search(r"(\d+)\s*шт", tds[3]).group(1) if len(tds) > 3 and re.search(r"(\d+)\s*шт", tds[3]) else "0")})
    if not rows:
        return None
    return {"name": name, "url": url, "rows": rows}


def main():
    limit = int(os.environ.get("DECL_LIMIT", PER_NIGHT))
    html = get(BASE + "/office/14/")
    persons = sorted(set(re.findall(r'href="(/person/\d+/)"', html)))
    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE, encoding="utf-8"))
    todo = [p for p in persons if p not in cache][:limit]
    print("депутатов найдено:", len(persons), "| обработано ранее:", len(cache), "| к обработке:", len(todo))

    out = {}
    if os.path.exists(OUT):
        out = json.load(open(OUT, encoding="utf-8"))

    done = 0
    for p in todo:
        url = BASE + p
        try:
            html = get(url)
            d = parse_person(html, p, url)
            if d:
                cache[p] = {"name": d["name"]}
                out[d["name"]] = d
                done += 1
                print("  ✓", d["name"][:40], "лет:", len(d["rows"]))
            else:
                cache[p] = {"name": "(нет данных доходов)"}
                print("  –", p, "нет таблицы доходов")
        except Exception as e:
            print("  !", p, "ошибка:", e)
            time.sleep(20)
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False)
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        time.sleep(PAUSE)
    print("готово: обработано за прогон:", done, "| всего депутатов в базе:", len(out))


if __name__ == "__main__":
    main()

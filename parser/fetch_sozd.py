# -*- coding: utf-8 -*-
"""
Парсер СОЗД Госдумы (sozd.duma.gov.ru).
Обходит все созывы (2..8 = 2000..2026), собирает законопроекты
и складывает в data/laws_raw.json. Только стандартная библиотека.

Запуск: python parser/fetch_sozd.py [--convocations 2,3,4,5,6,7,8]
"""
import argparse
import gzip
import io
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

BASE = "https://sozd.duma.gov.ru"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def http_get(url, referer=None, xhr=True, retries=3):
    headers = {"User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9"}
    if xhr:
        headers["X-Requested-With"] = "XMLHttpRequest"
        headers["Accept"] = "text/html, */*; q=0.01"
        headers["Referer"] = referer or (BASE + "/oz")
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            resp = opener.open(req, timeout=120)
            data = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip":
                data = gzip.GzipFile(fileobj=io.BytesIO(data)).read()
            return data.decode("utf-8", errors="replace")
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def unescape(t):
    return (t.replace("&quot;", '"').replace("&amp;", "&")
             .replace("&laquo;", "«").replace("&raquo;", "»")
             .replace("&nbsp;", " ").replace("&mdash;", "—")
             .replace("&hellip;", "…").replace("&rsquo;", "'")
             .replace("&ldquo;", "«").replace("&rdquo;", "»").replace("&#39;", "'"))


def strip_tags(h):
    t = re.sub(r"<script.*?</script>", "", h, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def fetch_table(conv, page, count_items=500):
    url = (f"{BASE}/oz?b%5BConvocation%5D%5B0%5D={conv}"
           f"&count_items={count_items}&page={page}")
    html = http_get(url)
    # ищем таблицу с законопроектами (внутри есть ссылки /bill/)
    for m in re.finditer(r"tbl_search_results", html):
        i = m.start()
        j = html.find("</table>", i)
        tbl = html[i:j]
        if "/bill/" in tbl:
            return re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S)
    return []


def parse_row(row):
    tds = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
    if len(tds) < 5 or "/bill/" not in tds[1]:
        return None
    cell = tds[1]
    num = None
    m = re.search(r'data-law_number="([^"]+)"', cell) or re.search(r'href="/bill/([^"]+)"', cell)
    if m:
        num = m.group(1)
    m = re.search(r'class="fw500">(.*?)</div>', cell, re.S)
    title = strip_tags(m.group(1)) if m else strip_tags(cell)
    m = re.search(r'<span class="ico_arhiv">(.*?)</span>', cell, re.S)
    status = strip_tags(m.group(1)) if m else ""
    # комментарий в скобках после названия
    m = re.search(r'class="fw500">.*?</div>\s*(?:\((.*?)\))?\s*</div>', cell, re.S)
    comment = ""
    if m and m.group(1):
        comment = strip_tags(m.group(1))
    intro_date = strip_tags(tds[2])
    initiator = strip_tags(tds[3])
    stage = strip_tags(tds[4])
    stage_date = strip_tags(tds[5]) if len(tds) > 5 else ""
    if not num:
        return None
    return {
        "number": num,
        "title": title,
        "comment": comment,
        "status": status,
        "intro_date": intro_date,
        "initiator": initiator,
        "stage_raw": stage,
        "stage_date": stage_date,
        "url": BASE + "/bill/" + num,
    }


def crawl_convocation(conv, count_items=500, sleep_s=1.5, max_pages=200):
    # первичный визит — получаем cookie балансировщика
    http_get(BASE + "/oz", xhr=False)
    bills = {}
    page = 1
    while page <= max_pages:
        rows = fetch_table(conv, page, count_items)
        new = 0
        for r in rows:
            b = parse_row(r)
            if b and b["number"] not in bills:
                b["convocation"] = conv
                bills[b["number"]] = b
                new += 1
        print(f"  созыв {conv} стр.{page}: строк {len(rows)}, новых {new}, всего {len(bills)}", flush=True)
        if len(rows) == 0 or new == 0:
            break
        page += 1
        time.sleep(sleep_s)
    return list(bills.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--convocations", default="2,3,4,5,6,7,8")
    ap.add_argument("--out", default=os.path.join("data", "laws_raw.json"))
    args = ap.parse_args()
    convs = [int(c) for c in args.convocations.split(",") if c.strip()]
    all_bills = []
    for conv in convs:
        print(f"== Созыв {conv}", flush=True)
        all_bills.extend(crawl_convocation(conv))
    out = os.path.join(os.path.dirname(__file__), "..", args.out)
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_bills, f, ensure_ascii=False)
    print(f"ИТОГО: {len(all_bills)} законопроектов -> {out}", flush=True)


if __name__ == "__main__":
    main()

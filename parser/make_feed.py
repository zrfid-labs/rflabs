# -*- coding: utf-8 -*-
"""Автономный RSS-фид свежих анти-законопроектов (без ключей и ботов)."""
import json, re, html

laws = json.load(open("data/laws.json", encoding="utf-8"))
def fresh(l):
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", l.get("d", ""))
    return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else (0, 0, 0)
items = sorted((l for l in laws if l["a"] == "anti" and l["st"] != "Архив"),
               key=fresh, reverse=True)[:50]
BASE = "https://zrfid-labs.github.io/rflabs/"
out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<rss version="2.0"><channel>',
       '<title>Законы РФ «не для людей» — новые</title>',
       f'<link>{BASE}</link>',
       '<description>Свежие анти-законопроекты Госдумы. Автообновление.</description>']
for l in items:
    why = html.escape((l.get("w") or [""])[0])
    out.append(f"<item><title>{html.escape(l['t'][:120])}</title>"
               f"<link>https://sozd.duma.gov.ru/bill/{l['n']}</link>"
               f"<guid>{l['n']}</guid>"
               f"<description>{html.escape(l['d'])} — {why}</description></item>")
out.append("</channel></rss>")
open("feed.xml", "w", encoding="utf-8").write("\n".join(out))
print("feed.xml:", len(items), "записей")

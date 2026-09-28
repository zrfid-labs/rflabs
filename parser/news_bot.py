# -*- coding: utf-8 -*-
"""
Новости-бот: тянет RSS СМИ, отбирает новости про законы/штрафы/сборы,
LLM (бесплатный, без ключей) помечает «абсурд дня». Результат — data/news.json
(только заголовки, краткие описания и ссылки на первоисточник — законно).
"""
import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FEEDS = {
    "Lenta.ru": "https://lenta.ru/rss/news",
    "РИА Новости": "https://ria.ru/export/rss2/archive/index.xml",
    "Коммерсантъ": "https://www.kommersant.ru/RSS/news.xml",
    "ТАСС": "https://tass.ru/rss/v2.xml",
}

SPORT_RE = re.compile(
    r"футбол|хоккей|теннис|олимпиад|чемпионат|сборн[а-яё]|олимпийск|кубок мира|"
    r"матч[а-яё]*\s|тренер|вратар|нападающ|полузащит|фигурн|лыжн|хоккеист|футболист",
    re.I)

LAW_WORDS = re.compile(
    r"закон|законопроект|госдум|дум[аеу]|штраф|налог|пошлин|сбор(?!ной)|запрет|минфин|"
    r"минцифры|госдума|депутат|принят|парламент|правительств|указ|постановлен|регулятор",
    re.I)

ABSURD_HINT = re.compile(
    r"обязат|запретят|запрет[илии]|оштраф|штраф[ау]|разрешат|приравня|запрещ|"
    r"предложил(и)? (запретить|обложить|оштрафовать)|накажут|наказани", re.I)

API = "https://text.pollinations.ai/openai"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=25).read()


def parse_feed(name, xml_bytes):
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        # некоторые фиды с BOM/мусором — чистим
        clean = re.sub(rb"^[^<]*", b"", xml_bytes)
        try:
            root = ET.fromstring(clean)
        except Exception:
            return []
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        desc = (it.findtext("description") or "").strip()
        date = (it.findtext("pubDate") or "").strip()
        if title and link:
            items.append({"source": name, "title": title,
                          "link": link, "desc": desc[:300], "date": date})
    return items


def ask_absurd(title):
    try:
        body = json.dumps({
            "model": "openai",
            "messages": [
                {"role": "system", "content":
                 "Ты редактор. Тебе дают заголовок новости о законодательстве РФ. "
                 "Ответь строго JSON: {\"absurd\": 0-10, \"tag\":\"короткая метка 2-4 слова\"}. "
                 "absurd — насколько история абсурдна/комична по отношению к гражданам (0=обычная новость, 10=полный абсурд). "
                 "Без markdown, только JSON."},
                {"role": "user", "content": title},
            ],
            "temperature": 0.2,
        }).encode()
        req = urllib.request.Request("https://text.pollinations.ai/openai", data=body,
                                     headers={"Content-Type": "application/json",
                                              "User-Agent": "Mozilla/5.0"})
        data = json.load(urllib.request.urlopen(req, timeout=60))
        msg = (data.get("choices") or [{}])[0].get("message", {})
        text = (msg.get("content") or "").strip()
        m = re.search(r"\{[^}]*\}", text, re.S)
        if not m:
            return None
        j = json.loads(m.group(0))
        return {"absurd": int(j.get("absurd", 0)), "tag": str(j.get("tag", ""))[:60]}
    except Exception:
        return None


def main():
    out = []
    seen = set()
    for name, url in FEEDS.items():
        try:
            items = parse_feed(name, fetch(url))
        except Exception as e:
            print(name, "ошибка:", e)
            continue
        law_items = [i for i in items
                     if LAW_WORDS.search(i["title"] + " " + i["desc"])
                     and not SPORT_RE.search(i["title"])]
        for i in law_items:
            k = i["link"]
            if k not in seen:
                seen.add(k)
                i["absurd"] = None
                i["tag"] = ""
                out.append(i)
        print(name, "новостей всего:", len(items), "| про законы:", len(law_items))
    dst = os.path.join(ROOT, "data", "news.json")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    # кеш оценок: накапливается между ночами, ничего не теряется
    cache_path = os.path.join(ROOT, "data", "news_absurd_cache.json")
    cache = {}
    if os.path.exists(cache_path):
        cache = json.load(open(cache_path, encoding="utf-8"))
    for i in out:
        if i["link"] in cache:
            i["absurd"] = cache[i["link"]]["absurd"]
            i["tag"] = cache[i["link"]]["tag"]
    # LLM размечает только неразмеченные (до 12 за ночь)
    todo = [i for i in out if i["absurd"] is None][:12]
    for i in todo:
        r = ask_absurd(i["title"])
        if r:
            i["absurd"] = r["absurd"]
            i["tag"] = r["tag"]
            cache[i["link"]] = {"absurd": r["absurd"], "tag": r["tag"]}
        time.sleep(1)
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    # выбрасываем спорт и прочий мусор, который бот сам пометил
    out = [i for i in out if "спорт" not in (i.get("tag") or "").lower()]
    out.sort(key=lambda x: -(x["absurd"] if x["absurd"] is not None else -1))
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)
    print("итог новостей:", len(out), "| оценок в кеше:", len(cache), "->", dst)


if __name__ == "__main__":
    main()

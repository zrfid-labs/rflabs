# -*- coding: utf-8 -*-
"""
Разбор законопроектов «как в телеграм-канале»: скачивает пояснительную записку
с СОЗД и просит бесплатный LLM (без ключей) написать человеческий разбор:
суть простыми словами -> на кого бьёт/что даёт -> цифры -> последствия.

Кеш: data/digests.json {номер: разбор}. Запуск:
  python parser/digest.py --max-bills 40   (останавливается по Ctrl+C сам)
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from fetch_sozd import http_get  # тот же http-клиент с cookie/ретраями

API = "https://text.pollinations.ai/openai"
MODEL = "openai"

SYSTEM = (
    "Ты юрист-журналист, пишешь разборы российского законодательства для обычных людей "
    "в стиле телеграм-канала. Тебе дают текст пояснительной записки к законопроекту. "
    "Напиши разбор строго по фактам из текста, без выдумок, на русском:\n"
    "1) СУТЬ — что именно меняет законопроект, простыми словами (2-3 предложения);\n"
    "2) КОГО КАСАЕТСЯ — на кого бьёт или кому что даёт, конкретно;\n"
    "3) ЦИФРЫ И СРОКИ — суммы, ставки, даты, если они есть в тексте;\n"
    "4) ПОСЛЕДСТВИЯ — что это изменит для обычного человека.\n"
    "Формат: короткие абзацы, каждое начало с 1-2 слов заголовка через тире. "
    "До 170 слов. Если в записке чего-то нет — не придумывай, просто опусти этот пункт."
)


def extract_docx(data):
    if data[:2] != b"PK":
        return None
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        xml = z.read("word/document.xml").decode("utf-8", errors="replace")
    except Exception:
        return None
    text = re.sub(r"<[^>]+>", " ", xml)
    return re.sub(r"\s+", " ", text).strip()


def fetch_note_text(number):
    """Скачать пояснительную записку (или текст законопроекта) с СОЗД."""
    html = http_get("https://sozd.duma.gov.ru/bill/" + number)
    blocks = re.findall(
        r'href="/download/([0-9a-f-]{36})"(?:(?!href=).)*?doc_wrap">\s*([^<]{3,120})',
        html, re.S)
    docs = {}
    for u, n in blocks:
        docs.setdefault(n.strip(), u)
    pref = next((u for n, u in docs.items() if n.startswith("Пояснительная записка")),
                docs.get(next((n for n in docs if n.startswith("Текст внесенного")), "")))
    if not pref:
        return None
    req = urllib.request.Request("https://sozd.duma.gov.ru/download/" + pref,
                                 headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=120).read()
    return extract_docx(data)


def ask_digest(text, attempts=3):
    last = None
    for _ in range(attempts):
        try:
            return _ask_digest_once(text)
        except Exception as e:
            last = e
            time.sleep(20)
    raise last


def _ask_digest_once(text):
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": text[:12000]},
        ],
        "temperature": 0.2,
    }).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    data = json.load(urllib.request.urlopen(req, timeout=180))
    msg = (data.get("choices") or [{}])[0].get("message", {})
    out = (msg.get("content") or msg.get("reasoning_content") or "").strip()
    if len(out) < 60:
        raise ValueError("пустой разбор")
    return out[:2200]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-bills", type=int, default=40)
    ap.add_argument("--sleep", type=float, default=4.0)
    args = ap.parse_args()

    laws = json.load(open(os.path.join(ROOT, "data", "laws.json"), encoding="utf-8"))
    dig_path = os.path.join(ROOT, "data", "digests.json")
    digests = {}
    if os.path.exists(dig_path):
        digests = json.load(open(dig_path, encoding="utf-8"))

    def fresh(l):
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", l.get("d", ""))
        return int(m.group(3) + m.group(2) + m.group(1)) if m else 0

    def prio(l):
        # 0 — в работе (скоро станут законами), 1 — действует, 2 — внесён/архив
        if l["st"] in ("На рассмотрении", "Принят Госдумой", "Совет Федерации", "У Президента"):
            return 0
        if l["st"] == "Опубликован (действует)":
            return 1
        return 2
    vis = [l for l in laws if l["a"] in ("anti", "pro") and l["n"] not in digests]
    vis.sort(key=lambda l: (prio(l), -fresh(l)))
    todo = vis[: args.max_bills]
    from collections import Counter
    by_group = Counter(prio(l) for l in todo)
    print(f"к разбору: {len(todo)} (в работе: {by_group[0]}, действует: {by_group[1]}, прочее: {by_group[2]})")

    err = 0
    for i, l in enumerate(todo):
        try:
            note = fetch_note_text(l["n"])
            if not note or len(note) < 200:
                print(f"  [{i+1}] {l['n']}: нет текста записки, пропускаю", flush=True)
                digests[l["n"]] = None
                continue
            digests[l["n"]] = ask_digest(note)
            print(f"  [{i+1}] {l['n']}: разбор готов ({len(digests[l['n']])} симв.)", flush=True)
        except Exception as e:
            err += 1
            wait = min(240, 30 * 2 ** (err - 1))
            print(f"  [{i+1}] {l['n']}: ошибка: {e} — ждём {wait}с", flush=True)
            if err >= 8:
                print("8 ошибок подряд — сохраняюсь и выхожу")
                break
            time.sleep(wait)
            continue
        with open(dig_path, "w", encoding="utf-8") as f:
            json.dump(digests, f, ensure_ascii=False)
        time.sleep(args.sleep)
    with open(dig_path, "w", encoding="utf-8") as f:
        json.dump(digests, f, ensure_ascii=False)
    print(f"готово: разборов {sum(1 for v in digests.values() if v)}, всего в кеше {len(digests)}")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""
Умная разметка законопроектов бесплатным LLM БЕЗ ключей и регистрации
(Pollinations — открытый шлюз к open-моделям, endpoint /openai).

Размечает только то, что словарь правил не смог (audience == unknown).
Результат кешируется в data/llm_labels.json и накапливается между запусками:
сегодня разметили N, завтра — следующие N, за пару недель весь архив.

Запуск: python parser/llm_classify.py [--max-requests 120] [--batch 12]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API = "https://text.pollinations.ai/openai"
MODEL = "openai"  # модель по умолчанию на шлюзе

SYSTEM = (
    "Ты юрист-аналитик российского законодательства. Тебе дают список законопроектов "
    "с номером, названием и пояснением. Критерий оценки:\n"
    "- anti — человек отдаёт государству и не получает эквивалента: налоги, сборы, "
    "пошлины, поборы, штрафы, надзор, ограничения прав, новые обязанности, платность.\n"
    "- pro — человек реально получает благо: выплаты, индексация, льготы, бесплатные "
    "услуги, гарантии, защита прав, отмена/снижение платежей.\n"
    "- unknown — по одному заголовку честно не определить.\n"
    "Ответь ТОЛЬКО JSON-массив вида "
    '[{"n":"номер","a":"anti|pro|unknown","why":"суть в 3-8 словах по-русски"}]. '
    "Без markdown, без пояснений."
)


def ask(batch):
    """Один запрос к шлюзу: batch — список законов. Возвращает список меток."""
    lines = "\n".join(
        f'{i+1}. n="{b["n"]}" | {b["t"]}' + (f' | {b["c"]}' if b.get("c") else "")
        for i, b in enumerate(batch)
    )
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": lines},
        ],
        "temperature": 0.1,
    }).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    })
    data = json.load(urllib.request.urlopen(req, timeout=180))
    msg = (data.get("choices") or [{}])[0].get("message", {})
    text = msg.get("content") or msg.get("reasoning_content") or ""
    if not text.strip():
        raise ValueError("пустой ответ модели")
    m = re.search(r"\[.*\]", text, re.S)
    raw = m.group(0) if m else None
    if not raw and text.lstrip().startswith("["):
        # шлюз иногда рубит ответ по лимиту токенов — достраиваем скобку
        raw = text.lstrip() + "]"
        raw = raw[: raw.rfind("}") + 1] + "]"
    if not raw:
        raise ValueError("нет JSON-массива в ответе: " + text[:120])
    out = {}
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        items = []
        for mm in re.finditer(r"\{[^{}]*\}", raw):   # спасаем целые объекты
            try:
                items.append(json.loads(mm.group(0)))
            except json.JSONDecodeError:
                pass
    for item in items:
        n = str(item.get("n", "")).strip()
        a = str(item.get("a", "")).strip().lower()
        why = str(item.get("why", "")).strip()[:100]
        if n and a in ("anti", "pro", "unknown"):
            out[n] = {"a": a, "why": why}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-requests", type=int, default=120)
    ap.add_argument("--batch", type=int, default=6)
    ap.add_argument("--sleep", type=float, default=4.0)
    args = ap.parse_args()

    with open(os.path.join(ROOT, "data", "laws.json"), encoding="utf-8") as f:
        laws = json.load(f)
    labels_path = os.path.join(ROOT, "data", "llm_labels.json")
    labels = {}
    if os.path.exists(labels_path):
        with open(labels_path, encoding="utf-8") as f:
            labels = json.load(f)

    def fresh(l):
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", l.get("d", ""))
        return int(m.group(3) + m.group(2) + m.group(1)) if m else 0
    vis = [l for l in laws if l["a"] in ("anti", "pro") and l["n"] not in labels]
    unk = [l for l in laws if l["a"] == "unknown" and l["n"] not in labels]
    vis.sort(key=fresh, reverse=True)
    todo = (vis + unk)[: args.max_requests * args.batch]
    print(f"всего: {len(laws)}, меток: {len(labels)}, к разметке: {len(todo)} "
          f"(сначала {len(vis)} видимых anti/pro, потом {len(unk)} неопределённых)")
    todo = todo[: args.max_requests * args.batch]
    if not todo:
        print("размечать нечего — выходим")
        return

    ok = err = 0
    for i in range(0, len(todo), args.batch):
        batch = todo[i:i + args.batch]
        try:
            got = ask(batch)
            labels.update(got)
            ok += len(got)
            print(f"  [{i//args.batch + 1}] +{len(got)}/{len(batch)} меток", flush=True)
        except Exception as e:
            err += 1
            wait = min(240, 30 * 2 ** (err - 1))   # 30с -> 1м -> 2м -> 4м
            print(f"  [{i//args.batch + 1}] ошибка: {e} — ждём {wait}с", flush=True)
            if err >= 8:
                print("8 ошибок подряд — сохраняюсь и выхожу")
                break
            time.sleep(wait)
            continue
        # сохраняемся после каждой партии — устойчиво к падениям
        with open(labels_path, "w", encoding="utf-8") as f:
            json.dump(labels, f, ensure_ascii=False)
        time.sleep(args.sleep)
    print(f"готово: размечено {ok}, ошибок {err}, всего меток {len(labels)}")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""
Классификатор законопроектов БЕЗ нейросети — детерминированные правила.

Критерий (задан владельцем проекта):
- «не для людей» (anti): человек отдаёт государству и не получает эквивалента —
  налоги, сборы, пошлины, поборы, штрафы, надзор, ограничения, обязанности.
- «для людей» (pro): человек реально получает благо —
  выплаты, индексация, льготы, бесплатные услуги, гарантии, защита прав.
- иначе «unknown» — попадает в отдельный фильтр на сайте.

Правила в parser/rules.json, ручные поправки в parser/overrides.json
(ключ — номер законопроекта, значение: "anti" | "pro" | "unknown").

Запуск: python parser/classify.py
Вход:  data/laws_raw.json   Выход: data/laws.json + data/meta.json
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def load_json(p):
    with open(os.path.join(HERE, p), encoding="utf-8") as f:
        return json.load(f)


RULES = load_json("rules.json")
OVERRIDES = load_json("overrides.json") if os.path.exists(os.path.join(HERE, "overrides.json")) else {}
LABELS_PATH = os.path.join(ROOT, "data", "llm_labels.json")
LABELS = json.load(open(LABELS_PATH, encoding="utf-8")) if os.path.exists(LABELS_PATH) else {}


def compile_rules(rules):
    return [(re.compile(r, re.I | re.U), w) for r, w in rules]


ANTI = compile_rules(RULES["anti"])
PRO = compile_rules(RULES["pro"])
TOPICS = [(name, re.compile(rx, re.I | re.U)) for name, rx in RULES["topics"]]

# Канбан по стадиям: числовой префикс последнего события СОЗД -> колонка
STAGE_PREFIX = [
    ("8.2", "Опубликован (действует)"),
    ("8.1", "У Президента"),
    ("7", "Совет Федерации"),
    ("6", "Принят Госдумой"),
    ("5", "На рассмотрении"),
    ("4", "На рассмотрении"),
    ("3", "На рассмотрении"),
    ("2", "Внесён"),
    ("1", "Внесён"),
]

DEAD_RE = re.compile(r"вернуть законопроект|снять законопроект|отклонить|отозван", re.I)


def stage_of(bill):
    raw = bill.get("stage_raw", "")
    if raw[:2].isdigit() or (raw[:1].isdigit() and raw[1] == "."):
        prefix = raw[:3] if raw[1] == "." else raw[:1]
        if re.match(r"^\d\.\d", raw):
            prefix = raw[:3]
        else:
            prefix = raw[:1]
        # конец пути: отклонён / снят / возвращён
        if DEAD_RE.search(raw):
            return "Архив"
        if prefix.startswith("8."):
            return "Опубликован (действует)" if prefix >= "8.2" else "У Президента"
        if prefix.startswith("7"):
            return "Совет Федерации"
        if prefix.startswith("6"):
            return "Принят Госдумой"
        if prefix.startswith("2") or prefix.startswith("1"):
            return "Внесён"
        return "На рассмотрении"  # 1..5, 9 (повторные рассмотрения)
    # нет машиночитаемого префикса — доверяем бейджу статуса
    s = bill.get("status", "").lower()
    if "архив" in s or "отозван" in s or "снят" in s:
        return "Архив"
    if DEAD_RE.search(raw):
        return "Архив"
    return "На рассмотрении"


def score(text, rules):
    """Оценка + выжимки: кусок текста вокруг сработавшего места, не просто слово."""
    scored = []
    total = 0
    for rx, w in rules:
        m = rx.search(text)
        if m:
            total += w
            s = max(0, m.start() - 90)
            snip = re.sub(r"\s+", " ", text[s:m.end() + 120]).strip()
            if s > 0:
                snip = "…" + snip
            if m.end() + 120 < len(text):
                snip += "…"
            scored.append((w, snip))
    scored.sort(key=lambda x: -x[0])
    return total, [snip for _, snip in scored]


def classify(bill):
    text = bill["title"] + " " + bill.get("comment", "")
    anti, anti_hits = score(text, ANTI)
    pro, pro_hits = score(text, PRO)
    lab = LABELS.get(bill["number"])
    if bill["number"] in OVERRIDES:
        aud = OVERRIDES[bill["number"]]
    elif lab and lab.get("a") in ("anti", "pro"):
        aud = lab["a"]
    elif anti > pro:
        aud = "anti"
    elif pro > anti:
        aud = "pro"
    else:
        aud = "unknown"
    topic = "Прочее"
    for name, rx in TOPICS:
        if rx.search(text):
            topic = name
            break
    return aud, topic, {"anti": anti, "pro": pro, "anti_hits": anti_hits[:4], "pro_hits": pro_hits[:4]}


def year_of(bill):
    m = re.match(r"\d{2}\.(\d{2})\.(\d{4})", bill.get("intro_date", ""))
    return int(m.group(2)) if m else None


# Базовый закон для сетки связей (Zettelkasten): в какой закон вносят правки
BASE_RE = re.compile(
    r"(?:в|о внесении изменений в|дополнени[ея] в)[^«\"]{0,60}[«\"]"
    r"([^«»\"]{8,140})[«»\"]"
)
CODEX_RE = re.compile(r"\b(Налоговый|Гражданский|Уголовный|Жилищный|Земельный|"
                      r"Трудовой|Семейный|Бюджетный|Таможенный|Лесной|Водный|"
                      r"Воздушный|Градостроительный|Уголовно-процессуальный|"
                      r"Кодекс об административных правонарушениях|"
                      r"Уголовно-исполнительный|Арбитражный процессуальный) кодекс", re.I)


def base_of(bill):
    title = bill["title"]
    m = BASE_RE.search(title)
    if m:
        name = m.group(1).strip()
        if len(name) > 140:
            name = name[:140]
        return name
    m = CODEX_RE.search(title)
    if m:
        return m.group(0).title()
    return None


def main():
    src = os.path.join(ROOT, "data", "laws_raw.json")
    with open(src, encoding="utf-8") as f:
        bills = json.load(f)
    out = []
    for b in bills:
        aud, topic, dbg = classify(b)
        st = stage_of(b)
        lab = LABELS.get(b["number"])
        if lab and lab.get("a") == aud and lab.get("why"):
            hits = [lab["why"]]
        else:
            hits = dbg["anti_hits"] if aud == "anti" else dbg["pro_hits"] if aud == "pro" else []
        out.append({
            "n": b["number"],
            "t": b["title"],
            "c": b.get("comment", ""),
            "d": b.get("intro_date", ""),
            "y": year_of(b),
            "i": b.get("initiator", ""),
            "st": st,
            "ev": b.get("stage_raw", "")[:120],
            "ed": b.get("stage_date", ""),
            "a": aud,
            "tp": topic,
            "w": hits[:3],
            "b": base_of(b),
        })
    meta = {
        "updated": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "total": len(out),
    }
    for name in ("data", "data_anti", "data_pro"):
        pass
    dst = os.path.join(ROOT, "data", "laws.json")
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(ROOT, "data", "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    # сводка
    from collections import Counter
    print("всего:", len(out))
    print("по аудитории:", Counter(x["a"] for x in out))
    print("по стадии:", Counter(x["st"] for x in out).most_common())
    print("по темам:", Counter(x["tp"] for x in out).most_common())
    print("ок ->", dst)


if __name__ == "__main__":
    main()

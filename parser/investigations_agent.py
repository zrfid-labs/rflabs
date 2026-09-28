# -*- coding: utf-8 -*-
"""
Расследования-агент: поиск депутатов в ICIJ Offshore Leaks
(Панамские/Пандора/Багамские бумаги — официальные публичные выгрузки ICIJ).

Только публичные данные: совпадение ФИО (транслит) + страна Россия.
Каждый факт — ссылка на карточку offshoreleaks.icij.org. Возможны однофамильцы —
это честно указывается в выдаче. Никаких обвинений — только факты из базы.
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OLDB = os.environ.get("ICIJ_DIR") or r"D:\zapret\TG Bot Daigest\Project2\investigations\oldb"
OUT = os.path.join(ROOT, "data", "investigations.json")
DECL = os.path.join(ROOT, "data", "declarations.json")

TRANSLIT = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i',
    'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
    'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'',
    'э':'e','ю':'yu','я':'ya'
}


def translit(word):
    return "".join(TRANSLIT.get(c, c) for c in word.lower())


def surnames(fio):
    """Фамилия = последнее слово ФИО (вDECL: 'Фамилия Имя Отчество')."""
    words = [w for w in re_split(fio)]
    return [translit(w) for w in words[:1]] if words else []


def re_split(fio):
    return [w for w in fio.replace("-", " ").split() if w]


def main():
    if not os.path.exists(DECL):
        print("нет data/declarations.json — сначала Декларации-агент")
        return
    decl = json.load(open(DECL, encoding="utf-8"))
    deputies = []
    for name, v in decl.items():
        sn = surnames(name)
        if sn:
            deputies.append({"name": name, "sur_lat": sn[0], "url": v.get("url", "")})
    print("депутатов в базе:", len(deputies))

    # 1. officers: ищем по фамилии (транслит) — ИЛИ по имени для редких
    officers = {}
    with open(os.path.join(OLDB, "nodes-officers.csv"), encoding="utf-8", errors="replace") as f:
        r = csv.reader(f)
        head = next(r)
        for row in r:
            if len(row) < 5:
                continue
            name = row[1].lower()
            for d in deputies:
                if d["sur_lat"] and d["sur_lat"] in name:
                    officers.setdefault(d["name"], []).append(row)
    print("офицеров найдено:", sum(len(v) for v in officers.values()))

    # 2. entities: node_id -> строка
    ent_names = {}
    with open(os.path.join(OLDB, "nodes-entities.csv"), encoding="utf-8", errors="replace") as f:
        r = csv.reader(f)
        head = next(r)
        for row in r:
            if row:
                ent_names[row[0]] = row

    # 3. relationships: officer node_id -> entity node_id
    officer_ids = {}
    for dep, rows in officers.items():
        for row in rows:
            officer_ids.setdefault(row[0], dep)

    rels = {}
    with open(os.path.join(OLDB, "relationships.csv"), encoding="utf-8", errors="replace") as f:
        r = csv.reader(f)
        head = next(r)
        for row in r:
            if len(row) > 2 and row[0] in officer_ids:
                rels.setdefault(officer_ids[row[0]], []).append(row)

    # 4. сборка досье
    result = {}
    for dep, rel in rels.items():
        entities = []
        for row in rel:
            ent_id = row[1]
            ent = ent_names.get(ent_id)
            if ent:
                entities.append({
                    "name": ent[1][:80],
                    "jurisdiction": ent[2] if len(ent) > 2 else "",
                    "status": ent[3] if len(ent) > 3 else "",
                    "link": "https://offshoreleaks.icij.org/entities/" + ent_id,
                })
        if entities:
            drow = next(d for d in deputies if d["name"] == dep)
            result[dep] = {
                "officers": [{"name": r[1], "source": r[4],
                              "link": "https://offshoreleaks.icij.org/officers/" + r[0]}
                             for r in officers[dep]],
                "entities": entities,
                "deputy_url": drow["url"],
            }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1, default=str)
    print("депутатов с офшорными следами:", len(result), "->", OUT)


if __name__ == "__main__":
    main()

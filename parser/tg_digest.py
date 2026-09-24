# -*- coding: utf-8 -*-
"""
Ночная телеграм-рассылка: новые анти-законопроекты за последние сутки.
Ключи НЕ хранятся в коде — берутся из секретов GitHub Actions:
  TG_TOKEN  — токен бота (@BotFather)
  TG_CHAT   — ID чата (узнать: написать боту, потом открыть
              https://api.telegram.org/bot<TOKEN>/getUpdates и взять chat.id)

Запуск в workflow — только если оба секрета заданы. Локально:
  TG_TOKEN=... TG_CHAT=... python parser/tg_digest.py
"""
import json
import os
import sys
import urllib.request
import urllib.parse

API = "https://api.telegram.org/bot"


def send(text):
    token = os.environ.get("TG_TOKEN")
    chat = os.environ.get("TG_CHAT")
    if not token or not chat:
        print("TG_TOKEN/TG_CHAT не заданы — рассылка пропущена")
        return False
    data = urllib.parse.urlencode({"chat_id": chat, "text": text,
                                   "parse_mode": "HTML", "disable_web_page_preview": 1}).encode()
    req = urllib.request.Request(API + token + "/sendMessage", data=data)
    r = json.load(urllib.request.urlopen(req, timeout=30))
    return r.get("ok", False)


def main():
    laws = json.load(open(os.path.join("data", "laws.json"), encoding="utf-8"))
    meta = json.load(open(os.path.join("data", "meta.json"), encoding="utf-8"))
    import re
    def fresh(l):
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", l.get("d", ""))
        return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else (0, 0, 0)

    fresh_anti = [l for l in laws if l["a"] == "anti"
                  and l["st"] != "Архив" and fresh(l) >= (2026, 1, 1)]
    fresh_anti.sort(key=fresh, reverse=True)
    top = fresh_anti[:10]
    if not top:
        print("новых анти-законопроектов нет")
        return
    lines = [f"🔴 <b>Новые «не для людей»</b> — {meta.get('updated', '')[:10]}",
             f"на рассмотрении/внесено: <b>{len(fresh_anti)}</b>", ""]
    for l in top:
        why = (l.get("w") or [""])[0]
        lines.append(f"⚡️ <a href=\"{l['u']}\">{l['n']}</a> — {l['t'][:90]}")
        if why:
            lines.append(f"<i>{why[:80]}</i>")
        lines.append("")
    text = "\n".join(lines)[:3800]
    if send(text):
        print("отправлено в телеграм:", len(top), "законов")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()

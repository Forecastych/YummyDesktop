# Стикеры для чата из набора Telegram: качает через Bot API, ужимает и пишет манифест.
# Запуск: TG_BOT_TOKEN=<токен бота> python scripts/fetch-stickers.py PolniyPakich pp [sticker|emoji]
# Токен — любого своего бота из @BotFather, в проект он не попадает.
# Третий аргумент — как показывать набор; без него берётся прежний из манифеста или тип
# набора в Telegram (PolniyPakich формально стикеры, но по сути смайлы — ему emoji).
#
# Код стикера в сообщении — :<prefix><n>:, например :pp12:. Номер привязан к стикеру
# навсегда (по file_unique_id): если автор переставит или добавит стикеры, старые
# сообщения покажут то же, что и раньше. Удалённые из набора остаются с gone: true.
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'src' / 'lib' / 'stickers.json'
OUT = ROOT / 'public' / 'stickers'
# Сторона картинки: стикер в ленте 160px, с запасом на масштаб интерфейса 120%.
SIDE = 192
# Тип набора в Telegram → как показывать: sticker — отдельной картинкой, emoji — в строке текста.
KINDS = {'regular': 'sticker', 'custom_emoji': 'emoji'}


def api(token, method, **params):
    url = f'https://api.telegram.org/bot{token}/{method}?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.load(r)
    if not data.get('ok'):
        sys.exit(f'{method}: {data.get("description")}')
    return data['result']


def fetch(token, file_id):
    path = api(token, 'getFile', file_id=file_id)['file_path']
    with urllib.request.urlopen(f'https://api.telegram.org/file/bot{token}/{path}', timeout=60) as r:
        return r.read()


def main():
    token = os.environ.get('TG_BOT_TOKEN')
    if not token or len(sys.argv) not in (3, 4):
        sys.exit('TG_BOT_TOKEN=... python scripts/fetch-stickers.py <набор> <префикс> [sticker|emoji]')
    name, prefix = sys.argv[1], sys.argv[2]
    if not prefix.isalpha() or not prefix.islower():
        sys.exit('Префикс — строчные латинские буквы: он часть кода :pp12:')
    kind = sys.argv[3] if len(sys.argv) == 4 else None
    if kind not in (None, *KINDS.values()):
        sys.exit('Показ — sticker или emoji')

    st = api(token, 'getStickerSet', name=name)
    if st['sticker_type'] not in KINDS or any(s['is_animated'] or s['is_video'] for s in st['stickers']):
        sys.exit('Поддерживаются только статичные webp: обычные стикеры или кастомные эмодзи')

    manifest = json.loads(MANIFEST.read_text('utf-8')) if MANIFEST.exists() else {}
    old = manifest.get(prefix, {}).get('items', [])
    by_uid = {it['uid']: it for it in old}
    next_n = max((it['n'] for it in old), default=0) + 1
    seen = set()
    items = []
    out = OUT / prefix
    out.mkdir(parents=True, exist_ok=True)

    for s in st['stickers']:
        uid = s['file_unique_id']
        seen.add(uid)
        it = by_uid.get(uid)
        if it is None:
            it = {'n': next_n, 'uid': uid}
            next_n += 1
        it['emoji'] = s.get('emoji', '')
        it.pop('gone', None)
        file = out / f'{it["n"]}.webp'
        if not file.exists():
            im = Image.open(io.BytesIO(fetch(token, s['file_id']))).convert('RGBA')
            im.thumbnail((SIDE, SIDE), Image.LANCZOS)
            im.save(file, 'WEBP', quality=82, method=6)
        items.append(it)

    # Пропавшие из набора — в конец, скрытыми из выбора, но с картинкой для старых сообщений.
    items += [{**it, 'gone': True} for it in old if it['uid'] not in seen]

    kind = kind or manifest.get(prefix, {}).get('kind') or KINDS[st['sticker_type']]
    manifest[prefix] = {'set': name, 'title': st['title'], 'kind': kind, 'items': items}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', 'utf-8')
    size = sum(f.stat().st_size for f in out.glob('*.webp'))
    print(f'{st["title"]}: {len(items)} стикеров, {size // 1024} КБ в {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()

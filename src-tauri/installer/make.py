# Картинки установщика NSIS в цветах приложения (src/app.css).
# Запуск: python src-tauri/installer/make.py — перезаписывает sidebar.bmp и header.bmp.
# Рисуем в 4x и уменьшаем: NSIS берёт BMP как есть, без сглаживания.
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
ICON = Image.open(HERE.parent / 'icons' / 'icon.png').convert('RGBA')
FONT = 'C:/Windows/Fonts/segoeui.ttf'
BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
S = 4

BG = (34, 34, 34)
TEXT = (238, 238, 238)
MUTED = (168, 168, 168)
ACCENT = (255, 102, 102)


def font(path, size):
    return ImageFont.truetype(path, size * S)


def icon(size):
    return ICON.resize((size * S, size * S), Image.LANCZOS)


def centered(draw, y, text, fnt, fill, width):
    w = draw.textlength(text, font=fnt)
    draw.text(((width * S - w) / 2, y * S), text, font=fnt, fill=fill)


def sidebar():
    w, h = 164, 314
    img = Image.new('RGB', (w * S, h * S), BG)

    # Красное свечение за знаком.
    glow = Image.new('L', img.size, 0)
    ImageDraw.Draw(glow).ellipse([(w / 2 - 70) * S, 30 * S, (w / 2 + 70) * S, 170 * S], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(28 * S))
    img.paste(Image.new('RGB', img.size, ACCENT), (0, 0), glow)

    mark = icon(72)
    img.paste(mark, ((w * S - mark.width) // 2, 64 * S), mark)

    d = ImageDraw.Draw(img)
    centered(d, 150, 'YummyAnime', font(BOLD, 19), TEXT, w)
    centered(d, 174, 'Desktop', font(BOLD, 19), ACCENT, w)
    centered(d, 210, 'Аниме без рекламы', font(FONT, 11), MUTED, w)

    # Акцентная полоса снизу — как под заголовками блоков в приложении.
    d.rectangle([0, (h - 3) * S, w * S, h * S], fill=ACCENT)
    img.resize((w, h), Image.LANCZOS).save(HERE / 'sidebar.bmp')


def header():
    # Шапка MUI2 стоит на белой системной панели, поэтому фон светлый.
    w, h = 150, 57
    img = Image.new('RGB', (w * S, h * S), (255, 255, 255))
    mark = icon(34)
    img.paste(mark, (8 * S, (h * S - mark.height) // 2), mark)
    d = ImageDraw.Draw(img)
    d.text((48 * S, 11 * S), 'YummyAnime', font=font(BOLD, 14), fill=(34, 34, 34))
    d.text((48 * S, 28 * S), 'Desktop', font=font(BOLD, 12), fill=(230, 70, 70))
    img.resize((w, h), Image.LANCZOS).save(HERE / 'header.bmp')


sidebar()
header()

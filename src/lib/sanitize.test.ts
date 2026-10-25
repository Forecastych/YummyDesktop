import { describe, expect, it } from 'vitest'
import { EMBED_SANDBOX, commentHtml, internalLink, linkify, plainText, richText, safeEmbed, sanitize } from './sanitize'

/** Разобрать результат обратно — проверяем DOM, а не точную строку сериализации. */
const dom = (html: string) => {
  const d = document.createElement('div')
  d.innerHTML = sanitize(html)
  return d
}

describe('sanitize: опасное', () => {
  it('выкидывает script и style вместе с содержимым', () => {
    expect(sanitize('<p>hi<script>alert(1)</script><style>p{}</style></p>')).toBe('<p>hi</p>')
  })

  it('снимает обработчики событий', () => {
    const img = dom('<img src="https://x.ru/a.png" onerror="alert(1)">').querySelector('img')!
    expect(img.hasAttribute('onerror')).toBe(false)
  })

  it('режет javascript: в ссылках', () => {
    expect(dom('<a href="javascript:alert(1)">x</a>').querySelector('a')!.hasAttribute('href')).toBe(false)
    expect(dom('<a href=" JaVaScRiPt:alert(1)">x</a>').querySelector('a')!.hasAttribute('href')).toBe(false)
  })

  it('выкидывает svg и math целиком (mXSS)', () => {
    expect(sanitize('<svg><a href="javascript:1"><text>x</text></a></svg>ok')).toBe('ok')
    expect(sanitize('<math><mi>x</mi></math>ok')).toBe('ok')
  })

  it('незнакомый тег разворачивает, но содержимое всё равно чистит', () => {
    expect(sanitize('<custom><script>x</script><b onclick="1">ok</b></custom>')).toBe('<b>ok</b>')
  })

  it('убирает комментарии', () => {
    expect(sanitize('<p>a<!-- <img src=x onerror=1> -->b</p>')).toBe('<p>ab</p>')
  })

  it('из style оставляет только выравнивание', () => {
    expect(dom('<p style="text-align: center">x</p>').querySelector('p')!.getAttribute('style')).toBe('text-align: center')
    expect(dom('<p style="background:url(javascript:1)">x</p>').querySelector('p')!.hasAttribute('style')).toBe(false)
  })
})

describe('sanitize: ссылки и медиа', () => {
  it('ссылку на тайтл сайта переписывает во внутренний маршрут', () => {
    const a = dom('<a href="https://yummyani.me/catalog/item/igra-druzey">x</a>').querySelector('a')!
    expect(a.getAttribute('href')).toBe('#/anime/igra-druzey')
    expect(a.hasAttribute('data-external')).toBe(false)
  })

  it('внешнюю ссылку помечает', () => {
    const a = dom('<a href="//example.com/x" target="_blank">x</a>').querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://example.com/x')
    expect(a.hasAttribute('data-external')).toBe(true)
    expect(a.hasAttribute('target')).toBe(false)
  })

  it('картинки: только https и data:image, протокол-относительные — в https', () => {
    expect(dom('<img src="http://x.ru/a.png">').querySelector('img')).toBeNull()
    expect(dom('<img src="data:text/html,1">').querySelector('img')).toBeNull()
    const img = dom('<img src="//x.ru/a.png">').querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://x.ru/a.png')
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it('iframe: YouTube остаётся в песочнице, чужой хост удаляется', () => {
    const f = dom('<iframe src="https://www.youtube.com/embed/abc"></iframe>').querySelector('iframe')!
    expect(f.getAttribute('sandbox')).toBe(EMBED_SANDBOX)
    expect(dom('<iframe src="https://evil.com/x"></iframe>').querySelector('iframe')).toBeNull()
    expect(dom('<iframe src="https://youtube.com.evil.com/x"></iframe>').querySelector('iframe')).toBeNull()
  })
})

describe('safeEmbed', () => {
  it('пропускает белый список по https', () => {
    expect(safeEmbed('//vk.com/video_ext.php?oid=1')).toBe('https://vk.com/video_ext.php?oid=1')
    expect(safeEmbed('http://www.youtube.com/embed/x')).toBeNull()
    expect(safeEmbed('https://kodik.info/x')).toBeNull()
    expect(safeEmbed('не ссылка')).toBeNull()
    expect(safeEmbed(undefined)).toBeNull()
  })
})

describe('internalLink', () => {
  it.each([
    'https://yummyani.me/catalog/item/naruto',
    'https://yummy-anime.ru/catalog/item/naruto',
    'https://yummyanime.tv/catalog/item/naruto',
  ])('%s', (href) => expect(internalLink(href)).toBe('#/anime/naruto'))

  it('прочее — null', () => {
    expect(internalLink('https://example.com/catalog/item/naruto')).toBeNull()
  })
})

describe('linkify', () => {
  it('не захватывает точку и скобку в конце', () => {
    expect(linkify('см. https://a.ru/x. и (https://b.ru/y)')).toEqual([
      { text: 'см. ' },
      { text: 'https://a.ru/x', href: 'https://a.ru/x' },
      { text: '. и (' },
      { text: 'https://b.ru/y', href: 'https://b.ru/y' },
      { text: ')' },
    ])
  })

  it('текст без ссылок — один кусок', () => {
    expect(linkify('просто текст')).toEqual([{ text: 'просто текст' }])
  })
})

describe('richText', () => {
  it('BB-коды кириллицей и латиницей', () => {
    const parts = richText('[ж]жир[/ж] и [i]курсив[/i]')
    expect(parts.find((p) => p.text === 'жир')).toMatchObject({ b: true, i: false })
    expect(parts.find((p) => p.text === 'курсив')).toMatchObject({ b: false, i: true })
    expect(parts.find((p) => p.text === ' и ')).toMatchObject({ b: false, i: false })
  })
})

describe('commentHtml', () => {
  it('экранирует разметку', () => {
    expect(commentHtml('<img src=x onerror="1">')).toBe('&lt;img src=x onerror=&quot;1&quot;&gt;')
  })

  it('спойлеры и переводы строк', () => {
    expect(commentHtml('a\n[спойлер]b[/спойлер]')).toBe('a<br><span class="spoiler" tabindex="0">b</span>')
    expect(commentHtml('[spoiler=кто умрёт]x[/spoiler]')).toBe('<span class="spoiler" tabindex="0">x</span>')
  })
})

describe('plainText', () => {
  it('без разметки и без спойлеров', () => {
    expect(plainText('<p>Раз</p><p>Два <span class="spoiler">тайна</span></p><script>x</script>')).toBe('Раз\nДва')
  })
})

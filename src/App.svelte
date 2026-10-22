<script lang="ts">
  import Footer from './lib/components/Footer.svelte'
  import Header from './lib/components/Header.svelte'
  import { isTauri, setFullscreen, setTitle } from './lib/native'
  import { back, match, route } from './lib/router.svelte'
  import Anime from './pages/Anime.svelte'
  import Catalog from './pages/Catalog.svelte'
  import Collection from './pages/Collection.svelte'
  import Collections from './pages/Collections.svelte'
  import Follows from './pages/Follows.svelte'
  import ForYou from './pages/ForYou.svelte'
  import History from './pages/History.svelte'
  import Home from './pages/Home.svelte'
  import Login from './pages/Login.svelte'
  import Post from './pages/Post.svelte'
  import Posts from './pages/Posts.svelte'
  import Profile from './pages/Profile.svelte'
  import Random from './pages/Random.svelte'
  import Schedule from './pages/Schedule.svelte'
  import Settings from './pages/Settings.svelte'
  import Top from './pages/Top.svelte'
  import Video from './pages/Video.svelte'
  import Videos from './pages/Videos.svelte'

  const STATIC: Record<string, { page: typeof Home; title?: string }> = {
    '/': { page: Home },
    '/catalog': { page: Catalog, title: 'Каталог' },
    '/top': { page: Top, title: 'ТОП-100' },
    '/random': { page: Random },
    '/for-you': { page: ForYou, title: 'Для вас' },
    '/collections': { page: Collections, title: 'Коллекции' },
    '/schedule': { page: Schedule, title: 'Расписание' },
    '/posts': { page: Posts, title: 'Новости' },
    '/videos': { page: Videos, title: 'Видео' },
    '/history': { page: History, title: 'История' },
    '/follows': { page: Follows, title: 'Подписки' },
    '/settings': { page: Settings, title: 'Настройки' },
    '/login': { page: Login, title: 'Вход' },
    '/profile': { page: Profile, title: 'Профиль' },
  }

  const anime = $derived(match('/anime/:url', route.path))
  const post = $derived(match('/posts/:id', route.path))
  const coll = $derived(match('/collections/:id', route.path))
  const video = $derived(match('/videos/:id', route.path))
  const page = $derived(STATIC[route.path])

  $effect(() => {
    if (anime || coll || video) return // заголовок ставит сама страница
    setTitle(page?.title ? `${page.title} — YummyDesktop` : 'YummyDesktop')
  })

  let fullscreen = false
  function onKey(e: KeyboardEvent) {
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault()
      back()
    } else if (e.key === 'F11' && isTauri) {
      e.preventDefault()
      fullscreen = !fullscreen
      setFullscreen(fullscreen)
    }
  }

  // Боковая кнопка мыши «назад».
  function onMouse(e: MouseEvent) {
    if (e.button === 3) {
      e.preventDefault()
      back()
    }
  }
</script>

<svelte:window onkeydown={onKey} onmouseup={onMouse} />

<Header />
<main>
  {#key route.path}
    {#if anime}
      <Anime url={anime.url} />
    {:else if post}
      <Post id={Number(post.id)} />
    {:else if coll}
      <Collection id={Number(coll.id)} />
    {:else if video}
      <Video id={Number(video.id)} />
    {:else if page}
      <page.page />
    {:else}
      <div class="empty">Страница не найдена. <a href="#/" style="color:var(--accent)">На главную</a></div>
    {/if}
  {/key}
</main>
<Footer />

<style>
  main {
    min-height: calc(100vh - var(--header-h));
  }
</style>

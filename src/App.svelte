<script lang="ts">
  import ContextMenu from './lib/components/ContextMenu.svelte'
  import Footer from './lib/components/Footer.svelte'
  import Header from './lib/components/Header.svelte'
  import Toasts from './lib/components/Toasts.svelte'
  import UpdateBar from './lib/components/UpdateBar.svelte'
  import { isTauri, setFullscreen, setTitle } from './lib/native'
  import { back, match, route } from './lib/router.svelte'
  import { stepScale } from './lib/stores/settings.svelte'
  import Anime from './pages/Anime.svelte'
  import Blogger from './pages/Blogger.svelte'
  import Catalog from './pages/Catalog.svelte'
  import Collection from './pages/Collection.svelte'
  import Collections from './pages/Collections.svelte'
  import Follows from './pages/Follows.svelte'
  import ForYou from './pages/ForYou.svelte'
  import History from './pages/History.svelte'
  import Notifications from './pages/Notifications.svelte'
  import Home from './pages/Home.svelte'
  import Login from './pages/Login.svelte'
  import Post from './pages/Post.svelte'
  import Posts from './pages/Posts.svelte'
  import Profile from './pages/Profile.svelte'
  import Random from './pages/Random.svelte'
  import Review from './pages/Review.svelte'
  import Reviews from './pages/Reviews.svelte'
  import Schedule from './pages/Schedule.svelte'
  import Settings from './pages/Settings.svelte'
  import Studio from './pages/Studio.svelte'
  import Top from './pages/Top.svelte'
  import User from './pages/User.svelte'
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
    '/reviews': { page: Reviews, title: 'Рецензии' },
    '/history': { page: History, title: 'История' },
    '/follows': { page: Follows, title: 'Подписки' },
    '/notifications': { page: Notifications, title: 'Уведомления' },
    '/settings': { page: Settings, title: 'Настройки' },
    '/login': { page: Login, title: 'Вход' },
    '/profile': { page: Profile, title: 'Профиль' },
  }

  const anime = $derived(match('/anime/:url', route.path))
  const post = $derived(match('/posts/:id', route.path))
  const coll = $derived(match('/collections/:id', route.path))
  const video = $derived(match('/videos/:id', route.path))
  const user = $derived(match('/users/:id', route.path))
  const review = $derived(match('/reviews/:id', route.path))
  const studio = $derived(match('/studio/:slug', route.path))
  const blogger = $derived(match('/bloggers/:id', route.path))
  const page = $derived(STATIC[route.path])

  $effect(() => {
    if (anime || coll || video || user || review || blogger) return // заголовок ставит сама страница
    setTitle(page?.title)
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
    } else if (e.ctrlKey && !e.altKey && ['=', '+', '-', '0'].includes(e.key)) {
      e.preventDefault()
      stepScale(e.key === '0' ? 0 : e.key === '-' ? -1 : 1)
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
<UpdateBar />
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
    {:else if user}
      <User id={Number(user.id)} />
    {:else if review}
      <Review id={Number(review.id)} />
    {:else if studio}
      <Studio slug={studio.slug} />
    {:else if blogger}
      <Blogger id={Number(blogger.id)} />
    {:else if page}
      <page.page />
    {:else}
      <div class="empty">Страница не найдена. <a href="#/" style="color:var(--accent)">На главную</a></div>
    {/if}
  {/key}
</main>
<Footer />
<ContextMenu />
<Toasts />

<style>
  main {
    min-height: calc(100vh - var(--header-h));
  }
</style>

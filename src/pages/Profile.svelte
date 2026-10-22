<script lang="ts">
  import { LogOut } from '@lucide/svelte'
  import { img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import { LISTS, type AnimeShort, type ListId } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import { query } from '../lib/query.svelte'
  import { go } from '../lib/router.svelte'
  import { auth, logout } from '../lib/stores/auth.svelte'

  const TABS: { id: ListId | 4; title: string }[] = [...LISTS, { id: 4, title: 'Избранное' }]
  let tab: ListId | 4 = $state(0)

  const list = query<AnimeShort[]>(async (signal) => {
    const p = auth.profile
    return p ? Api.userList(p.id, tab, { signal }) : []
  })

  async function out() {
    await logout()
    go('/', true)
  }
</script>

{#if auth.profile}
  {@const p = auth.profile}
  <div class="container page">
    <section class="block">
      <div class="head" style:background-image={p.banner?.full ? `url(${img(p.banner.full)})` : undefined}>
        <img class="ava" src={img(p.avatars?.big)} alt="" width="96" height="96" />
        <div class="who">
          <h1>{p.nickname}</h1>
          {#if p.about}<p>{p.about}</p>{/if}
        </div>
        <button class="btn small" onclick={out}><LogOut size={14} /> Выйти</button>
      </div>
      <div class="tabs">
        {#each TABS as t (t.id)}
          <button class="btn small" class:accent={tab === t.id} onclick={() => (tab = t.id)}>{t.title}</button>
        {/each}
      </div>
      {#if list.data}
        {#if list.data.length}
          <div class="grid list">
            {#each list.data as a (a.anime_id)}
              <AnimeCard anime={a} sub={a.episodes ? `${a.episodes.aired} из ${a.episodes.count || '?'}` : ''} />
            {/each}
          </div>
        {:else}
          <div class="empty">Список пуст</div>
        {/if}
      {:else}
        <Loader error={list.error} retry={list.retry} />
      {/if}
    </section>
  </div>
{:else if !auth.ready}
  <Loader />
{:else}
  <div class="empty">Вы не вошли. <a href="#/login" style="color:var(--accent)">Войти</a></div>
{/if}

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px 18px;
    background: var(--panel-2) center / cover no-repeat;
    box-shadow: inset 0 0 0 2000px rgba(0, 0, 0, 0.45);
  }
  .ava {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 3px solid var(--accent);
    object-fit: cover;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 22px;
  }
  .who p {
    margin: 4px 0 0;
    color: var(--text-2);
    white-space: pre-line;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
  }
  .list {
    padding: 14px;
  }
</style>

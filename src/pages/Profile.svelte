<svelte:options runes />

<script lang="ts">
  import Loader from '../lib/components/Loader.svelte'
  import { go } from '../lib/router.svelte'
  import { auth, logout } from '../lib/stores/auth.svelte'
  import User from './User.svelte'

  async function out() {
    await logout()
    go('/', true)
  }
</script>

{#if auth.profile}
  {#key auth.profile.id}
    <User id={auth.profile.id} own onlogout={out} />
  {/key}
{:else if !auth.ready}
  <Loader />
{:else}
  <div class="empty">Вы не вошли. <a href="#/login" style="color:var(--accent)">Войти</a></div>
{/if}

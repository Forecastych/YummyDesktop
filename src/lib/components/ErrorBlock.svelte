<script lang="ts">
  import { RotateCw } from '@lucide/svelte'

  // Заглушка «что-то не загрузилось», как блок ошибки на сайте:
  // заголовок, картинка, текст и «Попробовать снова».
  interface Props {
    message?: string | null
    retry?: () => void
    /** Ужатый вид для боковых и вложенных блоков. */
    small?: boolean
  }
  let { message, retry, small = false }: Props = $props()
</script>

<div class="err" class:small role="alert">
  <b class="title">Ошибка</b>
  <!-- Отсоединённый штекер: своя картинка, а не арт сайта. -->
  <svg viewBox="0 0 120 80" width={small ? 84 : 120} height={small ? 56 : 80} aria-hidden="true">
    <path d="M4 52 H34" class="wire" />
    <rect x="34" y="40" width="22" height="24" rx="4" class="plug" />
    <path d="M56 46 H64 M56 58 H64" class="pin" />
    <path d="M116 52 H88" class="wire" />
    <rect x="70" y="38" width="18" height="28" rx="4" class="socket" />
    <path d="M74 46 H78 M74 58 H78" class="hole" />
    <path d="M60 22 l4 8 M68 18 v9 M76 22 l-4 8" class="spark" />
  </svg>
  <p>{message || 'Неизвестная ошибка'}</p>
  {#if retry}
    <button class="btn small" onclick={retry}><RotateCw size={13} /> Попробовать снова</button>
  {/if}
</div>

<style>
  .err {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 40px 16px;
    color: var(--muted);
    text-align: center;
  }
  .err.small {
    gap: 6px;
    padding: 20px 12px;
  }
  .title {
    color: var(--text);
    font-size: 16px;
  }
  .small .title {
    font-size: 14px;
  }
  p {
    margin: 0;
    max-width: 420px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  svg {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
  }
  .wire {
    stroke: var(--line-2);
  }
  .plug {
    fill: var(--panel-2);
    stroke: var(--accent);
  }
  .pin {
    stroke: var(--accent);
  }
  .socket {
    fill: var(--panel-2);
    stroke: var(--muted);
  }
  .hole {
    stroke: var(--muted);
  }
  .spark {
    stroke: var(--yellow);
    stroke-width: 2.5;
  }
</style>

<script lang="ts">
  import { answer, asking } from '../stores/confirm.svelte'

  let dialog = $state<HTMLDialogElement>()
  let okBtn = $state<HTMLButtonElement>()

  // showModal кладёт диалог в верхний слой — поверх других модальных (редактор профиля).
  $effect(() => {
    if (!dialog) return
    dialog.showModal()
    okBtn?.focus()
    return () => dialog?.close()
  })
</script>

{#if asking.q}
  {@const q = asking.q}
  <dialog
    bind:this={dialog}
    aria-labelledby="confirm-title"
    oncancel={(e) => {
      e.preventDefault()
      answer(false)
    }}
    onclick={(e) => e.target === dialog && answer(false)}
  >
    <h2 id="confirm-title">{q.title}</h2>
    {#if q.text}<p>{q.text}</p>{/if}
    <div class="acts">
      <button class="btn" onclick={() => answer(false)}>Отмена</button>
      <button bind:this={okBtn} class="btn" class:accent={q.danger} class:primary={!q.danger} onclick={() => answer(true)}>
        {q.ok ?? 'Да'}
      </button>
    </div>
  </dialog>
{/if}

<style>
  dialog {
    width: min(400px, calc(100vw - 32px));
    padding: 18px 20px 16px;
    border: 1px solid var(--line);
    border-top: 3px solid var(--accent);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    animation: pop 0.14s ease-out;
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  h2 {
    margin: 0;
    font-size: 16px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  p {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.45;
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
  }
</style>

<script lang="ts">
  import { X } from '@lucide/svelte'
  import type { CollectionInput } from '../api/types'
  import { errorText } from '../query.svelte'

  interface Props {
    /** Заголовок окна: «Новая коллекция» или «Редактировать». */
    heading: string
    initial?: Partial<CollectionInput>
    submitText?: string
    onsave: (v: Omit<CollectionInput, 'anime_ids'>) => Promise<void>
    onclose: () => void
  }
  let { heading, initial = {}, submitText = 'Сохранить', onsave, onclose }: Props = $props()

  // svelte-ignore state_referenced_locally
  let title = $state(initial.title ?? '')
  // svelte-ignore state_referenced_locally
  let description = $state(initial.description ?? '')
  // svelte-ignore state_referenced_locally
  let isPublic = $state(initial.public ?? false)
  let busy = $state(false)
  let error = $state<string | null>(null)

  let dialog: HTMLDialogElement
  $effect(() => {
    dialog.showModal()
    return () => dialog.close()
  })

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!title.trim()) return
    busy = true
    error = null
    try {
      await onsave({ title: title.trim(), description: description.trim(), public: isPublic })
      onclose()
    } catch (err) {
      error = errorText(err)
    } finally {
      busy = false
    }
  }
</script>

<dialog bind:this={dialog} onclose={onclose} onclick={(e) => e.target === dialog && onclose()}>
  <form onsubmit={submit}>
    <div class="head">
      <h2>{heading}</h2>
      <button type="button" class="x" onclick={onclose} aria-label="Закрыть"><X size={18} /></button>
    </div>
    <label>
      <span>Название</span>
      <input class="input" bind:value={title} maxlength="100" required placeholder="Например: аниме на вечер" />
    </label>
    <label>
      <span>Описание</span>
      <textarea class="input" bind:value={description} rows="4" maxlength="2000"></textarea>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={isPublic} />
      Публичная — видна всем на сайте YummyAnime
    </label>
    {#if error}<p class="err">{error}</p>{/if}
    <div class="actions">
      <button type="button" class="btn ghost" onclick={onclose}>Отмена</button>
      <button class="btn primary" disabled={busy || !title.trim()}>{busy ? 'Сохраняю…' : submitText}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(460px, calc(100vw - 32px));
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.65);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px 18px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 3px solid var(--accent);
  }
  h2 {
    margin: 0;
    font-size: 15px;
    text-transform: uppercase;
  }
  .x {
    color: var(--muted);
  }
  .x:hover {
    color: #fff;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 13px;
  }
  label span {
    color: var(--muted);
  }
  textarea.input {
    height: auto;
    padding: 8px 12px;
    resize: vertical;
    font: inherit;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .err {
    margin: 0;
    color: var(--accent);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>

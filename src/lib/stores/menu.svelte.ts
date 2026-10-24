import type { Component } from 'svelte'

// Одно контекстное меню на всё приложение: кто угодно зовёт openMenu(e, пункты),
// рисует его ContextMenu.svelte в корне.

export interface MenuItem {
  label: string
  icon?: Component<{ size?: number | string }>
  /** Текущий выбор (список и т.п.): пункт подсвечен, справа галочка. */
  checked?: boolean
  danger?: boolean
  disabled?: boolean
  action: () => void
}
/** Заголовок меню (название тайтла), подпись группы пунктов или разделитель. */
export type MenuEntry = MenuItem | { title: string } | { group: string } | 'sep'

export const menu = $state({
  open: false,
  x: 0,
  y: 0,
  items: [] as MenuEntry[],
})

export function openMenu(e: MouseEvent, items: MenuEntry[]) {
  e.preventDefault()
  e.stopPropagation()
  menu.items = items
  menu.x = e.clientX
  menu.y = e.clientY
  menu.open = true
}

export function closeMenu() {
  menu.open = false
}

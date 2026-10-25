import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { logLine } from './lib/native'
import { initAuth } from './lib/stores/auth.svelte'
import { startFollowChecker } from './lib/stores/follows.svelte'
// История сверяется с сайтом сама, как только появляется вход в аккаунт.
import './lib/stores/history.svelte'
import { startMessages } from './lib/stores/messages.svelte'
import { startNotifications } from './lib/stores/notifications.svelte'
import { startOnline } from './lib/stores/online.svelte'
import { startSmartBuilder } from './lib/stores/smart.svelte'
import { startUpdateChecker } from './lib/stores/updates.svelte'

// Необработанные ошибки — в лог-файл: по нему разбирать «у меня не работает».
window.addEventListener('error', (e) => logLine('error', `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`))
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  logLine('error', `unhandled rejection: ${r instanceof Error ? (r.stack ?? r.message) : String(r)}`)
})

initAuth()
startFollowChecker()
startNotifications()
startOnline()
startMessages()
startSmartBuilder()
startUpdateChecker()

mount(App, { target: document.getElementById('app')! })

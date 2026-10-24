import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initAuth } from './lib/stores/auth.svelte'
import { startFollowChecker } from './lib/stores/follows.svelte'
// История сверяется с сайтом сама, как только появляется вход в аккаунт.
import './lib/stores/history.svelte'
import { startMessages } from './lib/stores/messages.svelte'
import { startNotifications } from './lib/stores/notifications.svelte'
import { startSmartBuilder } from './lib/stores/smart.svelte'
import { startUpdateChecker } from './lib/stores/updates.svelte'

initAuth()
startFollowChecker()
startNotifications()
startMessages()
startSmartBuilder()
startUpdateChecker()

mount(App, { target: document.getElementById('app')! })

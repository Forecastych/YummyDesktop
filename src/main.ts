import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initAuth } from './lib/stores/auth.svelte'
import { startFollowChecker } from './lib/stores/follows.svelte'
// История сверяется с сайтом сама, как только появляется вход в аккаунт.
import './lib/stores/history.svelte'
import { startNotifications } from './lib/stores/notifications.svelte'
import { startSmartBuilder } from './lib/stores/smart.svelte'

initAuth()
startFollowChecker()
startNotifications()
startSmartBuilder()

mount(App, { target: document.getElementById('app')! })

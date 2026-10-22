import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initAuth } from './lib/stores/auth.svelte'
import { startFollowChecker } from './lib/stores/follows.svelte'
import { syncHistory } from './lib/stores/history.svelte'
import { startNotifications } from './lib/stores/notifications.svelte'
import { startSmartBuilder } from './lib/stores/smart.svelte'
import { enableWheelScroll } from './lib/wheel'

initAuth().then(() => syncHistory())
startFollowChecker()
startNotifications()
startSmartBuilder()
enableWheelScroll()

mount(App, { target: document.getElementById('app')! })

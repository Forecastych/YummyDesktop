import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initAuth } from './lib/stores/auth.svelte'
import { startFollowChecker } from './lib/stores/follows.svelte'

initAuth()
startFollowChecker()

mount(App, { target: document.getElementById('app')! })

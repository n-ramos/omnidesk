import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles.css'
import { applyAccentColor, readStoredAccent } from './utils/accentColor'
import { applyBaseColor, readStoredBase } from './utils/baseColor'

// Applique les dernieres couleurs connues (accent + fond) avant le premier rendu
// (anti-flash). La base prend le relais via bootstrapApp + les watchers d'AppShell.
applyAccentColor(readStoredAccent())
applyBaseColor(readStoredBase())

createApp(App).use(createPinia()).mount('#app')

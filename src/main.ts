import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './styles/main.css'
import App from './App.vue'
import { migrateKeyPrefix } from './lib/storage'

// Before the stores are created, since they read storage as they start.
migrateKeyPrefix()
createApp(App).use(createPinia()).mount('#app')

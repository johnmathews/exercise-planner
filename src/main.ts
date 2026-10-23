import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './styles/tokens.css'
import './styles/base.css'
import './styles/forms.css'
import './styles/print.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')

import { createRouter, createWebHistory } from 'vue-router'
import HelloWorldView from '../views/HelloWorldView.vue'
import ChatView from '../views/ChatView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HelloWorldView },
    { path: '/chat', component: ChatView },
  ],
})

export default router

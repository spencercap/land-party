import { createRouter, createWebHistory } from 'vue-router'
import HelloWorldView from '../views/HelloWorldView.vue'
import ChatView from '../views/ChatView.vue'
import LandView from '../views/LandView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HelloWorldView },
    { path: '/chat', component: ChatView },
    { path: '/l/:landId', component: LandView },
  ],
})

export default router

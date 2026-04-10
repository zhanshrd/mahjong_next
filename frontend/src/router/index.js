import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Index',
    component: () => import('@/pages/index/index.vue')
  },
  {
    path: '/room/:roomId',
    name: 'Room',
    component: () => import('@/pages/room/room.vue')
  },
  {
    path: '/game/:roomId',
    name: 'Game',
    component: () => import('@/pages/game/game.vue')
  },
  {
    path: '/scoreboard/:roomId',
    name: 'Scoreboard',
    component: () => import('@/pages/scoreboard/scoreboard.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

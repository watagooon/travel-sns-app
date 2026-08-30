import { createRouter, createWebHistory } from 'vue-router'
import FeedView from '../views/FeedView.vue'
import PostDetailView from '../views/PostDetailView.vue'
import EditView from '../views/EditView.vue'

const routes = [
  {
    path: '/',
    name: 'feed',
    component: FeedView,
  },
  {
    // /feed でアクセスされた場合もフィード一覧を表示する (エイリアス的なリダイレクト)
    path: '/feed',
    redirect: { name: 'feed' },
  },
  {
    // 旅の詳細（閲覧専用・公開画面）
    path: '/posts/:id',
    name: 'post-detail',
    component: PostDetailView,
    props: true,
  },
  {
    // 旅の編集（作成者専用画面。本来は認証/所有者チェックを navigation guard で行う想定）
    path: '/edit/:id',
    name: 'post-edit',
    component: EditView,
    props: true,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

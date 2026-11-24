import { createRouter, createWebHashHistory } from 'vue-router';
import MigrationStatus from './views/MigrationStatus.vue';

// 기존 사이트와 같은 해시 라우팅(#home, #compare …)을 쓴다. 화면을 하나씩 옮길 때 여기에 경로를 추가한다.
export const routes = [
  { path: '/', name: 'status', component: MigrationStatus },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

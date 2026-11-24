<template>
  <header class="topbar">
    <a href="/" class="brand">GPU 시세 인덱스</a>
    <span class="badge">Vue 이전 작업 중</span>
  </header>
  <main class="page">
    <RouterView />
  </main>
</template>

<style>
:root { color-scheme: light; font-family: 'Noto Sans KR', system-ui, sans-serif; color: #1d2330; }
body { margin: 0; background: #f6f7f9; }
.topbar { display: flex; align-items: center; gap: 12px; padding: 14px 24px; background: #fff; border-bottom: 1px solid #e3e6eb; }
.brand { font-weight: 700; color: inherit; text-decoration: none; }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #fdecee; color: #c8102e; }
.page { max-width: 960px; margin: 32px auto; padding: 0 24px; }
</style>

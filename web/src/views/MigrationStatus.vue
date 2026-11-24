<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { apiGet, summarizeCatalog } from '../api/client.js';

const state = ref('loading');
const summary = ref(null);
const message = ref('');
const controller = new AbortController();

onMounted(async () => {
  try {
    summary.value = summarizeCatalog(await apiGet('/api/v1/catalog', { signal: controller.signal }));
    state.value = 'ready';
  } catch (error) {
    if (error.name === 'AbortError') return;
    message.value = error.message;
    state.value = 'error';
  }
});
onBeforeUnmount(() => controller.abort());
</script>

<template>
  <section class="card">
    <h1>Vue 화면 준비 상태</h1>
    <p>새 화면은 이 앱(<code>/app/</code>)으로 하나씩 옮깁니다. 아직 옮기지 않은 화면은 기존 사이트에서 이용하세요.</p>
    <p v-if="state === 'loading'" role="status">Spring API 연결을 확인하는 중입니다…</p>
    <dl v-else-if="state === 'ready'" class="stats">
      <div><dt>GPU 모델</dt><dd>{{ summary.models }}</dd></div>
      <div><dt>사업자</dt><dd>{{ summary.providers }}</dd></div>
      <div><dt>리전</dt><dd>{{ summary.regions }}</dd></div>
    </dl>
    <p v-else role="alert">Spring API에 연결하지 못했습니다: {{ message }}</p>
    <a class="button" href="/">기존 사이트로 이동</a>
  </section>
</template>

<style scoped>
.card { background: #fff; border: 1px solid #e3e6eb; border-radius: 8px; padding: 24px; }
h1 { margin: 0 0 8px; font-size: 22px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
.stats div { border: 1px solid #e3e6eb; border-radius: 6px; padding: 12px; }
dt { font-size: 12px; color: #5b6472; }
dd { margin: 4px 0 0; font-size: 24px; font-weight: 700; }
.button { display: inline-block; margin-top: 8px; padding: 8px 14px; border-radius: 6px; background: #c8102e; color: #fff; text-decoration: none; }
</style>

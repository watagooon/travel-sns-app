<script setup>
// アプリ全体のシェル。実際の画面内容は Vue Router の各ビューコンポーネントが担う。
// (RouterView / RouterLink は app.use(router) 時にグローバル登録されるため import 不要)
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <RouterView />
  </div>
</template>

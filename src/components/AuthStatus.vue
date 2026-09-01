<script setup>
import { ArrowLeftOnRectangleIcon, ArrowRightOnRectangleIcon } from '@heroicons/vue/24/outline'
import { useAuth } from '../composables/useAuth'

const { user, isLoading, isAuthenticated, loginUrl, logoutUrl } = useAuth()
</script>

<template>
  <div class="flex items-center gap-2">
    <span v-if="isLoading" class="text-xs text-slate-400">認証確認中...</span>

    <template v-else-if="isAuthenticated">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
        {{ user.userDetails?.charAt(0)?.toUpperCase() }}
      </span>
      <span class="hidden max-w-[8rem] truncate text-sm text-slate-600 sm:inline">{{ user.userDetails }}</span>
      <a
        :href="logoutUrl()"
        class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
      >
        <ArrowLeftOnRectangleIcon class="h-4 w-4" aria-hidden="true" />
        ログアウト
      </a>
    </template>

    <!-- SWA CLI 実行中は本物のGitHubには飛ばず、ローカルエミュレーターの疑似ログイン画面が開く -->
    <a
      v-else
      :href="loginUrl('github')"
      class="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
    >
      <ArrowRightOnRectangleIcon class="h-4 w-4" aria-hidden="true" />
      GitHubでログイン
    </a>
  </div>
</template>

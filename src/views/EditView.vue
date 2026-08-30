<script setup>
import { computed, ref } from 'vue'
import { ArrowLeftIcon, EyeIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'
import { getTripById } from '../data/trips'
import Timeline from '../components/Timeline.vue'
import MapArea from '../components/MapArea.vue'
import DocumentPreviewModal from '../components/DocumentPreviewModal.vue'

// 本来はこの画面自体を router の navigation guard (beforeEnter) で
// 「ログイン済み かつ trip.author === currentUser」の場合のみ通す想定。
// 今回はモックのため認証チェックは省略している。
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const trip = computed(() => getTripById(props.id))
const selectedDocument = ref(null)
</script>

<template>
  <div v-if="trip" class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <RouterLink
          :to="{ name: 'post-detail', params: { id: trip.id } }"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          aria-label="詳細画面に戻る"
        >
          <ArrowLeftIcon class="h-5 w-5" aria-hidden="true" />
        </RouterLink>

        <div class="min-w-0 flex-1">
          <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <PencilSquareIcon class="h-3.5 w-3.5" aria-hidden="true" />
            編集モード
          </span>
          <h1 class="mt-1 truncate text-lg font-bold text-slate-900">{{ trip.title }}</h1>
        </div>

        <RouterLink
          :to="{ name: 'post-detail', params: { id: trip.id } }"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <EyeIcon class="h-4 w-4" aria-hidden="true" />
          公開ページを見る
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <p class="mb-4 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
        予定カード右上の <span class="font-semibold">≡ ハンドル</span> をドラッグすると並び替えできます。時間やタイトルはタップすると直接編集できます。
      </p>

      <!-- タイムライン(編集モード) + 地図 -->
      <div class="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-label="旅程タイムライン(編集)">
          <Timeline :items="trip.items" mode="edit" @open-document="selectedDocument = $event" />
        </section>

        <aside class="hidden md:block" aria-label="地図">
          <div class="sticky top-6 h-[calc(100vh-8rem)]">
            <MapArea />
          </div>
        </aside>
      </div>
    </main>

    <DocumentPreviewModal :document="selectedDocument" @close="selectedDocument = null" />
  </div>

  <div v-else class="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
    <p class="text-sm text-slate-500">指定された旅のしおりが見つかりませんでした。</p>
    <RouterLink :to="{ name: 'feed' }" class="text-sm font-semibold text-indigo-600 hover:underline">
      フィードに戻る
    </RouterLink>
  </div>
</template>

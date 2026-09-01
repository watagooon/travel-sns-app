<script setup>
import { onMounted, ref } from 'vue'
import { ArrowLeftIcon, CheckCircleIcon, EyeIcon, PencilSquareIcon } from '@heroicons/vue/24/outline'
import { useAuth } from '../composables/useAuth'
import { useTripsApi } from '../composables/useTripsApi'
import Timeline from '../components/Timeline.vue'
import MapArea from '../components/MapArea.vue'
import DocumentPreviewModal from '../components/DocumentPreviewModal.vue'
import AuthStatus from '../components/AuthStatus.vue'

// 本来はこの画面自体を router の navigation guard (beforeEnter) で
// 「ログイン済み」の場合のみ通す想定。ここでは画面内でログイン状態を確認し、
// 未ログインならログイン導線を表示する形にしている。
// 所有者チェックは API 側 (GET/PUT /api/trips/{id} が userId をパーティションキーに
// ポイントリードする) で構造的に強制されるため、他人の trip の id を直接開いても
// フロント側の判定を待たずに 404 になる。
const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const { isAuthenticated, isLoading: isAuthLoading, ready } = useAuth()
const { fetchTripById, updateTrip } = useTripsApi()

const trip = ref(null)
const isLoadingTrip = ref(false)
const loadError = ref('')
const selectedDocument = ref(null)
const timelineRef = ref(null)

const isSaving = ref(false)
const saveError = ref('')
const saveSucceeded = ref(false)

async function loadTrip() {
  isLoadingTrip.value = true
  loadError.value = ''
  try {
    trip.value = await fetchTripById(props.id)
  } catch (error) {
    loadError.value = error.message
  } finally {
    isLoadingTrip.value = false
  }
}

onMounted(async () => {
  await ready()
  if (isAuthenticated.value) {
    loadTrip()
  }
})

// 「保存する」: Timeline.vue が内部で保持している現在の並び順・編集結果を
// getFlattenedItems() で取り出し、PUT /api/trips/{id} にまとめて送信する。
async function handleSave() {
  if (!timelineRef.value) return

  isSaving.value = true
  saveError.value = ''
  saveSucceeded.value = false

  try {
    const items = timelineRef.value.getFlattenedItems()
    const saved = await updateTrip(props.id, {
      title: trip.value.title,
      items,
    })
    trip.value = saved
    saveSucceeded.value = true
    setTimeout(() => {
      saveSucceeded.value = false
    }, 2500)
  } catch (error) {
    saveError.value = error.message
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- 未ログイン -->
    <div v-if="!isAuthLoading && !isAuthenticated" class="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p class="text-sm text-slate-500">この旅程を編集するにはログインが必要です。</p>
      <AuthStatus />
    </div>

    <div v-else-if="isAuthLoading || isLoadingTrip" class="flex min-h-screen items-center justify-center text-sm text-slate-400">
      読み込んでいます...
    </div>

    <div v-else-if="loadError" class="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p class="text-sm text-rose-500">{{ loadError }}</p>
      <RouterLink :to="{ name: 'feed' }" class="text-sm font-semibold text-indigo-600 hover:underline">
        マイ旅のしおりに戻る
      </RouterLink>
    </div>

    <template v-else-if="trip">
      <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
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
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            <EyeIcon class="h-4 w-4" aria-hidden="true" />
            公開ページを見る
          </RouterLink>

          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isSaving"
            @click="handleSave"
          >
            <CheckCircleIcon class="h-4 w-4" aria-hidden="true" />
            {{ isSaving ? '保存中...' : '保存する' }}
          </button>
        </div>

        <p v-if="saveSucceeded" class="bg-emerald-50 px-4 py-1.5 text-center text-xs text-emerald-700 sm:px-6 lg:px-8">
          保存しました。
        </p>
        <p v-else-if="saveError" class="bg-rose-50 px-4 py-1.5 text-center text-xs text-rose-700 sm:px-6 lg:px-8">
          保存に失敗しました: {{ saveError }}
        </p>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <p class="mb-4 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          予定カード右上の <span class="font-semibold">≡ ハンドル</span> をドラッグすると並び替えできます。時間やタイトルはタップすると直接編集できます。編集内容は「保存する」を押すまでサーバーには反映されません。
        </p>

        <!-- タイムライン(編集モード) + 地図 -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_26rem]">
          <section aria-label="旅程タイムライン(編集)">
            <Timeline ref="timelineRef" :items="trip.items" mode="edit" @open-document="selectedDocument = $event" />
          </section>

          <aside class="hidden md:block" aria-label="地図">
            <div class="sticky top-6 h-[calc(100vh-8rem)]">
              <MapArea />
            </div>
          </aside>
        </div>
      </main>

      <DocumentPreviewModal :document="selectedDocument" @close="selectedDocument = null" />
    </template>
  </div>
</template>

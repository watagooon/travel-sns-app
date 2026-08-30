<script setup>
import { computed, ref } from 'vue'
import {
  ArrowLeftIcon,
  CameraIcon,
  HeartIcon as HeartOutlineIcon,
  ShareIcon,
  PencilSquareIcon,
} from '@heroicons/vue/24/outline'
import { HeartIcon as HeartSolidIcon } from '@heroicons/vue/24/solid'
import { getTripById } from '../data/trips'
import Timeline from '../components/Timeline.vue'
import MapArea from '../components/MapArea.vue'
import DocumentPreviewModal from '../components/DocumentPreviewModal.vue'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const trip = computed(() => getTripById(props.id))

// SNSアクション (いいね): モックのためコンポーネントローカルな状態のみで完結させる
const isLiked = ref(false)
const likeCount = ref(0)
if (trip.value) {
  likeCount.value = trip.value.likeCount
}

function toggleLike() {
  isLiked.value = !isLiked.value
  likeCount.value += isLiked.value ? 1 : -1
}

// 共有: Web Share API が使えればネイティブの共有シートを、
// 使えない場合はリンクをクリップボードにコピーする
const shareFeedback = ref('')

async function shareTrip() {
  const shareData = {
    title: trip.value?.title,
    text: `${trip.value?.title} の旅程をチェック！`,
    url: window.location.href,
  }
  try {
    if (navigator.share) {
      await navigator.share(shareData)
      return
    }
    await navigator.clipboard.writeText(shareData.url)
    shareFeedback.value = 'リンクをコピーしました'
  } catch {
    // ユーザーによる共有シートのキャンセル等は無視する
  } finally {
    if (shareFeedback.value) {
      setTimeout(() => {
        shareFeedback.value = ''
      }, 2000)
    }
  }
}

const selectedDocument = ref(null)

function formatRange(start, end) {
  const s = new Date(start)
  const e = new Date(end)
  const range = start === end ? `${s.getMonth() + 1}/${s.getDate()}` : `${s.getMonth() + 1}/${s.getDate()} 〜 ${e.getMonth() + 1}/${e.getDate()}`
  return range
}
</script>

<template>
  <div v-if="trip" class="min-h-screen bg-slate-50">
    <!-- ヘッダー: カバー写真 + タイトル -->
    <div class="relative h-56 w-full overflow-hidden bg-gradient-to-br sm:h-72" :class="trip.coverGradient">
      <CameraIcon class="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      <RouterLink
        :to="{ name: 'feed' }"
        class="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
        aria-label="フィードに戻る"
      >
        <ArrowLeftIcon class="h-5 w-5" aria-hidden="true" />
      </RouterLink>

      <div class="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <p class="text-xs font-medium text-white/80">{{ trip.destination }} ・ {{ formatRange(trip.startDate, trip.endDate) }}</p>
        <h1 class="mt-1 text-xl font-bold text-white sm:text-2xl">{{ trip.title }}</h1>
      </div>
    </div>

    <div class="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      <!-- ジャンルタグ + 作成者 -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in trip.genreTags"
            :key="tag"
            class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
          >
            #{{ tag }}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            {{ trip.author.initial }}
          </span>
          <span class="text-sm text-slate-600">{{ trip.author.name }}</span>
        </div>
      </div>

      <!-- SNSアクションボタン -->
      <div class="mt-4 flex items-center gap-2 border-y border-slate-200 py-3">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition"
          :class="isLiked ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          @click="toggleLike"
        >
          <component :is="isLiked ? HeartSolidIcon : HeartOutlineIcon" class="h-4 w-4" aria-hidden="true" />
          {{ likeCount }}
        </button>

        <div class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
            @click="shareTrip"
          >
            <ShareIcon class="h-4 w-4" aria-hidden="true" />
            共有
          </button>
          <Transition name="fade">
            <span
              v-if="shareFeedback"
              class="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white"
            >
              {{ shareFeedback }}
            </span>
          </Transition>
        </div>

        <!-- 本来は認証済みかつ作成者本人の場合のみ表示するボタン (今回はモックのため常時表示) -->
        <RouterLink
          :to="{ name: 'post-edit', params: { id: trip.id } }"
          class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <PencilSquareIcon class="h-4 w-4" aria-hidden="true" />
          編集する
        </RouterLink>
      </div>

      <!-- タイムライン(閲覧モード) + 地図 -->
      <div class="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-label="旅程タイムライン">
          <Timeline :items="trip.items" mode="view" @open-document="selectedDocument = $event" />
        </section>

        <aside class="hidden md:block" aria-label="地図">
          <div class="sticky top-6 h-[calc(100vh-8rem)]">
            <MapArea />
          </div>
        </aside>
      </div>
    </div>

    <DocumentPreviewModal :document="selectedDocument" @close="selectedDocument = null" />
  </div>

  <!-- 存在しない旅程IDでアクセスされた場合 -->
  <div v-else class="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
    <p class="text-sm text-slate-500">指定された旅のしおりが見つかりませんでした。</p>
    <RouterLink :to="{ name: 'feed' }" class="text-sm font-semibold text-indigo-600 hover:underline">
      フィードに戻る
    </RouterLink>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

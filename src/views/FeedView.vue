<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PlusIcon } from '@heroicons/vue/24/outline'
import { useAuth } from '../composables/useAuth'
import { useTripsApi } from '../composables/useTripsApi'
import TravelCard from '../components/TravelCard.vue'
import AuthStatus from '../components/AuthStatus.vue'

// 現状のAPI (GET /api/trips) は「ログイン中ユーザー自身の旅程一覧」を返す設計のため、
// このフィードは "マイ旅のしおり" として振る舞う (全ユーザー横断の公開フィードにするには
// 別途 GET /api/trips?scope=public のようなクロスパーティション用エンドポイントが必要)。
const router = useRouter()
const { isAuthenticated, isLoading: isAuthLoading, ready } = useAuth()
const { fetchMyTrips, createTrip } = useTripsApi()

const trips = ref([])
const isLoadingTrips = ref(false)
const errorMessage = ref('')
const isCreating = ref(false)

async function loadTrips() {
  isLoadingTrips.value = true
  errorMessage.value = ''
  try {
    trips.value = await fetchMyTrips()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoadingTrips.value = false
  }
}

// 認証状態が確定してから一覧を取得する
onMounted(async () => {
  await ready()
  if (isAuthenticated.value) {
    loadTrips()
  }
})

// 新規旅程を作成し、そのまま編集画面へ遷移する。
// 予定 (items) を空で作成するため、個々の予定を追加するUIは今後別途必要。
async function handleCreateTrip() {
  isCreating.value = true
  errorMessage.value = ''
  try {
    const today = new Date().toISOString().slice(0, 10)
    const created = await createTrip({
      title: '新しい旅のしおり',
      destination: '',
      startDate: today,
      endDate: today,
      coverGradient: 'from-slate-400 to-slate-600',
      genreTags: [],
      items: [],
    })
    router.push({ name: 'post-edit', params: { id: created.id } })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-indigo-600">Travel SNS</p>
          <h1 class="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">マイ旅のしおり</h1>
          <p class="mt-1 text-sm text-slate-500">あなたが作成した旅程の一覧です。</p>
        </div>
        <div class="flex items-center gap-3">
          <button
            v-if="isAuthenticated"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="isCreating"
            @click="handleCreateTrip"
          >
            <PlusIcon class="h-4 w-4" aria-hidden="true" />
            {{ isCreating ? '作成中...' : '新規作成' }}
          </button>
          <AuthStatus />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div v-if="isAuthLoading" class="py-24 text-center text-sm text-slate-400">
        認証状態を確認しています...
      </div>

      <div v-else-if="!isAuthenticated" class="flex flex-col items-center gap-4 py-24 text-center">
        <p class="text-sm text-slate-500">旅のしおりを見る・作成するにはログインしてください。</p>
        <AuthStatus />
      </div>

      <div v-else-if="isLoadingTrips" class="py-24 text-center text-sm text-slate-400">
        旅程を読み込んでいます...
      </div>

      <div v-else-if="errorMessage" class="flex flex-col items-center gap-3 py-24 text-center">
        <p class="text-sm text-rose-500">{{ errorMessage }}</p>
        <button
          type="button"
          class="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          @click="loadTrips"
        >
          再試行
        </button>
      </div>

      <div v-else-if="trips.length === 0" class="flex flex-col items-center gap-3 py-24 text-center">
        <p class="text-sm text-slate-400">まだ旅のしおりがありません。最初の1件を作成してみましょう。</p>
      </div>

      <!--
        Instagram / Pinterest のようなカードグリッド。
        - モバイル: 2カラム
        - タブレット以上: 3〜4カラムまで広げる
      -->
      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        <TravelCard v-for="trip in trips" :key="trip.id" :trip="trip" />
      </div>
    </main>
  </div>
</template>

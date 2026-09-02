<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EyeIcon,
  LinkIcon,
  PencilSquareIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/vue/24/outline'
import { useAuth } from '../composables/useAuth'
import { useTripsApi } from '../composables/useTripsApi'
import Timeline from '../components/Timeline.vue'
import MapArea from '../components/MapArea.vue'
import DocumentPreviewModal from '../components/DocumentPreviewModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
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

const route = useRoute()
const router = useRouter()
const { isAuthenticated, isLoading: isAuthLoading, ready } = useAuth()
const { fetchTripById, updateTrip, deleteTrip } = useTripsApi()

// 招待URL (/edit/{id}?token=...) 経由でアクセスしてきた場合の editToken。
// 所有者本人が普通にアクセスした場合は undefined になる。
const inviteToken = computed(() => {
  const value = route.query.token
  return typeof value === 'string' && value ? value : undefined
})
// 「同行者セッション」かどうか (=招待URL経由でのアクセス)。
// 削除や招待URL発行など、所有者専用の操作をUI上でも隠すために使う
// (バックエンド側でも同様の権限チェックを行っており、これはあくまでUI上の親切さ)。
const isGuestSession = computed(() => !!inviteToken.value)

const trip = ref(null)
const isLoadingTrip = ref(false)
const loadError = ref('')
const selectedDocument = ref(null)
const timelineRef = ref(null)
const isSaving = ref(false)
const isDeleteDialogOpen = ref(false)
const isDeleting = ref(false)
const isReloadDialogOpen = ref(false)
const isReloading = ref(false)

// 旅の基本情報 (タイトル・目的地・日程) 用の編集フォーム。
// trip 本体とは別の reactive オブジェクトにしておき、保存時にまとめて送信する。
const metaForm = reactive({
  title: '',
  destination: '',
  startDate: '',
  endDate: '',
})

async function loadTrip() {
  isLoadingTrip.value = true
  loadError.value = ''
  try {
    trip.value = await fetchTripById(props.id, inviteToken.value)
    metaForm.title = trip.value.title ?? ''
    metaForm.destination = trip.value.destination ?? ''
    metaForm.startDate = trip.value.startDate ?? ''
    metaForm.endDate = trip.value.endDate ?? ''
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

// --- 簡易トースト通知 ---
const toast = reactive({ message: '', type: 'success' })
let toastTimer = null
function showToast(message, type = 'success') {
  toast.message = message
  toast.type = type
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.message = ''
  }, 3000)
}

// 「保存する」: 基本情報フォーム + Timeline.vue が内部で保持している
// 現在の並び順・追加/編集/削除の結果を1つのJSONにまとめ、PUT /api/trips/{id} へ送信する。
async function handleSave() {
  if (!timelineRef.value || !trip.value) return
  if (!metaForm.title.trim()) {
    showToast('タイトルを入力してください。', 'error')
    return
  }

  isSaving.value = true
  try {
    const items = timelineRef.value.getFlattenedItems()
    const saved = await updateTrip(
      props.id,
      {
        title: metaForm.title.trim(),
        destination: metaForm.destination.trim(),
        startDate: metaForm.startDate || null,
        endDate: metaForm.endDate || null,
        items,
      },
      inviteToken.value,
    )
    trip.value = saved
    showToast('保存しました。')
  } catch (error) {
    showToast(`保存に失敗しました: ${error.message}`, 'error')
  } finally {
    isSaving.value = false
  }
}

// 「同行者を招待する」: この旅程の editToken を使った編集用URLを組み立て、
// クリップボードにコピーする。招待URLさえ知っていれば、リンクを受け取った人は
// (自分自身のアカウントでログインした上で) 作成者と同じように編集・保存できる。
async function handleInvite() {
  if (!trip.value?.editToken) return

  const inviteUrl = `${window.location.origin}/edit/${trip.value.id}?token=${trip.value.editToken}`
  try {
    await navigator.clipboard.writeText(inviteUrl)
    showToast('招待URLをコピーしました。')
  } catch {
    showToast('クリップボードへのコピーに失敗しました。', 'error')
  }
}

// 「最新データを再読み込み」: 同行者が裏で編集したかもしれない最新の内容を
// 取得し直し、画面を上書きする。ローカルの未保存の変更は失われるため、
// 実行前に必ず確認ダイアログを挟む。
async function handleReload() {
  isReloading.value = true
  try {
    await loadTrip()
    isReloadDialogOpen.value = false
    if (!loadError.value) {
      showToast('最新のデータを読み込みました。')
    }
  } finally {
    isReloading.value = false
  }
}

// 「この旅行計画を削除する」: ConfirmDialog で承認された後に実行される。
// 取り消し不可の破壊的操作のため、確認ダイアログを必ず経由させる。
async function handleDeleteTrip() {
  isDeleting.value = true
  try {
    await deleteTrip(props.id)
    router.push({ name: 'feed' })
  } catch (error) {
    isDeleteDialogOpen.value = false
    showToast(`削除に失敗しました: ${error.message}`, 'error')
  } finally {
    isDeleting.value = false
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
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                <PencilSquareIcon class="h-3.5 w-3.5" aria-hidden="true" />
                編集モード
              </span>
              <span
                v-if="isGuestSession"
                class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20"
              >
                <UserGroupIcon class="h-3.5 w-3.5" aria-hidden="true" />
                同行者として編集中
              </span>
            </div>
            <h1 class="mt-1 truncate text-lg font-bold text-slate-900">{{ metaForm.title || '無題の旅程' }}</h1>
          </div>

          <!-- 最新データを再読み込み: 同行者が裏で編集したかもしれない内容を取り込む -->
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
            aria-label="最新データを再読み込み"
            title="最新データを再読み込み"
            @click="isReloadDialogOpen = true"
          >
            <ArrowPathIcon class="h-5 w-5" aria-hidden="true" />
          </button>

          <!-- 同行者を招待する: 所有者のみ (招待URL経由のセッションでは表示しない) -->
          <button
            v-if="!isGuestSession"
            type="button"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
            @click="handleInvite"
          >
            <LinkIcon class="h-4 w-4" aria-hidden="true" />
            同行者を招待する
          </button>

          <RouterLink
            :to="{ name: 'post-detail', params: { id: trip.id } }"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            <EyeIcon class="h-4 w-4" aria-hidden="true" />
            公開ページを見る
          </RouterLink>
        </div>
      </header>

      <main class="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 lg:px-8">
        <!-- 旅の基本情報 (タイトル・目的地・日程) 編集フォーム -->
        <section class="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">旅の基本情報</h2>
          <div class="mt-3 space-y-3">
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">タイトル</label>
              <input
                v-model="metaForm.title"
                type="text"
                placeholder="旅のタイトルを入力"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-bold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">目的地</label>
              <input
                v-model="metaForm.destination"
                type="text"
                placeholder="例: ソウル, 韓国"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-xs font-semibold text-slate-600">開始日</label>
                <input
                  v-model="metaForm.startDate"
                  type="date"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold text-slate-600">終了日</label>
                <input
                  v-model="metaForm.endDate"
                  type="date"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
          </div>
        </section>

        <p class="mb-4 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          予定カードの<span class="font-semibold">右上の≡ハンドル</span>をドラッグすると並び替え、
          <span class="font-semibold">カードをタップ</span>すると編集・削除ができます。編集内容は「保存する」を押すまでサーバーには反映されません。
        </p>

        <!-- タイムライン(編集モード) + 地図 -->
        <div class="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_26rem]">
          <section aria-label="旅程タイムライン(編集)">
            <Timeline
              ref="timelineRef"
              :items="trip.items"
              :start-date="metaForm.startDate"
              :end-date="metaForm.endDate"
              :trip-id="trip.id"
              mode="edit"
              @open-document="selectedDocument = $event"
            />
          </section>

          <aside class="hidden md:block" aria-label="地図">
            <div class="sticky top-6 h-[calc(100vh-8rem)]">
              <MapArea />
            </div>
          </aside>
        </div>

        <!-- 危険な操作 (所有者のみ。同行者セッションでは削除権限自体がAPI側でも許可されないため隠す) -->
        <section v-if="!isGuestSession" class="mt-10 rounded-2xl border border-rose-200 bg-rose-50/50 p-4 sm:p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-rose-600">危険な操作</h2>
          <p class="mt-1 text-sm text-rose-700">この旅行計画を削除すると、元に戻すことはできません。</p>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
            @click="isDeleteDialogOpen = true"
          >
            <TrashIcon class="h-4 w-4" aria-hidden="true" />
            この旅行計画を削除する
          </button>
        </section>
      </main>

      <!-- フローティング保存ボタン -->
      <button
        type="button"
        class="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="isSaving"
        @click="handleSave"
      >
        <svg v-if="isSaving" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <CheckCircleIcon v-else class="h-5 w-5" aria-hidden="true" />
        {{ isSaving ? '保存中...' : '保存する' }}
      </button>

      <!-- トースト通知 -->
      <Transition name="toast">
        <div
          v-if="toast.message"
          class="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
          :class="toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'"
        >
          <CheckCircleIcon v-if="toast.type === 'success'" class="h-4 w-4 shrink-0" aria-hidden="true" />
          <ExclamationTriangleIcon v-else class="h-4 w-4 shrink-0" aria-hidden="true" />
          {{ toast.message }}
        </div>
      </Transition>

      <DocumentPreviewModal :document="selectedDocument" @close="selectedDocument = null" />

      <ConfirmDialog
        :open="isDeleteDialogOpen"
        title="旅行計画を削除しますか？"
        :message="`「${metaForm.title || trip.title}」を削除します。この操作は取り消せません。`"
        confirm-label="削除する"
        danger
        :confirming="isDeleting"
        @close="isDeleteDialogOpen = false"
        @confirm="handleDeleteTrip"
      />

      <ConfirmDialog
        :open="isReloadDialogOpen"
        title="最新データを読み込みますか？"
        message="同行者が編集した最新の内容を取得します。保存していない変更がある場合は失われます。"
        confirm-label="読み込む"
        :confirming="isReloading"
        @close="isReloadDialogOpen = false"
        @confirm="handleReload"
      />
    </template>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.5rem);
}
</style>

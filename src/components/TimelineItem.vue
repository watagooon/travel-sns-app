<script setup>
import { computed } from 'vue'
import { MapPinIcon, ArrowTopRightOnSquareIcon, Bars3Icon } from '@heroicons/vue/24/outline'
import { getCategoryMeta } from '../utils/categoryMeta'
import AttachmentButton from './AttachmentButton.vue'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  isLast: {
    type: Boolean,
    default: false,
  },
  // "edit" ならドラッグハンドルを表示し、カードタップで編集モーダルを開けるようにする。
  // "view" (既定) では閲覧専用の表示になる。
  mode: {
    type: String,
    default: 'view',
    validator: (value) => ['edit', 'view'].includes(value),
  },
})

const emit = defineEmits(['open-document', 'edit-item'])

// item.type が無い(=同機能を追加する前に作られた旧データ)場合は
// "activity" (通常の予定) として安全にフォールバックする。
const itemType = computed(() => props.item.type ?? 'activity')
const isTransitType = computed(() => itemType.value === 'flight' || itemType.value === 'transit')

const meta = computed(() => getCategoryMeta(props.item.category))
const isEditable = computed(() => props.mode === 'edit')

// 非公開ドキュメント (isPrivate: true) は閲覧モードでは DOM 自体から除外する。
const visibleDocuments = computed(() => {
  return props.item.documents.filter((doc) => isEditable.value || !doc.isPrivate)
})

const hasLocation = computed(() => !!props.item.location?.name)
const hasCoordinates = computed(() => props.item.location?.lat != null && props.item.location?.lng != null)

// スマートフォンではモック地図を非表示にする代わりに、各予定から
// 端末標準の地図アプリを開けるディープリンクを用意する (位置情報が未設定の新規追加アイテムでは非表示)。
const mapDeepLink = computed(() => {
  const { lat, lng, name } = props.item.location
  const query = encodeURIComponent(name)
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}(${query})`
})

// フライト/移動の所要時間を "1時間30分" のように計算する (到着が翌日にまたがる
// 単純なケースにも簡易対応: 到着時刻 < 出発時刻 なら +24時間とみなす)。
const duration = computed(() => {
  if (!isTransitType.value) return ''
  const { departureTime, arrivalTime } = props.item
  if (!departureTime || !arrivalTime) return ''

  const [depH, depM] = departureTime.split(':').map(Number)
  const [arrH, arrM] = arrivalTime.split(':').map(Number)
  if ([depH, depM, arrH, arrM].some((n) => Number.isNaN(n))) return ''

  let minutes = arrH * 60 + arrM - (depH * 60 + depM)
  if (minutes < 0) minutes += 24 * 60
  if (minutes === 0) return ''

  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
})

// 編集モードではカード本体のクリックで編集モーダルを開く。
// ドラッグハンドル・ドキュメントボタン・マップリンクは個別に @click.stop で
// バブリングを止めているため、誤って編集モーダルが開くことはない。
function handleCardClick() {
  if (isEditable.value) {
    emit('edit-item')
  }
}
</script>

<template>
  <li class="relative flex gap-4 pb-8 last:pb-0">
    <!-- タイムラインの縦線 -->
    <div
      v-if="!isLast"
      class="absolute left-[19px] top-10 bottom-0 w-px bg-slate-200"
      aria-hidden="true"
    />

    <!-- アイコン付きドット -->
    <div
      class="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white"
      :class="meta.dot"
    >
      <component :is="meta.icon" class="h-5 w-5 text-white" aria-hidden="true" />
    </div>

    <!-- コンテンツカード -->
    <div
      class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition"
      :class="isEditable ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md' : ''"
      @click="handleCardClick"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <!-- 通常の予定: 時間を表示 / フライト・移動: カテゴリバッジのみ (時間は下の出発/到着行に表示) -->
          <span v-if="!isTransitType" class="px-1.5 py-0.5 text-sm font-semibold tabular-nums text-slate-900">
            {{ item.time }}
          </span>
          <span
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset"
            :class="meta.badge"
          >
            {{ meta.label }}
          </span>
        </div>

        <!-- ドラッグハンドル: 編集モードのみ表示。ここを掴んだ時だけ並び替えが発動する (handle オプション) -->
        <button
          v-if="isEditable"
          type="button"
          class="drag-handle -mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
          style="touch-action: none"
          aria-label="ドラッグして並び替え"
          @click.stop
        >
          <Bars3Icon class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <!-- フライト / 移動: 出発 → 到着 を1ブロックで表現する専用レイアウト -->
      <div v-if="isTransitType" class="mt-2">
        <div class="flex items-center gap-2">
          <component :is="meta.icon" class="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span class="text-sm font-semibold tabular-nums text-slate-900">{{ item.departureTime }}</span>
          <span class="truncate text-sm text-slate-700">{{ item.departureLocation }}</span>
        </div>

        <div class="flex items-center gap-2 py-0.5 pl-[7px]">
          <div class="h-4 w-px border-l-2 border-dotted border-slate-300" aria-hidden="true" />
          <span v-if="duration" class="text-[11px] text-slate-400">所要時間: {{ duration }}</span>
        </div>

        <div class="flex items-center gap-2">
          <MapPinIcon class="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span class="text-sm font-semibold tabular-nums text-slate-900">{{ item.arrivalTime }}</span>
          <span class="truncate text-sm text-slate-700">{{ item.arrivalLocation }}</span>
        </div>

        <p v-if="item.description" class="mt-2 text-sm leading-relaxed text-slate-600">メモ: {{ item.description }}</p>
      </div>

      <!-- 通常の予定: タイトル + 詳細メモ -->
      <template v-else>
        <h3 class="mt-1.5 px-1.5 text-base font-bold text-slate-900">{{ item.title }}</h3>
        <p v-if="item.description" class="mt-1 text-sm leading-relaxed text-slate-600">{{ item.description }}</p>
      </template>

      <!-- 添付写真 (Azure Blob Storage 上の画像URL) -->
      <img
        v-if="item.imageUrl"
        :src="item.imageUrl"
        alt=""
        class="mt-3 h-40 w-full rounded-lg object-cover"
        loading="lazy"
      />

      <div v-if="hasLocation" class="mt-2 flex items-center gap-1 text-xs text-slate-500">
        <MapPinIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ item.location.name }}</span>
      </div>

      <!-- ドキュメントボタン (非公開のものは閲覧モードでは visibleDocuments から除外済み) -->
      <div v-if="visibleDocuments.length" class="mt-3 flex flex-wrap gap-2" @click.stop>
        <AttachmentButton
          v-for="document in visibleDocuments"
          :key="document.id"
          :attachment="document"
          @open="emit('open-document', $event)"
        />
      </div>

      <!-- モバイル専用: マップアプリで開くボタン (768px未満 かつ 位置情報がある場合のみ表示) -->
      <a
        v-if="hasCoordinates"
        :href="mapDeepLink"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-3 flex md:hidden items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition active:scale-[0.98]"
        @click.stop
      >
        <MapPinIcon class="h-4 w-4" aria-hidden="true" />
        マップアプリで開く
        <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  </li>
</template>

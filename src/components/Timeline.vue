<script setup>
import { computed, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { PlusIcon } from '@heroicons/vue/24/outline'
import TimelineItem from './TimelineItem.vue'
import TimelineItemForm from './TimelineItemForm.vue'
import { buildDateRange, formatShortDate } from '../utils/dateRange'

const props = defineProps({
  items: {
    type: Array,
    required: true,
  },
  // 旅の基本情報 (メタデータ) の日程。この2つを起点に日付ブロックを生成する。
  startDate: {
    type: String,
    default: null,
  },
  endDate: {
    type: String,
    default: null,
  },
  // 画像アップロード時に Blob のパスへ含める識別子
  tripId: {
    type: String,
    default: null,
  },
  // "edit"  : D&D による並び替え・予定の追加/編集/削除をすべて許可し、非公開ドキュメントも表示する（作成者専用の編集画面）
  // "view"  : 表示専用。D&D と編集操作は無効化し、isPrivate: true のドキュメントは DOM から除外する（一般公開の閲覧画面）
  mode: {
    type: String,
    default: 'view',
    validator: (value) => ['edit', 'view'].includes(value),
  },
})

const emit = defineEmits(['open-document'])

const isEditable = computed(() => props.mode === 'edit')

// startDate 〜 endDate から日付ブロックを組み立て、各アイテムを item.date で該当ブロックへ
// 振り分ける。日程が未設定 (dateRange が空) の場合は、アイテムに残っている
// dayIndex/date 情報から従来通りグルーピングするフォールバックを使う
// (日程未入力のまま予定だけ先に登録したケースでもデータを失わないため)。
// どちらにも属さない (日程変更でレンジ外になった) アイテムは「日程外の予定」としてまとめる。
function buildDayGroups(items, startDate, endDate) {
  const dateRange = buildDateRange(startDate, endDate)

  if (dateRange.length === 0) {
    return buildDayGroupsFromItemsOnly(items)
  }

  const itemsByDate = new Map()
  for (const item of items) {
    const key = item.date ?? ''
    if (!itemsByDate.has(key)) itemsByDate.set(key, [])
    itemsByDate.get(key).push({ ...item })
  }

  const groups = dateRange.map((day) => ({
    ...day,
    items: (itemsByDate.get(day.date) ?? []).sort((a, b) => a.time.localeCompare(b.time)),
  }))

  const matchedDates = new Set(dateRange.map((day) => day.date))
  const orphanItems = items.filter((item) => !matchedDates.has(item.date)).map((item) => ({ ...item }))
  if (orphanItems.length > 0) {
    groups.push({
      dayIndex: groups.length + 1,
      dayLabel: '日程外の予定',
      date: null,
      dayOfWeek: '',
      items: orphanItems,
    })
  }

  return groups
}

// 日程 (startDate/endDate) が未設定のときのフォールバック: アイテム自身が持つ
// dayIndex/date/dayLabel/dayOfWeek からグルーピングする (旧バージョンの挙動)。
function buildDayGroupsFromItemsOnly(items) {
  const map = new Map()
  for (const item of items) {
    const key = item.dayIndex ?? 1
    if (!map.has(key)) {
      map.set(key, {
        dayIndex: key,
        dayLabel: item.dayLabel ?? `${key}日目`,
        date: item.date ?? null,
        dayOfWeek: item.dayOfWeek ?? '',
        items: [],
      })
    }
    map.get(key).items.push({ ...item })
  }
  return [...map.values()].sort((a, b) => a.dayIndex - b.dayIndex)
}

const dayGroups = ref(buildDayGroups(props.items, props.startDate, props.endDate))

// /edit/:id や /posts/:id 間をルーター遷移した際、同じ Timeline インスタンスが
// 使い回されて items だけ差し替わるケースに対応するため、props.items を監視して
// ローカル状態を再構築する。
watch(
  () => props.items,
  (newItems) => {
    dayGroups.value = buildDayGroups(newItems, props.startDate, props.endDate)
  },
)

// 旅の基本情報フォームで startDate/endDate をその場で編集した際、タイムラインの
// 日付ブロック構成を即座に反映する。編集中 (未保存) のアイテムを失わないよう、
// props.items ではなく「現在の dayGroups を平坦化したもの」を再分配し直す。
watch(
  () => [props.startDate, props.endDate],
  () => {
    const currentItems = dayGroups.value.flatMap((dayGroup) => dayGroup.items)
    dayGroups.value = buildDayGroups(currentItems, props.startDate, props.endDate)
  },
)

// 閲覧モードでは予定が1件も無い日をわざわざ表示しない (編集モードでは
// 予定を追加できるよう、空の日でも常に表示する)。
const visibleDayGroups = computed(() => {
  if (isEditable.value) return dayGroups.value
  return dayGroups.value.filter((dayGroup) => dayGroup.items.length > 0)
})

// 同じ日の中での並び替えは vuedraggable が v-model 経由で配列を直接
// 書き換えてくれるだけで完結する。日をまたいで予定をドロップした場合は
// (すべての <draggable> に同じ group="itinerary" を指定しているため
// 日付をまたぐドラッグも可能) 移動先の日付情報をアイテムに反映する。
function handleGroupChange(event, dayGroup) {
  if (event.added) {
    const movedItem = event.added.element
    movedItem.date = dayGroup.date
    movedItem.dayIndex = dayGroup.dayIndex
    movedItem.dayLabel = dayGroup.dayLabel
    movedItem.dayOfWeek = dayGroup.dayOfWeek
  }
}

// --- 予定の追加/編集/削除モーダルの状態管理 ---
const isFormOpen = ref(false)
const editingDayGroup = ref(null) // 追加/編集対象がどの日に属するか
const editingItemId = ref(null) // null = 追加モード, id = 編集モード

const editingItem = computed(() => {
  if (!editingItemId.value || !editingDayGroup.value) return null
  return editingDayGroup.value.items.find((item) => item.id === editingItemId.value) ?? null
})

function openAddForm(dayGroup) {
  editingDayGroup.value = dayGroup
  editingItemId.value = null
  isFormOpen.value = true
}

function openEditForm(item, dayGroup) {
  editingDayGroup.value = dayGroup
  editingItemId.value = item.id
  isFormOpen.value = true
}

function closeForm() {
  isFormOpen.value = false
}

function handleFormSubmit(payload) {
  if (editingItemId.value) {
    // 編集: 既存アイテムのフィールドを上書き
    const target = editingDayGroup.value.items.find((item) => item.id === editingItemId.value)
    if (target) {
      Object.assign(target, payload)
    }
  } else {
    // 追加: 対象の日に新しいアイテムを追加し、時間順に並べ直す
    const dayGroup = editingDayGroup.value
    const newItem = {
      id: crypto.randomUUID(),
      date: dayGroup.date,
      dayIndex: dayGroup.dayIndex,
      dayLabel: dayGroup.dayLabel,
      dayOfWeek: dayGroup.dayOfWeek,
      time: payload.time,
      category: payload.category,
      title: payload.title,
      description: payload.description,
      imageUrl: payload.imageUrl,
      location: { name: '', address: '', lat: null, lng: null },
      documents: [],
    }
    dayGroup.items.push(newItem)
    dayGroup.items.sort((a, b) => a.time.localeCompare(b.time))
  }
  closeForm()
}

function handleFormDelete() {
  if (!editingItemId.value || !editingDayGroup.value) return
  const dayGroup = editingDayGroup.value
  const index = dayGroup.items.findIndex((item) => item.id === editingItemId.value)
  if (index !== -1) {
    dayGroup.items.splice(index, 1)
  }
  closeForm()
}

// 現在の並び順・追加/編集/削除の結果を1つの配列に平坦化して返す。
// 親コンポーネント (EditView.vue) が「保存する」ボタン押下時に呼び出し、
// PUT /api/trips/{id} へ送るペイロードを組み立てるのに使う。
// (継続的な同期は行わず、必要なタイミングで能動的に取得する設計にすることで、
//  props.items の watch とのフィードバックループを避けている)
function getFlattenedItems() {
  return dayGroups.value.flatMap((dayGroup) => dayGroup.items)
}

defineExpose({ getFlattenedItems })
</script>

<template>
  <div class="space-y-8">
    <!-- 日程未設定 かつ 予定も無い場合 -->
    <div v-if="dayGroups.length === 0 && isEditable" class="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
      <p class="text-sm text-slate-400">上の「旅の基本情報」で日程 (開始日・終了日) を設定すると、<br class="hidden sm:inline" />タイムラインが自動的に生成されます。</p>
    </div>
    <div v-else-if="dayGroups.length === 0" class="py-16 text-center text-sm text-slate-400">
      予定はまだ登録されていません。
    </div>

    <section v-for="dayGroup in visibleDayGroups" :key="dayGroup.dayIndex">
      <!-- 日付ヘッダー -->
      <div class="sticky top-0 z-20 -mx-4 mb-4 bg-slate-50/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:px-3">
        <h2 class="flex items-baseline gap-2 text-sm font-bold text-slate-800">
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-900 px-1.5 text-xs font-bold text-white"
          >
            {{ dayGroup.dayIndex }}
          </span>
          {{ dayGroup.dayLabel }}
          <span v-if="dayGroup.date" class="font-normal text-slate-500">
            {{ formatShortDate(dayGroup.date) }}（{{ dayGroup.dayOfWeek }}）
          </span>
        </h2>
      </div>

      <!--
        並び替え可能なリスト。mode="view" では :disabled="true" にして
        D&D 自体を完全に無効化する (ハンドル表示の出し分けは TimelineItem 側で行う)。
        - handle: ".drag-handle" を掴んだ時だけドラッグが開始する
          (カード本体をタップしてもスクロールを邪魔しない)
        - group: 全日で同じ値にしておくことで、日をまたいだドロップも許可する
        - ghost-class: ドロップ先に表示されるプレースホルダーを半透明に
        - chosen-class: 掴んでいる最中のアイテム本体に影+半透明を付与
      -->
      <draggable
        v-model="dayGroup.items"
        tag="ol"
        class="pl-1"
        item-key="id"
        handle=".drag-handle"
        group="itinerary"
        :animation="200"
        :force-fallback="true"
        :disabled="!isEditable"
        ghost-class="timeline-drag-ghost"
        chosen-class="timeline-drag-chosen"
        drag-class="timeline-drag-dragging"
        @change="(event) => handleGroupChange(event, dayGroup)"
      >
        <template #item="{ element, index }">
          <TimelineItem
            :item="element"
            :is-last="index === dayGroup.items.length - 1"
            :mode="mode"
            @open-document="emit('open-document', $event)"
            @edit-item="openEditForm(element, dayGroup)"
          />
        </template>
      </draggable>

      <!-- この日の最後に「＋新しい予定を追加」ボタンを配置 (「日程外の予定」バケツには出さない) -->
      <button
        v-if="isEditable && dayGroup.date"
        type="button"
        class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500"
        @click="openAddForm(dayGroup)"
      >
        <PlusIcon class="h-4 w-4" aria-hidden="true" />
        新しい予定を追加
      </button>
    </section>

    <TimelineItemForm
      v-if="isEditable"
      :open="isFormOpen"
      :item="editingItem"
      :trip-id="tripId"
      @submit="handleFormSubmit"
      @delete="handleFormDelete"
      @close="closeForm"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { PlusIcon } from '@heroicons/vue/24/outline'
import TimelineItem from './TimelineItem.vue'
import TimelineItemForm from './TimelineItemForm.vue'

const props = defineProps({
  items: {
    type: Array,
    required: true,
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

// dayIndex ごとにグルーピングする。並び替え・追加・編集・削除はすべて
// この dayGroups (ローカルの reactive state) を直接書き換えることで完結させる。
// props.items はあくまで初期値(APIから取得した保存済みデータ)としてのみ使用する。
function buildDayGroups(items) {
  const map = new Map()
  for (const item of items) {
    if (!map.has(item.dayIndex)) {
      map.set(item.dayIndex, {
        dayIndex: item.dayIndex,
        dayLabel: item.dayLabel,
        date: item.date,
        dayOfWeek: item.dayOfWeek,
        items: [],
      })
    }
    map.get(item.dayIndex).items.push({ ...item })
  }
  return [...map.values()].sort((a, b) => a.dayIndex - b.dayIndex)
}

const dayGroups = ref(buildDayGroups(props.items))

// /edit/:id や /posts/:id 間をルーター遷移した際、同じ Timeline インスタンスが
// 使い回されて items だけ差し替わるケースに対応するため、props.items を監視して
// ローカル状態を再構築する。
watch(
  () => props.items,
  (newItems) => {
    dayGroups.value = buildDayGroups(newItems)
  },
)

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

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

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// 予定が1件も無い (新規作成直後の旅程など) 状態から、最初の1日目を作成して
// すぐに最初の予定を追加できるようにする。
function addFirstDay() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const bootstrapGroup = {
    dayIndex: 1,
    dayLabel: '1日目',
    date: todayStr,
    dayOfWeek: WEEKDAY_LABELS[new Date(todayStr).getDay()],
    items: [],
  }
  dayGroups.value = [bootstrapGroup]
  openAddForm(bootstrapGroup)
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
    <!-- 予定が1件も無い場合 (新規作成直後など) -->
    <div
      v-if="dayGroups.length === 0 && isEditable"
      class="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center"
    >
      <p class="text-sm text-slate-400">まだ予定が登録されていません。</p>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        @click="addFirstDay"
      >
        <PlusIcon class="h-4 w-4" aria-hidden="true" />
        最初の予定を追加
      </button>
    </div>
    <div v-else-if="dayGroups.length === 0" class="py-16 text-center text-sm text-slate-400">
      予定はまだ登録されていません。
    </div>

    <section v-for="dayGroup in dayGroups" :key="dayGroup.dayIndex">
      <!-- 日付ヘッダー -->
      <div class="sticky top-0 z-20 -mx-4 mb-4 bg-slate-50/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:px-3">
        <h2 class="flex items-baseline gap-2 text-sm font-bold text-slate-800">
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-900 px-1.5 text-xs font-bold text-white"
          >
            {{ dayGroup.dayIndex }}
          </span>
          {{ dayGroup.dayLabel }}
          <span class="font-normal text-slate-500">{{ formatDate(dayGroup.date) }}（{{ dayGroup.dayOfWeek }}）</span>
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

      <!-- この日の最後に「＋新しい予定を追加」ボタンを配置 -->
      <button
        v-if="isEditable"
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
      @submit="handleFormSubmit"
      @delete="handleFormDelete"
      @close="closeForm"
    />
  </div>
</template>

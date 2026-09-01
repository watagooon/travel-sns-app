<script setup>
import { computed, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import TimelineItem from './TimelineItem.vue'

const props = defineProps({
  items: {
    type: Array,
    required: true,
  },
  // "edit"  : D&D による並び替え・インライン編集をすべて許可し、非公開ドキュメントも表示する（作成者専用の編集画面）
  // "view"  : 表示専用。D&D は無効化し、isPrivate: true のドキュメントは DOM から除外する（一般公開の閲覧画面）
  mode: {
    type: String,
    default: 'view',
    validator: (value) => ['edit', 'view'].includes(value),
  },
})

const emit = defineEmits(['open-document'])

const isEditable = computed(() => props.mode === 'edit')

// dayIndex ごとにグルーピングする。以後の並び替え・インライン編集は
// この dayGroups (ローカルの reactive state) を直接書き換えることで
// 「コンポーネント内のデータ(JSON配列)に即座に反映する」要件を満たす。
// props.items はあくまで初期値(モックデータ)としてのみ使用する。
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

// TimelineItem からのインライン編集 (時間 / タイトル) を反映する
function applyItemUpdate({ id, field, value }) {
  for (const dayGroup of dayGroups.value) {
    const target = dayGroup.items.find((item) => item.id === id)
    if (target) {
      target[field] = value
      break
    }
  }
}

// 現在の並び順・編集内容を1つの配列に平坦化して返す。
// D&D・インライン編集の結果はすべてこの Timeline 内の dayGroups に閉じているため、
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
            @update-item="applyItemUpdate"
          />
        </template>
      </draggable>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { MapPinIcon, ArrowTopRightOnSquareIcon, Bars3Icon } from '@heroicons/vue/24/outline'
import { getCategoryMeta } from '../utils/categoryMeta'
import AttachmentButton from './AttachmentButton.vue'
import InlineEditableText from './InlineEditableText.vue'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  isLast: {
    type: Boolean,
    default: false,
  },
  // "edit" ならドラッグハンドル・インライン編集・非公開ドキュメントを表示する。
  // "view" (既定) では閲覧専用の表示になる。
  mode: {
    type: String,
    default: 'view',
    validator: (value) => ['edit', 'view'].includes(value),
  },
})

const emit = defineEmits(['open-document', 'update-item'])

const meta = computed(() => getCategoryMeta(props.item.category))
const isEditable = computed(() => props.mode === 'edit')

// 非公開ドキュメント (isPrivate: true) は閲覧モードでは DOM 自体から除外する。
// v-if ではなく filter でリストから取り除くことで、公開画面のDOMに
// 個人情報を含む書類名やIDが一切出力されないようにする。
const visibleDocuments = computed(() => {
  return props.item.documents.filter((doc) => isEditable.value || !doc.isPrivate)
})

// スマートフォンではモック地図を非表示にする代わりに、各予定から
// 端末標準の地図アプリを開けるディープリンクを用意する。
// Google Maps の Universal Link 形式は iOS / Android どちらでも
// ブラウザ経由でネイティブの地図アプリへハンドオフされる。
const mapDeepLink = computed(() => {
  const { lat, lng, name } = props.item.location
  const query = encodeURIComponent(name)
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}(${query})`
})

function updateField(field, value) {
  emit('update-item', { id: props.item.id, field, value })
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
    <div class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <InlineEditableText
            v-if="isEditable"
            :model-value="item.time"
            type="time"
            aria-label="時間を編集"
            class="text-sm font-semibold tabular-nums text-slate-900"
            @update:model-value="updateField('time', $event)"
          />
          <span v-else class="px-1.5 py-0.5 text-sm font-semibold tabular-nums text-slate-900">{{ item.time }}</span>

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

      <h3 class="mt-1.5 text-base font-bold text-slate-900">
        <InlineEditableText
          v-if="isEditable"
          :model-value="item.title"
          aria-label="タイトルを編集"
          class="w-full text-base font-bold text-slate-900"
          @update:model-value="updateField('title', $event)"
        />
        <span v-else class="block px-1.5 py-0.5">{{ item.title }}</span>
      </h3>
      <p class="mt-1 text-sm leading-relaxed text-slate-600">{{ item.description }}</p>

      <div class="mt-2 flex items-center gap-1 text-xs text-slate-500">
        <MapPinIcon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{{ item.location.name }}</span>
      </div>

      <!-- ドキュメントボタン (非公開のものは閲覧モードでは visibleDocuments から除外済み) -->
      <div v-if="visibleDocuments.length" class="mt-3 flex flex-wrap gap-2">
        <AttachmentButton
          v-for="document in visibleDocuments"
          :key="document.id"
          :attachment="document"
          @open="emit('open-document', $event)"
        />
      </div>

      <!-- モバイル専用: マップアプリで開くボタン (768px未満のみ表示) -->
      <a
        :href="mapDeepLink"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-3 flex md:hidden items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition active:scale-[0.98]"
      >
        <MapPinIcon class="h-4 w-4" aria-hidden="true" />
        マップアプリで開く
        <ArrowTopRightOnSquareIcon class="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  </li>
</template>

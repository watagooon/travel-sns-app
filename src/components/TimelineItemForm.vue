<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { CATEGORY_META } from '../utils/categoryMeta'

// 予定の「追加」「編集」を1つのモーダルフォームで兼ねる。
// item が null なら追加モード、オブジェクトが渡されれば編集モード(削除ボタンも表示)。
const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  item: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['submit', 'delete', 'close'])

const categoryOptions = Object.entries(CATEGORY_META).map(([value, meta]) => ({ value, label: meta.label }))

const isEditMode = computed(() => !!props.item)

const form = ref(createEmptyForm())
const titleError = ref('')
const isConfirmingDelete = ref(false)
const titleInputRef = ref(null)

function createEmptyForm() {
  return { time: '09:00', title: '', description: '', category: 'sightseeing' }
}

// モーダルが開くたびに、編集対象の内容 (または空欄) をフォームへ反映する
watch(
  () => props.open,
  async (isOpen) => {
    isConfirmingDelete.value = false
    if (!isOpen) return

    titleError.value = ''
    form.value = props.item
      ? {
          time: props.item.time,
          title: props.item.title,
          description: props.item.description ?? '',
          category: props.item.category,
        }
      : createEmptyForm()

    await nextTick()
    titleInputRef.value?.focus()
  },
)

function handleSubmit() {
  if (!form.value.title.trim()) {
    titleError.value = 'タイトルを入力してください。'
    return
  }
  emit('submit', {
    time: form.value.time || '00:00',
    title: form.value.title.trim(),
    description: form.value.description.trim(),
    category: form.value.category,
  })
}

// 誤操作防止のため、削除ボタンは1回目のクリックで確認表示に切り替わり、
// 2回目のクリックで実際に削除イベントを発火する (window.confirm を使わない簡易確認)
function handleDeleteClick() {
  if (!isConfirmingDelete.value) {
    isConfirmingDelete.value = true
    return
  }
  emit('delete')
}
</script>

<template>
  <Transition name="modal-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div class="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 class="text-base font-bold text-slate-900">
            {{ isEditMode ? '予定を編集' : '新しい予定を追加' }}
          </h2>
          <button
            type="button"
            class="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="閉じる"
            @click="emit('close')"
          >
            <XMarkIcon class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form class="space-y-4 px-5 py-5" @submit.prevent="handleSubmit">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">時間</label>
              <input
                v-model="form.time"
                type="time"
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">カテゴリ</label>
              <select
                v-model="form.category"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option v-for="option in categoryOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">
              タイトル <span class="text-rose-500">*</span>
            </label>
            <input
              ref="titleInputRef"
              v-model="form.title"
              type="text"
              placeholder="例: ホテルチェックイン"
              class="w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2"
              :class="titleError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-100'"
              @input="titleError = ''"
            />
            <p v-if="titleError" class="mt-1 text-xs text-rose-500">{{ titleError }}</p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">詳細メモ</label>
            <textarea
              v-model="form.description"
              rows="3"
              placeholder="持ち物や注意事項などがあればメモしておきましょう"
              class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-2">
            <button
              v-if="isEditMode"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition"
              :class="isConfirmingDelete ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'"
              @click="handleDeleteClick"
            >
              <TrashIcon class="h-4 w-4" aria-hidden="true" />
              {{ isConfirmingDelete ? '本当に削除しますか？' : '削除する' }}
            </button>

            <div class="ml-auto flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
                @click="emit('close')"
              >
                キャンセル
              </button>
              <button
                type="submit"
                class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {{ isEditMode ? '更新する' : '追加する' }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>

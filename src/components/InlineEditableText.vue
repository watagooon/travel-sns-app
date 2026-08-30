<script setup>
import { nextTick, ref } from 'vue'

// タップ/クリックで表示⇔編集モードを切り替える汎用インライン編集フィールド。
// 予定の「時間」「タイトル」など、別画面に遷移せずその場で編集したい箇所で使う。
const props = defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    default: 'text', // 'text' | 'time'
  },
  ariaLabel: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue'])

const isEditing = ref(false)
const draft = ref('')
const inputRef = ref(null)

async function startEditing() {
  draft.value = props.modelValue
  isEditing.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select?.()
}

function commit() {
  const next = draft.value.trim()
  if (next && next !== props.modelValue) {
    emit('update:modelValue', next)
  }
  isEditing.value = false
}

function cancel() {
  isEditing.value = false
}
</script>

<template>
  <input
    v-if="isEditing"
    ref="inputRef"
    v-model="draft"
    :type="type"
    :aria-label="ariaLabel"
    class="w-full min-w-0 rounded-md border border-indigo-400 bg-indigo-50/40 px-1.5 py-0.5 outline-none ring-2 ring-indigo-100"
    @blur="commit"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @click.stop
  />
  <button
    v-else
    type="button"
    class="cursor-text rounded-md px-1.5 py-0.5 text-left decoration-dashed decoration-slate-300 underline-offset-4 transition hover:bg-slate-100 hover:underline"
    :aria-label="ariaLabel"
    @click.stop="startEditing"
  >
    <slot>{{ modelValue }}</slot>
  </button>
</template>

<script setup>
// 破壊的な操作 (旅程の削除など) の前に挟む、汎用的な確認モーダル。
defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    default: '',
  },
  confirmLabel: {
    type: String,
    default: '実行する',
  },
  cancelLabel: {
    type: String,
    default: 'キャンセル',
  },
  // true にすると確認ボタンが赤色になる (削除など取り消せない操作向け)
  danger: {
    type: Boolean,
    default: false,
  },
  confirming: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['confirm', 'close'])
</script>

<template>
  <Transition name="modal-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      @click.self="!confirming && emit('close')"
      @keydown.esc="!confirming && emit('close')"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 class="text-base font-bold text-slate-900">{{ title }}</h2>
        <p v-if="message" class="mt-2 text-sm leading-relaxed text-slate-600">{{ message }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="confirming"
            @click="emit('close')"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            :class="danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'"
            :disabled="confirming"
            @click="emit('confirm')"
          >
            <svg v-if="confirming" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            {{ confirming ? '処理中...' : confirmLabel }}
          </button>
        </div>
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

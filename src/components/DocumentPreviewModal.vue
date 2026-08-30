<script setup>
import { XMarkIcon, DocumentTextIcon, PhotoIcon } from '@heroicons/vue/24/outline'

// PostDetailView / EditView の両方から使い回す、ドキュメントのモックプレビューモーダル。
defineProps({
  document: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close'])
</script>

<template>
  <Transition name="fade">
    <div
      v-if="document"
      class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-2">
            <component
              :is="document.type === 'image' ? PhotoIcon : DocumentTextIcon"
              class="h-5 w-5 text-indigo-500"
              aria-hidden="true"
            />
            <h2 class="text-sm font-semibold text-slate-900">{{ document.label }}</h2>
          </div>
          <button
            type="button"
            class="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            @click="emit('close')"
          >
            <XMarkIcon class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div class="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
          <p class="px-4 text-center text-xs text-slate-400">
            ここに実際のドキュメントプレビュー（PDF / 画像）が表示されます
          </p>
        </div>

        <button
          type="button"
          class="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          @click="emit('close')"
        >
          閉じる
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

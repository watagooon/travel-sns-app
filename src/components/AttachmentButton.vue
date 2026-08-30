<script setup>
import { computed } from 'vue'
import { DocumentTextIcon, PhotoIcon } from '@heroicons/vue/24/solid'

const props = defineProps({
  attachment: {
    type: Object,
    required: true,
    // { id, label, type: 'pdf' | 'image' }
  },
})

const emit = defineEmits(['open'])

const icon = computed(() => (props.attachment.type === 'image' ? PhotoIcon : DocumentTextIcon))
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 hover:border-indigo-300 active:scale-[0.98]"
    @click="emit('open', attachment)"
  >
    <component :is="icon" class="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
    <span class="max-w-[10rem] truncate sm:max-w-[14rem]">{{ attachment.label }}</span>
  </button>
</template>

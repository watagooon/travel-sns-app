<script setup>
import { CameraIcon, HeartIcon } from '@heroicons/vue/24/solid'

defineProps({
  trip: {
    type: Object,
    required: true,
  },
})

function formatRange(start, end) {
  const s = new Date(start)
  const e = new Date(end)
  if (start === end) {
    return `${s.getMonth() + 1}/${s.getDate()}`
  }
  return `${s.getMonth() + 1}/${s.getDate()} 〜 ${e.getMonth() + 1}/${e.getDate()}`
}
</script>

<template>
  <RouterLink
    :to="{ name: 'post-detail', params: { id: trip.id } }"
    class="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
  >
    <!-- カバー画像 (モック: グラデーション + アイコン) -->
    <div
      class="relative aspect-[4/5] w-full overflow-hidden bg-gradient-to-br"
      :class="trip.coverGradient"
    >
      <CameraIcon
        class="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-white/40 transition group-hover:scale-110"
        aria-hidden="true"
      />
      <span
        class="absolute left-3 top-3 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
      >
        {{ formatRange(trip.startDate, trip.endDate) }}
      </span>
    </div>

    <div class="p-3.5">
      <h2 class="line-clamp-2 text-sm font-bold leading-snug text-slate-900">{{ trip.title }}</h2>

      <div class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="tag in trip.genreTags"
          :key="tag"
          class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
        >
          #{{ tag }}
        </span>
      </div>

      <div class="mt-3 flex items-center justify-between">
        <div class="flex min-w-0 items-center gap-1.5">
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700"
          >
            {{ trip.author.avatarInitial }}
          </span>
          <span class="truncate text-xs text-slate-500">{{ trip.author.displayName }}</span>
        </div>

        <span class="flex shrink-0 items-center gap-1 text-xs text-slate-500">
          <HeartIcon class="h-4 w-4 text-rose-400" aria-hidden="true" />
          {{ trip.likeCount }}
        </span>
      </div>
    </div>
  </RouterLink>
</template>

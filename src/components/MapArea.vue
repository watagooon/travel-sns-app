<script setup>
import { MapPinIcon } from '@heroicons/vue/24/solid'

defineProps({
  activeLocationName: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <!--
    タブレット・PC (md以上) のみ表示するモック地図領域。
    実運用では Google Maps Embed API や Mapbox GL JS 等に差し替える想定。
  -->
  <div class="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
    <!-- モック地図: グリッド柄のプレースホルダー -->
    <div
      class="absolute inset-0"
      style="
        background-image:
          linear-gradient(to right, rgba(100, 116, 139, 0.08) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(100, 116, 139, 0.08) 1px, transparent 1px);
        background-size: 28px 28px;
        background-color: #eef2f7;
      "
    />

    <!-- 中央のピンとラベル -->
    <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 shadow-lg shadow-indigo-600/30">
        <MapPinIcon class="h-7 w-7 text-white" aria-hidden="true" />
      </div>
      <div>
        <p class="text-sm font-semibold text-slate-700">地図プレビュー（モック）</p>
        <p class="mt-1 max-w-[16rem] text-xs text-slate-500">
          {{ activeLocationName || '予定を選択すると、ここに位置情報が表示されます' }}
        </p>
      </div>
    </div>

    <!-- 装飾用の疑似ピン -->
    <MapPinIcon class="absolute left-[20%] top-[30%] h-6 w-6 text-rose-400/70" aria-hidden="true" />
    <MapPinIcon class="absolute right-[24%] top-[55%] h-6 w-6 text-rose-400/70" aria-hidden="true" />
    <MapPinIcon class="absolute left-[38%] bottom-[18%] h-6 w-6 text-rose-400/70" aria-hidden="true" />
  </div>
</template>

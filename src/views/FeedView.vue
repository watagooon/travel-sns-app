<script setup>
import { trips } from '../data/trips'
import TravelCard from '../components/TravelCard.vue'
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <p class="text-xs font-semibold uppercase tracking-wide text-indigo-600">Travel SNS</p>
        <h1 class="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">旅のしおり フィード</h1>
        <p class="mt-1 text-sm text-slate-500">みんなの旅程をチェックして、次の旅の参考にしよう。</p>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <!--
        Instagram / Pinterest のようなカードグリッド。
        - モバイル: 2カラム
        - タブレット以上: 3〜4カラムまで広げる
      -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        <TravelCard v-for="trip in trips" :key="trip.id" :trip="trip" />
      </div>
    </main>
  </div>
</template>

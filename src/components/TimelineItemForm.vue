<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  CalendarDaysIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  TrashIcon,
  TruckIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { CATEGORY_META } from '../utils/categoryMeta'
import { useTripsApi } from '../composables/useTripsApi'

// 予定の「追加」「編集」を1つのモーダルフォームで兼ねる。
// item が null なら追加モード、オブジェクトが渡されれば編集モード(削除ボタンも表示)。
//
// item.type ("activity" | "flight" | "transit") によって入力項目が切り替わる。
// 旧データ (type 未設定) は "activity" として安全にフォールバックする。
const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  item: {
    type: Object,
    default: null,
  },
  // 画像アップロード先の Blob パスに含める旅程ID
  tripId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['submit', 'delete', 'close'])

const { uploadImageFile } = useTripsApi()

// カテゴリ選択 (通常の予定のときだけ表示) からは flight/transfer を除外する。
// これらは type セレクタ (通常の予定/フライト/移動) 側で表現するため、
// 二重に選ばせて矛盾したデータになるのを防ぐ。
const categoryOptions = Object.entries(CATEGORY_META)
  .filter(([value]) => value !== 'flight' && value !== 'transfer')
  .map(([value, meta]) => ({ value, label: meta.label }))

const typeOptions = [
  { value: 'activity', label: '通常の予定', icon: CalendarDaysIcon },
  { value: 'flight', label: 'フライト', icon: PaperAirplaneIcon },
  { value: 'transit', label: '移動', icon: TruckIcon },
]

const isEditMode = computed(() => !!props.item)
const isTransitType = computed(() => form.value.type === 'flight' || form.value.type === 'transit')

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const form = ref(createEmptyForm())
const titleError = ref('')
const locationError = ref('')
const isConfirmingDelete = ref(false)
const titleInputRef = ref(null)
const departureLocationInputRef = ref(null)

// --- 画像アップロード ---
// previewUrl: 選択直後にローカルで即表示するための objectURL
// imageUrl  : アップロード完了後の Blob Storage 上のURL (これが実際に保存される値)
const previewUrl = ref('')
const imageUrl = ref('')
const isUploadingImage = ref(false)
const uploadError = ref('')

function createEmptyForm() {
  return {
    type: 'activity',
    time: '09:00',
    title: '',
    description: '',
    category: 'sightseeing',
    departureTime: '09:00',
    arrivalTime: '11:00',
    departureLocation: '',
    arrivalLocation: '',
  }
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

// モーダルが開くたびに、編集対象の内容 (または空欄) をフォームへ反映する。
// item.type が無い (旧データ) 場合は 'activity' にフォールバックする。
watch(
  () => props.open,
  async (isOpen) => {
    isConfirmingDelete.value = false
    revokePreview()
    uploadError.value = ''

    if (!isOpen) return

    titleError.value = ''
    locationError.value = ''
    form.value = props.item
      ? {
          type: props.item.type ?? 'activity',
          time: props.item.time ?? '09:00',
          title: props.item.title ?? '',
          description: props.item.description ?? '',
          category: props.item.category ?? 'sightseeing',
          departureTime: props.item.departureTime ?? props.item.time ?? '09:00',
          arrivalTime: props.item.arrivalTime ?? '',
          departureLocation: props.item.departureLocation ?? '',
          arrivalLocation: props.item.arrivalLocation ?? '',
        }
      : createEmptyForm()
    imageUrl.value = props.item?.imageUrl ?? ''

    await nextTick()
    ;(isTransitType.value ? departureLocationInputRef.value : titleInputRef.value)?.focus()
  },
)

function selectType(type) {
  form.value.type = type
  titleError.value = ''
  locationError.value = ''
}

onBeforeUnmount(revokePreview)

async function handleFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 同じファイルを連続選択しても change が発火するようにリセットしておく
  if (!file) return

  if (!file.type.startsWith('image/')) {
    uploadError.value = '画像ファイルを選択してください。'
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    uploadError.value = 'ファイルサイズは5MB以下にしてください。'
    return
  }
  if (!props.tripId) {
    uploadError.value = 'アップロード先の旅程が特定できませんでした。'
    return
  }

  uploadError.value = ''
  revokePreview()
  previewUrl.value = URL.createObjectURL(file)
  isUploadingImage.value = true

  try {
    // 1) Azure Functions からアップロード用SAS URLを取得し
    // 2) 取得したURLへブラウザから直接 Blob Storage へ PUT する (Functionは経由しない)
    imageUrl.value = await uploadImageFile(file, { tripId: props.tripId })
  } catch (error) {
    uploadError.value = error.message
    revokePreview()
  } finally {
    isUploadingImage.value = false
  }
}

function removeImage() {
  revokePreview()
  imageUrl.value = ''
  uploadError.value = ''
}

// フライト/移動 と 通常の予定 とではフィールド構成が丸ごと異なるため、
// 送信ペイロードには常に両方の項目キーを含めておく (未使用側は null)。
// こうしておくことで、編集時に type を切り替えても Timeline.vue 側の
// Object.assign(target, payload) だけで古いtype専用フィールドが残らず、
// きれいに上書きされる。
function handleSubmit() {
  if (form.value.type === 'activity') {
    if (!form.value.title.trim()) {
      titleError.value = 'タイトルを入力してください。'
      return
    }
    emit('submit', {
      type: 'activity',
      time: form.value.time || '00:00',
      title: form.value.title.trim(),
      description: form.value.description.trim(),
      category: form.value.category,
      imageUrl: imageUrl.value || null,
      departureTime: null,
      arrivalTime: null,
      departureLocation: null,
      arrivalLocation: null,
    })
    return
  }

  const departureLocation = form.value.departureLocation.trim()
  const arrivalLocation = form.value.arrivalLocation.trim()
  if (!departureLocation || !arrivalLocation) {
    locationError.value = '出発地点と到着地点を入力してください。'
    return
  }

  const departureTime = form.value.departureTime || '00:00'
  const arrivalTime = form.value.arrivalTime || departureTime

  emit('submit', {
    type: form.value.type,
    // 通常の予定と同じ "time" フィールドにも出発時刻を反映しておくことで、
    // Timeline.vue 側の時間順ソート (item.time) をtypeによらず共通ロジックのまま使える。
    time: departureTime,
    // タイトルは手入力させず、出発地点・到着地点から自動生成する。
    title: `${departureLocation} → ${arrivalLocation}`,
    description: form.value.description.trim(),
    category: form.value.type === 'flight' ? 'flight' : 'transfer',
    imageUrl: imageUrl.value || null,
    departureTime,
    arrivalTime,
    departureLocation,
    arrivalLocation,
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
      <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div class="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
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
          <!-- カテゴリ選択: 通常の予定 / フライト / 移動 -->
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">カテゴリ</label>
            <div role="radiogroup" aria-label="予定の種類" class="grid grid-cols-3 gap-2">
              <button
                v-for="option in typeOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="form.type === option.value"
                class="flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-semibold transition"
                :class="
                  form.type === option.value
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                "
                @click="selectType(option.value)"
              >
                <component :is="option.icon" class="h-4 w-4" aria-hidden="true" />
                {{ option.label }}
              </button>
            </div>
          </div>

          <!-- 通常の予定: 時間 / カテゴリ / タイトル -->
          <template v-if="form.type === 'activity'">
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
                <label class="mb-1 block text-xs font-semibold text-slate-600">ジャンル</label>
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
          </template>

          <!-- フライト / 移動: 出発・到着の時刻と地点 -->
          <template v-else>
            <div class="rounded-lg border border-slate-200 p-3">
              <p class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <component :is="form.type === 'flight' ? PaperAirplaneIcon : TruckIcon" class="h-3.5 w-3.5" aria-hidden="true" />
                出発
              </p>
              <div class="grid grid-cols-[7rem_1fr] gap-2">
                <input
                  v-model="form.departureTime"
                  type="time"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <input
                  ref="departureLocationInputRef"
                  v-model="form.departureLocation"
                  type="text"
                  placeholder="例: 関西国際空港 (KIX)"
                  class="w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2"
                  :class="locationError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-100'"
                  @input="locationError = ''"
                />
              </div>

              <div class="my-2 ml-[3px] h-3 border-l-2 border-dotted border-slate-300" aria-hidden="true" />

              <p class="mb-2 text-xs font-semibold text-slate-500">到着</p>
              <div class="grid grid-cols-[7rem_1fr] gap-2">
                <input
                  v-model="form.arrivalTime"
                  type="time"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <input
                  v-model="form.arrivalLocation"
                  type="text"
                  placeholder="例: 仁川国際空港 (ICN)"
                  class="w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2"
                  :class="locationError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-100'"
                  @input="locationError = ''"
                />
              </div>
              <p v-if="locationError" class="mt-2 text-xs text-rose-500">{{ locationError }}</p>
            </div>
          </template>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">
              詳細メモ
              <span v-if="isTransitType" class="font-normal text-slate-400">(便名・座席番号など)</span>
            </label>
            <textarea
              v-model="form.description"
              rows="3"
              :placeholder="isTransitType ? '例: 大韓航空 KE722便 / 座席 12A' : '持ち物や注意事項などがあればメモしておきましょう'"
              class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <!-- 写真アップロード -->
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">写真</label>

            <div v-if="previewUrl || imageUrl" class="relative inline-block">
              <img :src="previewUrl || imageUrl" alt="" class="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
              <div v-if="isUploadingImage" class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                <svg class="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
              <button
                v-else
                type="button"
                class="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white shadow transition hover:bg-slate-700"
                aria-label="写真を削除"
                @click="removeImage"
              >
                <XMarkIcon class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <label
              v-else
              class="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500"
            >
              <PhotoIcon class="h-6 w-6" aria-hidden="true" />
              <span class="text-[11px]">写真を追加</span>
              <input type="file" accept="image/*" class="hidden" @change="handleFileChange" />
            </label>

            <p v-if="uploadError" class="mt-1 text-xs text-rose-500">{{ uploadError }}</p>
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
                class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="isUploadingImage"
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

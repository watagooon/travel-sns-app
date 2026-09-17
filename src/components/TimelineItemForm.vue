<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  CalendarDaysIcon,
  PaperAirplaneIcon,
  PhotoIcon,
  PlusIcon,
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

const { uploadImages } = useTripsApi()

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

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB / 枚
const MAX_IMAGES = 10

const form = ref(createEmptyForm())
const titleError = ref('')
const locationError = ref('')
const isConfirmingDelete = ref(false)
const titleInputRef = ref(null)
const departureLocationInputRef = ref(null)

// --- ToDoチェックリスト ---
// { id, text, isDone } の配列。テキストは各行の <input> に直接 v-model しているため
// 「修正」は自然に反映される。削除はゴミ箱アイコンでその場で配列から取り除く。
const todos = ref([])
const newTodoText = ref('')

function addTodo() {
  const text = newTodoText.value.trim()
  if (!text) return
  todos.value.push({ id: crypto.randomUUID(), text, isDone: false })
  newTodoText.value = ''
}

function removeTodo(id) {
  todos.value = todos.value.filter((todo) => todo.id !== id)
}

// --- 画像アップロード (複数枚) ---
// images: [{ id, url, previewUrl, isUploading, error }]
// - url        : アップロード完了後の Blob Storage 上のURL (これが実際に保存される値)
// - previewUrl : 画面表示用 (アップロード中はローカルの objectURL、完了後は url と同じ)
const images = ref([])
const uploadError = ref('')

const hasUploadingImages = computed(() => images.value.some((image) => image.isUploading))

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

// 既存アイテムの images (複数枚) をフォーム用の状態に変換する。
// 旧データ (単一の imageUrl しか無い) は 1枚だけのギャラリーとして扱う後方互換フォールバック。
function buildInitialImages(item) {
  if (!item) return []
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images.map((image) => ({
      id: image.id,
      url: image.url,
      previewUrl: image.url,
      isUploading: false,
      error: '',
    }))
  }
  if (item.imageUrl) {
    return [{ id: crypto.randomUUID(), url: item.imageUrl, previewUrl: item.imageUrl, isUploading: false, error: '' }]
  }
  return []
}

function revokeAllPreviews() {
  for (const image of images.value) {
    if (image.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(image.previewUrl)
    }
  }
}

// モーダルが開くたびに、編集対象の内容 (または空欄) をフォームへ反映する。
// item.type が無い (旧データ) 場合は 'activity' にフォールバックする。
watch(
  () => props.open,
  async (isOpen) => {
    isConfirmingDelete.value = false
    revokeAllPreviews()
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
    todos.value = (props.item?.todos ?? []).map((todo) => ({ ...todo }))
    newTodoText.value = ''
    images.value = buildInitialImages(props.item)

    await nextTick()
    ;(isTransitType.value ? departureLocationInputRef.value : titleInputRef.value)?.focus()
  },
)

function selectType(type) {
  form.value.type = type
  titleError.value = ''
  locationError.value = ''
}

onBeforeUnmount(revokeAllPreviews)

async function handleFilesChange(event) {
  const selectedFiles = Array.from(event.target.files ?? [])
  event.target.value = '' // 同じファイルを連続選択しても change が発火するようにリセットしておく
  if (selectedFiles.length === 0) return

  uploadError.value = ''

  const remainingSlots = MAX_IMAGES - images.value.length
  if (remainingSlots <= 0) {
    uploadError.value = `写真は最大${MAX_IMAGES}枚までです。`
    return
  }
  if (!props.tripId) {
    uploadError.value = 'アップロード先の旅程が特定できませんでした。'
    return
  }

  const candidateFiles = selectedFiles.slice(0, remainingSlots)
  if (selectedFiles.length > remainingSlots) {
    uploadError.value = `写真は最大${MAX_IMAGES}枚までのため、一部を追加できませんでした。`
  }

  const validFiles = []
  for (const file of candidateFiles) {
    if (!file.type.startsWith('image/')) {
      uploadError.value = '画像ファイルのみアップロードできます。'
      continue
    }
    if (file.size > MAX_FILE_SIZE) {
      uploadError.value = `${file.name}: ファイルサイズは5MB以下にしてください。`
      continue
    }
    validFiles.push(file)
  }
  if (validFiles.length === 0) return

  // 選択直後にローカルプレビューを即表示しつつ、アップロード中フラグを立てる
  const pendingImages = validFiles.map((file) => ({
    id: crypto.randomUUID(),
    file,
    url: '',
    previewUrl: URL.createObjectURL(file),
    isUploading: true,
    error: '',
  }))
  images.value.push(...pendingImages)

  try {
    // 複数ファイルを1回のリクエストでまとめてアップロードする
    const uploadedUrls = await uploadImages(
      pendingImages.map((image) => image.file),
      { tripId: props.tripId },
    )
    // 注意: pendingImages が保持しているのは push 前の「素のオブジェクト」への参照。
    // Vue の reactive() は配列に要素を追加した後、実際にリアクティブな変更検知を
    // 効かせるにはリアクティブ配列 (images.value) 側を経由してミューテートする必要がある
    // (素のオブジェクト参照を直接書き換えても、そのオブジェクトが reactive プロキシと
    // 同一視される保証がなく、再描画がトリガーされないことがある)。
    // そのため id で images.value から検索し直してから更新する。
    pendingImages.forEach((pending, index) => {
      const target = images.value.find((image) => image.id === pending.id)
      if (target) {
        target.url = uploadedUrls[index]
        target.isUploading = false
      }
    })
  } catch (error) {
    pendingImages.forEach((pending) => {
      const target = images.value.find((image) => image.id === pending.id)
      if (target) {
        target.error = error.message
        target.isUploading = false
      }
    })
    uploadError.value = error.message
  }
}

function removeImage(id) {
  const index = images.value.findIndex((image) => image.id === id)
  if (index === -1) return
  const [removed] = images.value.splice(index, 1)
  if (removed.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(removed.previewUrl)
  }
}

// フライト/移動 と 通常の予定 とではフィールド構成が丸ごと異なるため、
// 送信ペイロードには常に両方の項目キーを含めておく (未使用側は null)。
// こうしておくことで、編集時に type を切り替えても Timeline.vue 側の
// Object.assign(target, payload) だけで古いtype専用フィールドが残らず、
// きれいに上書きされる。todos / images はどちらの type でも共通して使う。
function handleSubmit() {
  const finalImages = images.value
    .filter((image) => image.url && !image.isUploading)
    .map((image) => ({ id: image.id, url: image.url }))
  const finalTodos = todos.value
    .map((todo) => ({ ...todo, text: todo.text.trim() }))
    .filter((todo) => todo.text)

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
      todos: finalTodos,
      images: finalImages,
      imageUrl: null, // 旧・単一画像フィールドは新しい images 配列に統合し、使わなくする
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
    todos: finalTodos,
    images: finalImages,
    imageUrl: null,
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

          <!-- ToDoチェックリスト -->
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">ToDoリスト</label>

            <div v-if="todos.length" class="mb-2 space-y-1.5">
              <div v-for="todo in todos" :key="todo.id" class="flex items-center gap-2">
                <input
                  v-model="todo.text"
                  type="text"
                  class="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                  aria-label="ToDoを削除"
                  @click="removeTodo(todo.id)"
                >
                  <TrashIcon class="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <input
                v-model="newTodoText"
                type="text"
                placeholder="持ち物やタスクを入力してEnter"
                class="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                @keydown.enter.prevent="addTodo"
              />
              <button
                type="button"
                class="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                @click="addTodo"
              >
                <PlusIcon class="h-3.5 w-3.5" aria-hidden="true" />
                追加
              </button>
            </div>
          </div>

          <!-- 写真アップロード (複数枚) -->
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">
              写真 <span class="font-normal text-slate-400">(最大{{ MAX_IMAGES }}枚)</span>
            </label>

            <div class="grid grid-cols-3 gap-2">
              <div
                v-for="image in images"
                :key="image.id"
                class="relative aspect-square overflow-hidden rounded-lg border border-slate-200"
              >
                <img :src="image.previewUrl" alt="" class="h-full w-full object-cover" />
                <div v-if="image.isUploading" class="absolute inset-0 flex items-center justify-center bg-white/70">
                  <svg class="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                </div>
                <div
                  v-else-if="image.error"
                  class="absolute inset-0 flex items-center justify-center bg-rose-50/90 p-1 text-center text-[10px] font-semibold text-rose-600"
                >
                  失敗
                </div>
                <button
                  type="button"
                  class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-white transition hover:bg-slate-900"
                  aria-label="この写真を削除"
                  @click="removeImage(image.id)"
                >
                  <XMarkIcon class="h-3 w-3" aria-hidden="true" />
                </button>
              </div>

              <label
                v-if="images.length < MAX_IMAGES"
                class="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500"
              >
                <PhotoIcon class="h-6 w-6" aria-hidden="true" />
                <span class="text-[10px]">追加</span>
                <input type="file" accept="image/*" multiple class="hidden" @change="handleFilesChange" />
              </label>
            </div>

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
                :disabled="hasUploadingImages"
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

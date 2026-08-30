import {
  PaperAirplaneIcon,
  TruckIcon,
  BuildingOffice2Icon,
  CameraIcon,
  CakeIcon,
  ShoppingBagIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/vue/24/outline'

// カテゴリごとのアイコン・タイムライン上のドット色をまとめて管理する
export const CATEGORY_META = {
  flight: { icon: PaperAirplaneIcon, label: 'フライト', dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  transfer: { icon: TruckIcon, label: '移動', dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-600 ring-slate-500/20' },
  hotel: { icon: BuildingOffice2Icon, label: '宿泊', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
  sightseeing: { icon: CameraIcon, label: '観光', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  meal: { icon: CakeIcon, label: '食事', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  shopping: { icon: ShoppingBagIcon, label: '買い物', dot: 'bg-pink-500', badge: 'bg-pink-50 text-pink-700 ring-pink-600/20' },
  prep: { icon: ClipboardDocumentCheckIcon, label: '準備', dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
}

export function getCategoryMeta(category) {
  return CATEGORY_META[category] ?? CATEGORY_META.transfer
}

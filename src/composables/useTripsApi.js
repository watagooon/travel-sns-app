// /api/* への fetch をまとめた薄いラッパー。
// Managed Functions は同一オリジンなので相対パスのままCORS設定なしで呼び出せる。
async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `リクエストに失敗しました (HTTP ${res.status})`)
  }

  if (res.status === 204) {
    return null
  }
  return res.json()
}

// 複数の画像ファイルを1回のリクエストで POST /api/upload (multipart/form-data) へ送信する。
// ブラウザが自動でマルチパートの Content-Type (boundary付き) を設定してくれるよう、
// 汎用の request() ヘルパー (Content-Type: application/json を強制する) は使わず、
// ここだけ生の fetch を直接呼んでいる。
async function uploadImages(files, { tripId }) {
  const formData = new FormData()
  formData.append('tripId', tripId)
  for (const file of files) {
    formData.append('files', file)
  }

  const res = await fetch('/api/upload', { method: 'POST', body: formData })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `画像のアップロードに失敗しました (HTTP ${res.status})`)
  }

  const { urls } = await res.json()
  return urls
}

// 同行者の招待URL (/edit/{id}?token=...) 経由でアクセスしている場合、
// token をクエリパラメータとして API へ引き継ぐ。
function withToken(path, token) {
  if (!token) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}token=${encodeURIComponent(token)}`
}

export function useTripsApi() {
  return {
    // ログイン中ユーザー自身の旅程一覧
    fetchMyTrips: () => request('/api/trips'),
    // 単一の旅程を取得。所有者本人、または正しい editToken を渡した同行者のみ取得できる
    fetchTripById: (id, token) => request(withToken(`/api/trips/${encodeURIComponent(id)}`, token)),
    // 新規旅程の作成
    createTrip: (trip) => request('/api/trips', { method: 'POST', body: JSON.stringify(trip) }),
    // 既存旅程の更新 (EditView の「保存する」ボタンから、items 配列などを丸ごと上書き)。
    // 所有者本人、または正しい editToken を渡した同行者のみ更新できる
    updateTrip: (id, patch, token) =>
      request(withToken(`/api/trips/${encodeURIComponent(id)}`, token), {
        method: 'PUT',
        body: JSON.stringify(patch),
      }),
    // 旅程そのものの削除 (取り消し不可・所有者本人のみ)
    deleteTrip: (id) => request(`/api/trips/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    // 予定に添付する画像を複数枚まとめてアップロードする (multipart/form-data)
    uploadImages,
    // ログイン中ユーザーのSNSプロフィール (存在しなければAPI側で自動作成される)
    fetchMyProfile: () => request('/api/profile'),
  }
}

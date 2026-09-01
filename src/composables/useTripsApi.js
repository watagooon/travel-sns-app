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

export function useTripsApi() {
  return {
    // ログイン中ユーザー自身の旅程一覧
    fetchMyTrips: () => request('/api/trips'),
    // 単一の旅程を取得 (自分が所有するものだけ。他人のidを渡しても404になる)
    fetchTripById: (id) => request(`/api/trips/${encodeURIComponent(id)}`),
    // 新規旅程の作成
    createTrip: (trip) => request('/api/trips', { method: 'POST', body: JSON.stringify(trip) }),
    // 既存旅程の更新 (EditView の「保存する」ボタンから、items 配列などを丸ごと上書き)
    updateTrip: (id, patch) =>
      request(`/api/trips/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
    // ログイン中ユーザーのSNSプロフィール (存在しなければAPI側で自動作成される)
    fetchMyProfile: () => request('/api/profile'),
  }
}

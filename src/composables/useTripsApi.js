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

// 画像アップロード用のSAS URLをAzure Functionsから発行してもらう。
// (Function自体は画像データを受け取らず、Blob Storageへの書き込み権限だけを短時間発行する)
async function requestUploadUrl({ tripId, fileName, contentType }) {
  return request('/api/upload-sas', {
    method: 'POST',
    body: JSON.stringify({ tripId, fileName, contentType }),
  })
}

// 1) アップロード用SAS URLを取得 → 2) ブラウザから直接 Blob Storage へPUT する。
// Functionのペイロードサイズ制限やコールドスタートの影響を受けず、画像バイナリは
// Azure Storageへ直接送信されるため、Functions は仲介しない。
async function uploadImageFile(file, { tripId }) {
  const { uploadUrl, blobUrl } = await requestUploadUrl({
    tripId,
    fileName: file.name,
    contentType: file.type,
  })

  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': file.type,
    },
    body: file,
  })

  if (!putResponse.ok) {
    throw new Error('画像のアップロードに失敗しました。')
  }

  return blobUrl
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
    // 予定に添付する画像のアップロード (SAS発行 + Blob Storageへの直接PUT)
    uploadImageFile,
    // ログイン中ユーザーのSNSプロフィール (存在しなければAPI側で自動作成される)
    fetchMyProfile: () => request('/api/profile'),
  }
}

const { app } = require('@azure/functions')
const { randomUUID } = require('node:crypto')
const { getUserInfo } = require('../shared/getUserInfo')
const { generateUploadSasUrl } = require('../shared/blobClient')

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_FILENAME_LENGTH = 100

function sanitizeFileName(name) {
  const safe = (name || 'photo').replace(/[^\w.\-]/g, '_')
  return safe.slice(-MAX_FILENAME_LENGTH)
}

// POST /api/upload-sas
// 予定に添付する画像のアップロード先として、Blob Storage への
// 書き込み専用・短時間 (10分) だけ有効なSAS URLを発行する。
// 画像データそのものはこのFunctionを経由せず、クライアントが直接
// Blob Storageへ PUT する (SASトークン方式)。
//
// blobName は "{userId}/{tripId}/{uuid}-{ファイル名}" の形にすることで、
// Cosmos DB の trips コンテナと同様にユーザーごとの名前空間で分離している。
app.http('createUploadUrl', {
  methods: ['POST'],
  route: 'upload-sas',
  authLevel: 'anonymous', // 認証自体はASWAのプラットフォーム層で完結しているため、Functionsキーは不要
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    const body = await request.json().catch(() => null)
    if (!body?.tripId || !body?.contentType) {
      return { status: 400, jsonBody: { error: 'tripId と contentType は必須です。' } }
    }
    if (!ALLOWED_CONTENT_TYPES.has(body.contentType)) {
      return { status: 400, jsonBody: { error: '画像ファイル (jpeg / png / webp / gif) のみアップロードできます。' } }
    }

    try {
      const safeFileName = sanitizeFileName(body.fileName)
      const blobName = `${user.userId}/${body.tripId}/${randomUUID()}-${safeFileName}`
      const { uploadUrl, blobUrl } = generateUploadSasUrl(blobName, body.contentType)

      return { status: 200, jsonBody: { uploadUrl, blobUrl } }
    } catch (error) {
      context.error('アップロードURLの発行に失敗しました', error)
      return { status: 500, jsonBody: { error: 'アップロードURLの発行に失敗しました。' } }
    }
  },
})

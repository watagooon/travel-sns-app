const { app } = require('@azure/functions')
const { randomUUID } = require('node:crypto')
const { getUserInfo } = require('../shared/getUserInfo')
const { getContainerClient } = require('../shared/blobClient')

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB / 枚
const MAX_FILES_PER_REQUEST = 10
const MAX_FILENAME_LENGTH = 100

function sanitizeFileName(name) {
  const safe = (name || 'photo').replace(/[^\w.-]/g, '_')
  return safe.slice(-MAX_FILENAME_LENGTH)
}

// POST /api/upload  (Content-Type: multipart/form-data)
// フィールド:
//   - tripId : string (必須。Blobのパス分けに使う)
//   - files  : File を複数 (フィールド名 "files" を複数回添付)
//
// 複数の画像ファイルをまとめて受け取り、すべて Azure Blob Storage に保存して
// 生成された Blob URL の配列を返す。
//
// 実装メモ: Azure Functions v4 (Node.js) の HttpRequest は Fetch API 準拠の
// Request を実装しているため、busboy や parse-multipart のような追加パッケージを
// インストールしなくても、標準の request.formData() だけでマルチパートボディを
// パースできる (Node 18+ のネイティブ File/FormData 実装がベース)。
// このリポジトリでは既に他のエンドポイントで request.json() を問題なく使えているのと
// 同じ Request 実装なので、追加の動作確認コストも小さい。
//
// トレードオフ: 前バージョンで実装していた「SASトークンを発行し、ブラウザから
// Blob Storageへ直接PUTする」方式と比べると、今回は画像バイナリが一旦この
// Functionを経由する。実装・動作確認がシンプルになる反面、Functionの
// ペイロードサイズ上限やコールドスタート・実行時間の影響を受けやすくなる点に注意。
// (1枚あたり5MB・1リクエストあたり最大10枚に制限しているのはそのための保険)
app.http('uploadImages', {
  methods: ['POST'],
  route: 'upload',
  authLevel: 'anonymous', // 認証自体はASWAのプラットフォーム層で完結しているため、Functionsキーは不要
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    let formData
    try {
      formData = await request.formData()
    } catch (error) {
      context.error('multipart/form-data の解析に失敗しました', error)
      return { status: 400, jsonBody: { error: 'multipart/form-data 形式でリクエストしてください。' } }
    }

    const tripId = formData.get('tripId')
    if (!tripId || typeof tripId !== 'string') {
      return { status: 400, jsonBody: { error: 'tripId は必須です。' } }
    }

    // テキストフィールドは string、ファイルフィールドは File 相当のオブジェクトとして返る。
    // グローバルの File クラスに依存せず、typeof で判定することで
    // Node.js のバージョン差異の影響を受けにくくしている。
    const files = formData.getAll('files').filter((entry) => typeof entry !== 'string')

    if (files.length === 0) {
      return { status: 400, jsonBody: { error: '画像ファイルが見つかりません。' } }
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return { status: 400, jsonBody: { error: `一度にアップロードできるのは${MAX_FILES_PER_REQUEST}枚までです。` } }
    }
    for (const file of files) {
      if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
        return { status: 400, jsonBody: { error: `${file.name}: 画像ファイル (jpeg/png/webp/gif) のみアップロードできます。` } }
      }
      if (file.size > MAX_FILE_SIZE) {
        return { status: 400, jsonBody: { error: `${file.name}: ファイルサイズは5MB以下にしてください。` } }
      }
    }

    try {
      const containerClient = getContainerClient()
      const urls = []

      for (const file of files) {
        const blobName = `${user.userId}/${tripId}/${randomUUID()}-${sanitizeFileName(file.name)}`
        const blockBlobClient = containerClient.getBlockBlobClient(blobName)
        const buffer = Buffer.from(await file.arrayBuffer())

        await blockBlobClient.uploadData(buffer, {
          blobHTTPHeaders: { blobContentType: file.type },
        })

        urls.push(blockBlobClient.url)
      }

      return { status: 200, jsonBody: { urls } }
    } catch (error) {
      context.error('画像のアップロードに失敗しました', error)
      return { status: 500, jsonBody: { error: '画像のアップロードに失敗しました。' } }
    }
  },
})

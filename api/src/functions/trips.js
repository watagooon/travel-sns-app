const { app } = require('@azure/functions')
const { randomUUID } = require('node:crypto')
const { getContainer } = require('../shared/cosmosClient')
const { getUserInfo } = require('../shared/getUserInfo')

const CONTAINER_ID = 'trips'

// 更新を許可するフィールドのホワイトリスト。id / userId / author / likeCount / createdAt は
// クライアントから書き換えさせない (PUTのボディに紛れ込んでいても無視する)。
const EDITABLE_FIELDS = ['title', 'destination', 'startDate', 'endDate', 'coverGradient', 'genreTags', 'items', 'isPublic']

// GET /api/trips
// ログイン中のユーザー自身が作成した旅行計画の一覧を取得する。
// trips コンテナのパーティションキーが /userId のため、このクエリは
// 単一パーティション内で完結し (クロスパーティションにならず) 低コストで実行できる。
app.http('getTrips', {
  methods: ['GET'],
  route: 'trips',
  authLevel: 'anonymous', // 認証自体はASWAのプラットフォーム層で完結しているため、Functionsキーは不要
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    try {
      const container = getContainer(CONTAINER_ID)
      const { resources: trips } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.updatedAt DESC',
          parameters: [{ name: '@userId', value: user.userId }],
        })
        .fetchAll()

      return { status: 200, jsonBody: trips }
    } catch (error) {
      context.error('旅程一覧の取得に失敗しました', error)
      return { status: 500, jsonBody: { error: '旅程一覧の取得に失敗しました。' } }
    }
  },
})

// GET /api/trips/{id}
// PUT /api/trips/{id} (更新) と対になる、単一旅程の詳細取得。
// EditView.vue / PostDetailView.vue が特定の旅程を読み込む際に使用する。
//
// ポイント: container.item(id, user.userId) のように "自分自身のuserId" を
// パーティションキーとして指定してポイントリードするため、他人が所有する
// trip の id を知っていても (別パーティションに存在するため) 404 になり、
// アプリケーションコードでの所有者チェックを書かなくても構造的にアクセスを防げる。
app.http('getTripById', {
  methods: ['GET'],
  route: 'trips/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    const id = request.params.id

    try {
      const container = getContainer(CONTAINER_ID)
      const { resource: trip } = await container.item(id, user.userId).read()

      if (!trip) {
        return { status: 404, jsonBody: { error: '指定された旅程が見つかりません。' } }
      }
      return { status: 200, jsonBody: trip }
    } catch (error) {
      if (error.code === 404) {
        return { status: 404, jsonBody: { error: '指定された旅程が見つかりません。' } }
      }
      context.error('旅程の取得に失敗しました', error)
      return { status: 500, jsonBody: { error: '旅程の取得に失敗しました。' } }
    }
  },
})

// POST /api/trips
// 新しい旅行計画を作成する。author は x-ms-client-principal の userDetails から
// その場で組み立てる (SNSプロフィール機能とは切り離し、trips コンテナのみで完結させる)。
app.http('createTrip', {
  methods: ['POST'],
  route: 'trips',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.title !== 'string' || !body.title.trim()) {
      return { status: 400, jsonBody: { error: 'title は必須です。' } }
    }

    try {
      const now = new Date().toISOString()
      const displayName = user.userDetails || 'ゲストユーザー'

      const newTrip = {
        id: randomUUID(),
        userId: user.userId,
        title: body.title.trim(),
        destination: body.destination ?? '',
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        coverGradient: body.coverGradient ?? 'from-slate-400 to-slate-600',
        genreTags: Array.isArray(body.genreTags) ? body.genreTags : [],
        items: Array.isArray(body.items) ? body.items : [],
        isPublic: body.isPublic ?? true,
        likeCount: 0,
        author: {
          userId: user.userId,
          displayName,
          avatarInitial: displayName.charAt(0).toUpperCase(),
        },
        createdAt: now,
        updatedAt: now,
      }

      const container = getContainer(CONTAINER_ID)
      const { resource: created } = await container.items.create(newTrip)

      return { status: 201, jsonBody: created }
    } catch (error) {
      context.error('旅程の作成に失敗しました', error)
      return { status: 500, jsonBody: { error: '旅程の作成に失敗しました。' } }
    }
  },
})

// PUT /api/trips/{id}
// 既存の旅行計画を更新する。EditView.vue の「保存する」ボタンから、
// D&Dで並び替え・インライン編集した後の items 配列などを丸ごと上書き保存する用途。
//
// 1) 自分のuserIdをパーティションキーにしたポイントリードで既存ドキュメントを取得
//    (存在しない/他人の旅程 → 404、これが実質的な所有者チェックを兼ねる)
// 2) EDITABLE_FIELDS のみを上書きし、id/userId/author/likeCount/createdAt は死守する
// 3) replace() で同じ id・同じパーティションに書き戻す
app.http('updateTrip', {
  methods: ['PUT'],
  route: 'trips/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    const id = request.params.id
    const body = await request.json().catch(() => null)
    if (!body) {
      return { status: 400, jsonBody: { error: 'リクエストボディが不正です。' } }
    }

    try {
      const container = getContainer(CONTAINER_ID)
      const { resource: existing } = await container.item(id, user.userId).read()

      if (!existing) {
        return { status: 404, jsonBody: { error: '指定された旅程が見つかりません、または編集権限がありません。' } }
      }

      const updated = { ...existing }
      for (const field of EDITABLE_FIELDS) {
        if (body[field] !== undefined) {
          updated[field] = body[field]
        }
      }
      updated.updatedAt = new Date().toISOString()

      const { resource: saved } = await container.item(id, user.userId).replace(updated)
      return { status: 200, jsonBody: saved }
    } catch (error) {
      if (error.code === 404) {
        return { status: 404, jsonBody: { error: '指定された旅程が見つかりません、または編集権限がありません。' } }
      }
      context.error('旅程の更新に失敗しました', error)
      return { status: 500, jsonBody: { error: '旅程の更新に失敗しました。' } }
    }
  },
})

// DELETE /api/trips/{id}
// 旅行計画そのものを完全に削除する。取り消し不可の破壊的操作。
// PUT/GET と同じく、自分のuserIdをパーティションキーにした削除のため、
// 他人の旅程を(idを知っていても)削除することはできない。
app.http('deleteTrip', {
  methods: ['DELETE'],
  route: 'trips/{id}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    const id = request.params.id

    try {
      const container = getContainer(CONTAINER_ID)
      await container.item(id, user.userId).delete()
      return { status: 204 }
    } catch (error) {
      if (error.code === 404) {
        return { status: 404, jsonBody: { error: '指定された旅程が見つかりません、または削除権限がありません。' } }
      }
      context.error('旅程の削除に失敗しました', error)
      return { status: 500, jsonBody: { error: '旅程の削除に失敗しました。' } }
    }
  },
})

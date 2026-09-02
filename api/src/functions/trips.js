const { app } = require('@azure/functions')
const { randomUUID } = require('node:crypto')
const { getContainer } = require('../shared/cosmosClient')
const { getUserInfo } = require('../shared/getUserInfo')

const CONTAINER_ID = 'trips'

// 更新を許可するフィールドのホワイトリスト。id / userId / author / likeCount / createdAt / editToken は
// クライアントから書き換えさせない (PUTのボディに紛れ込んでいても無視する)。
const EDITABLE_FIELDS = ['title', 'destination', 'startDate', 'endDate', 'coverGradient', 'genreTags', 'items', 'isPublic']

// id だけを条件にクロスパーティションで検索する。trips コンテナの id は一意なので
// 通常は最大1件しかヒットしない。オーナー以外 (同行者) がトークンでアクセスしてくる場合、
// パーティションキー(userId)が呼び出し元のuserIdと一致しないため、通常のポイントリードでは
// 見つけられない。その代替経路としてのみ使うクエリ (=呼び出し頻度は低い想定)。
async function findTripByIdAcrossPartitions(container, id) {
  const { resources } = await container.items
    .query({
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: id }],
    })
    .fetchAll()
  return resources[0] ?? null
}

// 「編集アクセス」の解決ロジック。以下のいずれかを満たせば許可する。
//   1) 呼び出し元が作成者本人 (user.userId === trip.userId)
//   2) 正しい editToken を持っている (同行者への招待URL経由)
//
// 1) はパーティションキーが自分のuserIdと一致するため、単一パーティションの
// ポイントリードで完結する (低コスト・高速)。これで見つからず、かつ token が
// 渡されている場合のみ、フォールバックとしてクロスパーティションクエリを行う。
// 所有者以外からのアクセスは稀なケースという前提のコスト設計。
async function resolveTripAccess(container, id, user, token) {
  try {
    const { resource: owned } = await container.item(id, user.userId).read()
    if (owned) {
      // 同行者招待機能を追加する前に作成された旅程には editToken が存在しない。
      // 所有者本人がアクセスしてきたこのタイミングで発行し、その場で永続化しておく
      // (専用のマイグレーションスクリプトを用意しない、遅延的な後方互換対応)。
      if (!owned.editToken) {
        owned.editToken = randomUUID()
        owned.updatedAt = new Date().toISOString()
        const { resource: healed } = await container.item(id, user.userId).replace(owned)
        return { trip: healed, isOwner: true }
      }
      return { trip: owned, isOwner: true }
    }
  } catch (error) {
    if (error.code !== 404) throw error
  }

  if (token) {
    const found = await findTripByIdAcrossPartitions(container, id)
    if (found && found.editToken && found.editToken === token) {
      return { trip: found, isOwner: false }
    }
  }

  return null
}

// 招待URL (editToken) 経由でアクセスしてきた同行者を、初回アクセス時に
// collaboratorIds へ登録する。これにより、次回以降 GET /api/trips (一覧) にも
// この旅程が「共同編集中」として表示されるようになる。
//
// 注意: collaboratorIds はあくまで「一覧に表示するための便宜的な参照リスト」であり、
// アクセス許可そのものは (このリストへの登録有無に関わらず) editToken の一致で
// 判定される。すでに登録済み、または呼び出し元が所有者本人の場合は何もしない。
async function ensureCollaborator(container, trip, userId) {
  const collaboratorIds = Array.isArray(trip.collaboratorIds) ? trip.collaboratorIds : []
  if (trip.userId === userId || collaboratorIds.includes(userId)) {
    return trip
  }

  const updated = {
    ...trip,
    collaboratorIds: [...collaboratorIds, userId],
    updatedAt: new Date().toISOString(),
  }
  const { resource: saved } = await container.item(trip.id, trip.userId).replace(updated)
  return saved
}

// GET /api/trips
// ログイン中のユーザーが「所有者」または「共同編集者」のいずれかとして
// 関わっている旅行計画の一覧を取得する。
//
// 【重要な設計トレードオフ】 trips コンテナのパーティションキーは /userId (所有者側) のため、
// c.userId = @userId の部分だけなら単一パーティションのクエリで完結するが、
// ARRAY_CONTAINS(c.collaboratorIds, @userId) は所有者のuserIdとは無関係な
// (自分がパーティションキーに含まれない) ドキュメントも対象にする必要があるため、
// OR で組み合わせたこのクエリ全体がクロスパーティション実行になる
// (=Cosmos DBが全パーティションをスキャンする分、RU消費は増える)。
// 個人〜小規模グループ利用の想定であれば許容範囲だが、大規模化する場合は
// 「userId をパーティションキーに持つ "membership" 専用コンテナ」に
// 所有者/共同編集者の関連を非正規化して持たせる設計に切り替えるのが望ましい。
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
          query:
            'SELECT * FROM c WHERE c.userId = @userId OR ARRAY_CONTAINS(c.collaboratorIds, @userId) ORDER BY c.updatedAt DESC',
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

// GET /api/trips/{id}?token=xxxx
// PUT /api/trips/{id} (更新) と対になる、単一旅程の詳細取得。
// EditView.vue / PostDetailView.vue が特定の旅程を読み込む際に使用する。
// クエリパラメータ token を付けて呼ぶと、作成者本人でなくても
// (正しい editToken であれば) 同行者として閲覧・取得できる。
//
// 同行者としてのアクセスが確認できた場合、この呼び出しの中で
// collaboratorIds への登録 (ensureCollaborator) まで行う。
// これにより「共有URLを開いただけ」で、以後その人自身のホーム画面
// (GET /api/trips 一覧) にもこの旅程が表示されるようになる。
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
    const token = request.query.get('token') || undefined

    try {
      const container = getContainer(CONTAINER_ID)
      const result = await resolveTripAccess(container, id, user, token)

      if (!result) {
        return { status: 404, jsonBody: { error: '指定された旅程が見つかりません。' } }
      }

      let trip = result.trip
      if (!result.isOwner) {
        trip = await ensureCollaborator(container, trip, user.userId)
      }

      return { status: 200, jsonBody: trip }
    } catch (error) {
      context.error('旅程の取得に失敗しました', error)
      return { status: 500, jsonBody: { error: '旅程の取得に失敗しました。' } }
    }
  },
})

// POST /api/trips
// 新しい旅行計画を作成する。author は x-ms-client-principal の userDetails から
// その場で組み立てる (SNSプロフィール機能とは切り離し、trips コンテナのみで完結させる)。
// editToken は作成時に発行し、以後この旅程の「同行者招待URL」の合言葉として使う。
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
        editToken: randomUUID(),
        collaboratorIds: [],
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

// PUT /api/trips/{id}?token=xxxx
// 既存の旅行計画を更新する。EditView.vue の「保存する」ボタンから、
// D&Dで並び替え・インライン編集した後の items 配列などを丸ごと上書き保存する用途。
//
// 1) resolveTripAccess で「自分が作成者」または「正しいtokenを持つ同行者」かを判定
// 2) EDITABLE_FIELDS のみを上書きし、id/userId/author/likeCount/createdAt/editToken は死守する
// 3) replace() は "ドキュメント本来の所有者(existing.userId)" のパーティションへ書き戻す
//    (呼び出し元が同行者の場合、そのuserIdは trip の所有者と異なるため、
//     replace の第2引数は必ず existing.userId を使う必要がある点に注意)
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
    const token = request.query.get('token') || undefined
    const body = await request.json().catch(() => null)
    if (!body) {
      return { status: 400, jsonBody: { error: 'リクエストボディが不正です。' } }
    }

    try {
      const container = getContainer(CONTAINER_ID)
      const result = await resolveTripAccess(container, id, user, token)

      if (!result) {
        return { status: 404, jsonBody: { error: '指定された旅程が見つかりません、または編集権限がありません。' } }
      }

      const existing = result.trip
      const updated = { ...existing }
      for (const field of EDITABLE_FIELDS) {
        if (body[field] !== undefined) {
          updated[field] = body[field]
        }
      }
      updated.updatedAt = new Date().toISOString()

      const { resource: saved } = await container.item(id, existing.userId).replace(updated)
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
// 意図的に「作成者本人のみ」に限定し、editToken を持つ同行者には許可しない
// (招待された同行者が旅程ごと消せてしまうのはリスクが大きいため)。
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

const { app } = require('@azure/functions')
const { getUserInfo } = require('../shared/getUserInfo')
const { getOrCreateProfile } = require('../shared/profileService')

// GET /api/profile
// ログイン中ユーザーのSNSプロフィール(表示名・アバター・自己紹介)を取得する。
// users コンテナに該当ドキュメントが存在しない場合 (= 初回ログイン) は
// ダミーの初期プロフィールを自動生成して保存してから返す (upsert)。
app.http('getProfile', {
  methods: ['GET'],
  route: 'profile',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const user = getUserInfo(request)
    if (!user) {
      return { status: 401, jsonBody: { error: 'ログインが必要です。' } }
    }

    try {
      const profile = await getOrCreateProfile(user)
      return { status: 200, jsonBody: profile }
    } catch (error) {
      context.error('プロフィールの取得に失敗しました', error)
      return { status: 500, jsonBody: { error: 'プロフィールの取得に失敗しました。' } }
    }
  },
})

const { getContainer } = require('./cosmosClient')

function buildDefaultProfile(user) {
  const now = new Date().toISOString()
  const displayName = user.userDetails || 'ゲストユーザー'

  return {
    id: user.userId,
    userId: user.userId,
    displayName,
    avatarInitial: displayName.charAt(0).toUpperCase(),
    avatarColor: 'bg-indigo-100 text-indigo-700',
    bio: '',
    provider: user.identityProvider,
    createdAt: now,
    updatedAt: now,
  }
}

// users コンテナから該当ユーザーのプロフィールを取得する。存在しない場合は
// (初回ログイン時など) ダミーの初期プロフィールを自動生成して保存してから返す。
// パーティションキーが /id (= userId と同値) なので item().read() による
// 単一パーティションのポイントリードで完結し、クエリより低コスト。
async function getOrCreateProfile(user) {
  const container = getContainer('users')

  try {
    const { resource: existing } = await container.item(user.userId, user.userId).read()
    if (existing) {
      return existing
    }
  } catch (error) {
    if (error.code !== 404) {
      throw error
    }
    // 404 = まだプロフィールが存在しない → このあと自動作成する
  }

  const defaultProfile = buildDefaultProfile(user)
  const { resource: created } = await container.items.upsert(defaultProfile)
  return created
}

module.exports = { getOrCreateProfile }

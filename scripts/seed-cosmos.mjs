// Cosmos DB の trips / users コンテナへテストデータを投入するスクリプト。
// SWA CLI のモック認証で "test-user-1" / "test-user-2" としてログインした際に
// すぐ動作確認できるよう、両ユーザーに紐づくデータを用意する。
//
// 事前準備:
//   1. リポジトリルートに .env を作成し、以下を記載する (api/local.settings.json と同じ値でOK)
//        COSMOS_ENDPOINT=https://<your-cosmos-account>.documents.azure.com:443/
//        COSMOS_KEY=<your-primary-key>
//        COSMOS_DATABASE=TravelSnsDb
//   2. npm run seed

import 'dotenv/config'
import { CosmosClient } from '@azure/cosmos'

const endpoint = process.env.COSMOS_ENDPOINT
const key = process.env.COSMOS_KEY
const databaseId = process.env.COSMOS_DATABASE || 'TravelSnsDb'

if (!endpoint || !key) {
  console.error('COSMOS_ENDPOINT / COSMOS_KEY が未設定です。リポジトリルートの .env を確認してください。')
  process.exit(1)
}

const testUsers = [
  {
    id: 'test-user-1',
    userId: 'test-user-1',
    displayName: 'テスト太郎',
    avatarInitial: 'テ',
    avatarColor: 'bg-indigo-100 text-indigo-700',
    bio: '開発用テストアカウントです。',
    provider: 'github',
  },
  {
    id: 'test-user-2',
    userId: 'test-user-2',
    displayName: 'テスト花子',
    avatarInitial: 'テ',
    avatarColor: 'bg-rose-100 text-rose-700',
    bio: '',
    provider: 'github',
  },
]

const testTrips = [
  {
    id: 'seed-trip-1',
    userId: 'test-user-1',
    title: 'ソウル旅行 2泊3日',
    destination: 'ソウル, 韓国',
    startDate: '2026-09-20',
    endDate: '2026-09-22',
    coverGradient: 'from-sky-500 to-indigo-600',
    genreTags: ['弾丸トラベル', 'グルメ', '夜景'],
    isPublic: true,
    likeCount: 12,
    author: { userId: 'test-user-1', displayName: 'テスト太郎', avatarInitial: 'テ' },
    items: [],
  },
  {
    id: 'seed-trip-2',
    userId: 'test-user-1',
    title: '京都 紅葉日帰り旅',
    destination: '京都, 日本',
    startDate: '2026-11-22',
    endDate: '2026-11-22',
    coverGradient: 'from-amber-500 to-red-600',
    genreTags: ['紅葉', '観光', '日帰り'],
    isPublic: true,
    likeCount: 3,
    author: { userId: 'test-user-1', displayName: 'テスト太郎', avatarInitial: 'テ' },
    items: [],
  },
  {
    id: 'seed-trip-3',
    userId: 'test-user-2',
    title: '台北 弾丸グルメ2泊3日',
    destination: '台北, 台湾',
    startDate: '2026-11-14',
    endDate: '2026-11-16',
    coverGradient: 'from-rose-500 to-orange-500',
    genreTags: ['グルメ', '夜市', '弾丸トラベル'],
    isPublic: true,
    likeCount: 5,
    author: { userId: 'test-user-2', displayName: 'テスト花子', avatarInitial: 'テ' },
    items: [],
  },
]

async function seed() {
  const client = new CosmosClient({ endpoint, key })
  const database = client.database(databaseId)
  const usersContainer = database.container('users')
  const tripsContainer = database.container('trips')
  const now = new Date().toISOString()

  for (const user of testUsers) {
    await usersContainer.items.upsert({ ...user, createdAt: now, updatedAt: now })
    console.log(`[users]  upserted: ${user.id}`)
  }

  for (const trip of testTrips) {
    await tripsContainer.items.upsert({ ...trip, createdAt: now, updatedAt: now })
    console.log(`[trips]  upserted: ${trip.id} (owner: ${trip.userId})`)
  }

  console.log('\nシードデータの投入が完了しました。')
}

seed().catch((error) => {
  console.error('シード投入に失敗しました:', error.message)
  process.exit(1)
})

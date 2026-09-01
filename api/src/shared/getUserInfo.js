// Azure Static Web Apps は、認証済みリクエストをManaged Functionsへプロキシする際に
// x-ms-client-principal ヘッダーへ Base64 エンコードした JSON でユーザー情報を自動付与する。
// このヘッダーは ASWA のエッジ側でのみ設定可能で、クライアントが自前で偽装することはできない
// (SWA CLI のローカルエミュレーターも同じ形式でこのヘッダーを付与する)。
//
// principal の形式:
// {
//   "identityProvider": "github",
//   "userId": "abcd1234...",           // プロバイダごとに一意なID (Cosmos DB の userId として利用)
//   "userDetails": "octocat",          // ログイン名やメールアドレスなど表示用の識別子
//   "userRoles": ["anonymous", "authenticated"]
// }
function getUserInfo(request) {
  const header = request.headers.get('x-ms-client-principal')
  if (!header) {
    return null
  }

  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8')
    const principal = JSON.parse(decoded)

    if (!principal?.userId) {
      return null
    }

    return {
      userId: principal.userId,
      userDetails: principal.userDetails,
      identityProvider: principal.identityProvider,
      userRoles: principal.userRoles || [],
    }
  } catch {
    // ヘッダーが壊れている/想定外の形式の場合は未ログイン扱いにする
    return null
  }
}

module.exports = { getUserInfo }

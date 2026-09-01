import { computed, ref } from 'vue'

// アプリ全体で1つだけ状態を共有する (Piniaを導入するほどではない規模のため、
// モジュールスコープの ref によるシングルトンパターンで代替する)。
const user = ref(null)
const isLoading = ref(true)
let authPromise = null

// ASWA組み込み認証の /.auth/me は、ログイン済みなら
// { clientPrincipal: { userId, userDetails, identityProvider, userRoles } } を、
// 未ログインなら { clientPrincipal: null } を返す。
// SWA CLI のローカルエミュレーターも本番と全く同じレスポンス形式を返すため、
// このコンポーザブルはローカル/本番でコードを分岐する必要がない。
function fetchCurrentUser() {
  isLoading.value = true
  authPromise = fetch('/.auth/me')
    .then((res) => res.json())
    .then((payload) => {
      user.value = payload.clientPrincipal
    })
    .catch((error) => {
      console.error('認証情報の取得に失敗しました', error)
      user.value = null
    })
    .finally(() => {
      isLoading.value = false
    })
  return authPromise
}

export function useAuth() {
  if (!authPromise) {
    fetchCurrentUser()
  }

  const isAuthenticated = computed(() => !!user.value)

  function loginUrl(provider = 'github') {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search)
    return `/.auth/login/${provider}?post_login_redirect_uri=${redirect}`
  }

  function logoutUrl() {
    return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent('/')}`
  }

  return {
    user,
    isLoading,
    isAuthenticated,
    loginUrl,
    logoutUrl,
    refresh: fetchCurrentUser,
    // onMounted内で `await ready()` することで、認証状態が確定してから
    // 後続のAPI呼び出し (GET /api/trips 等) を行える
    ready: () => authPromise,
  }
}

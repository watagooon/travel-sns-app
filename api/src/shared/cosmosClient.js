const { CosmosClient } = require('@azure/cosmos')

let cachedClient

// Function App のコールドスタート間で接続を使い回すため、モジュールスコープにキャッシュする
function getCosmosClient() {
  if (!cachedClient) {
    cachedClient = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT,
      key: process.env.COSMOS_KEY,
    })
  }
  return cachedClient
}

function getContainer(containerId) {
  const database = getCosmosClient().database(process.env.COSMOS_DATABASE)
  return database.container(containerId)
}

module.exports = { getContainer }

const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob')

// 予定に添付する画像を保存するコンテナ。
// Azureポータル側で「パブリックアクセスレベル: Blob (匿名の読み取りアクセスを許可)」
// で作成しておく想定 (コンテナ自体の一覧は非公開のまま、個々のBlob URLだけが読み取り可能)。
const CONTAINER_NAME = 'trip-photos'

let cachedCredential
let cachedServiceClient

function getCredential() {
  if (!cachedCredential) {
    cachedCredential = new StorageSharedKeyCredential(
      process.env.AZURE_STORAGE_ACCOUNT_NAME,
      process.env.AZURE_STORAGE_ACCOUNT_KEY,
    )
  }
  return cachedCredential
}

function getBlobServiceClient() {
  if (!cachedServiceClient) {
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME
    cachedServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      getCredential(),
    )
  }
  return cachedServiceClient
}

function getContainerClient() {
  return getBlobServiceClient().getContainerClient(CONTAINER_NAME)
}

module.exports = { getContainerClient, CONTAINER_NAME }

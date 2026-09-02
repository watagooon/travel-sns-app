const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require('@azure/storage-blob')

// 予定に添付する画像を保存するコンテナ。
// Azureポータル側で「パブリックアクセスレベル: Blob (匿名の読み取りアクセスを許可)」
// で作成しておく想定 (コンテナ自体の一覧は非公開のまま、個々のBlob URLだけが読み取り可能)。
const CONTAINER_NAME = 'trip-photos'
const UPLOAD_SAS_EXPIRY_MINUTES = 10

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

// 指定した blobName に対して、書き込み専用・短時間だけ有効なSAS URLを発行する。
// 実際の画像バイナリはこのURLへブラウザから直接PUTされるため、
// Functions 自体は画像データを一切扱わない (ペイロードサイズ制限・コールドスタートの影響を受けない)。
function generateUploadSasUrl(blobName, contentType) {
  const containerClient = getContainerClient()
  const blobClient = containerClient.getBlockBlobClient(blobName)

  const expiresOn = new Date(Date.now() + UPLOAD_SAS_EXPIRY_MINUTES * 60 * 1000)
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName,
      permissions: BlobSASPermissions.parse('cw'), // create + write のみ (読み取り・削除は不可)
      expiresOn,
      contentType,
    },
    getCredential(),
  ).toString()

  return {
    uploadUrl: `${blobClient.url}?${sasToken}`,
    blobUrl: blobClient.url,
  }
}

module.exports = { getContainerClient, generateUploadSasUrl, CONTAINER_NAME }

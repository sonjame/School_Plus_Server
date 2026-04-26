import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import 'dotenv/config'

export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export const BUCKET = process.env.AWS_S3_BUCKET!
export const BUCKET_URL = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`

/** temp/ 이미지를 posts/{postId}/ 로 이동 */
export async function moveTempToPost(
  urls: string[],
  postId: string,
): Promise<string[]> {
  const final: string[] = []

  for (const url of urls) {
    if (url.startsWith(BUCKET_URL + 'temp/')) {
      const key = url.replace(BUCKET_URL, '')

      try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
      } catch {
        final.push(url)
        continue
      }

      const fileName = key.split('/').pop()!
      const newKey = `posts/${postId}/${fileName}`

      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET,
          CopySource: `${BUCKET}/${key}`,
          Key: newKey,
        }),
      )
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
      final.push(`${BUCKET_URL}${newKey}`)
    } else {
      final.push(url)
    }
  }

  return final
}

/** URL에서 S3 키 추출 후 삭제 */
export async function deleteS3Url(url: string) {
  try {
    const u = new URL(url)
    const key = decodeURIComponent(u.pathname.slice(1))
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch {
    // ignore
  }
}

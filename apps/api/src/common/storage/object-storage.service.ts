import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class ObjectStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly kmsKeyId?: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.getOrThrow<string>('OBJECT_STORAGE_BUCKET');
    this.kmsKeyId = config.get<string>('OBJECT_STORAGE_KMS_KEY_ID') || undefined;
    const accessKeyId = config.get<string>('OBJECT_STORAGE_ACCESS_KEY');
    const secretAccessKey = config.get<string>('OBJECT_STORAGE_SECRET_KEY');
    this.client = new S3Client({
      region: config.get<string>('OBJECT_STORAGE_REGION', 'ap-south-1'),
      endpoint: config.get<string>('OBJECT_STORAGE_ENDPOINT') || undefined,
      forcePathStyle: config.get<boolean>('OBJECT_STORAGE_FORCE_PATH_STYLE', false),
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }

  async createUploadUrl(input: { key: string; contentType: string; sha256: string }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      Metadata: { sha256: input.sha256 },
      ServerSideEncryption: this.kmsKeyId ? 'aws:kms' : 'AES256',
      SSEKMSKeyId: this.kmsKeyId,
    });
    try {
      const expiresIn = this.config.get<number>('DOCUMENT_UPLOAD_URL_TTL_SECONDS', 600);
      return {
        uploadUrl: await getSignedUrl(this.client, command, { expiresIn }),
        expiresIn,
        requiredHeaders: {
          'content-type': input.contentType,
          'x-amz-meta-sha256': input.sha256,
          'x-amz-server-side-encryption': this.kmsKeyId ? 'aws:kms' : 'AES256',
          ...(this.kmsKeyId ? { 'x-amz-server-side-encryption-aws-kms-key-id': this.kmsKeyId } : {}),
        },
      };
    } catch {
      throw new ServiceUnavailableException('Secure document upload is temporarily unavailable');
    }
  }

  async assertUploaded(input: { key: string; contentType: string; sizeBytes: number; sha256: string }): Promise<void> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }));
      if (head.ContentLength !== input.sizeBytes) throw new BadRequestException('Uploaded file size does not match the request');
      if (head.ContentType !== input.contentType) throw new BadRequestException('Uploaded file type does not match the request');
      if (head.Metadata?.sha256 !== input.sha256) throw new BadRequestException('Uploaded file checksum metadata does not match');
      if (!head.ServerSideEncryption) throw new BadRequestException('Uploaded document is not encrypted at rest');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) throw new NotFoundException('Uploaded document was not found');
      throw new ServiceUnavailableException('Could not verify the uploaded document');
    }
  }

  async createDownloadUrl(key: string) {
    const expiresIn = this.config.get<number>('DOCUMENT_DOWNLOAD_URL_TTL_SECONDS', 300);
    try {
      return { downloadUrl: await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn }), expiresIn };
    } catch {
      throw new ServiceUnavailableException('Secure document download is temporarily unavailable');
    }
  }
}

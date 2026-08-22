import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service.js';

describe('ObjectStorageService upload verification', () => {
  const create = () => {
    const service = new ObjectStorageService(new ConfigService({
      OBJECT_STORAGE_BUCKET: 'carebook-test',
      OBJECT_STORAGE_REGION: 'ap-south-1',
    }));
    const send = jest.fn();
    (service as unknown as { client: { send: jest.Mock } }).client.send = send;
    return { service, send };
  };

  it('accepts matching encrypted object metadata', async () => {
    const { service, send } = create();
    send.mockResolvedValue({ ContentLength: 100, ContentType: 'application/pdf', Metadata: { sha256: 'a'.repeat(64) }, ServerSideEncryption: 'AES256' });
    await expect(service.assertUploaded({ key: 'document', contentType: 'application/pdf', sizeBytes: 100, sha256: 'a'.repeat(64) })).resolves.toBeUndefined();
  });

  it('rejects a mismatched object size', async () => {
    const { service, send } = create();
    send.mockResolvedValue({ ContentLength: 99, ContentType: 'application/pdf', Metadata: { sha256: 'a'.repeat(64) }, ServerSideEncryption: 'AES256' });
    await expect(service.assertUploaded({ key: 'document', contentType: 'application/pdf', sizeBytes: 100, sha256: 'a'.repeat(64) })).rejects.toBeInstanceOf(BadRequestException);
  });
});


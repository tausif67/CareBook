import { validate } from 'class-validator';
import { StartDoctorDocumentUploadDto } from './doctors.dto.js';

describe('StartDoctorDocumentUploadDto', () => {
  it('accepts only the bounded private-document contract', async () => {
    const dto = Object.assign(new StartDoctorDocumentUploadDto(), {
      type: 'MEDICAL_REGISTRATION',
      fileName: 'registration.pdf',
      contentType: 'application/pdf',
      sizeBytes: 250_000,
      sha256: 'a'.repeat(64),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects executable content, oversized files, and invalid checksums', async () => {
    const dto = Object.assign(new StartDoctorDocumentUploadDto(), {
      type: 'MEDICAL_REGISTRATION',
      fileName: 'registration.exe',
      contentType: 'application/octet-stream',
      sizeBytes: 11_000_000,
      sha256: 'not-a-checksum',
    });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['contentType', 'sizeBytes', 'sha256']));
  });
});


export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface FileValidationResult {
  valid: boolean;
  mimeType?: SupportedImageMimeType;
  error?: string;
}

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4.0 MB ceiling per docs/rules.md §5

/**
 * Validates file signature (magic bytes) and payload size strictly in-memory.
 * Never trusts client-reported MIME types or file extensions.
 *
 * Signatures:
 * - JPEG: 0xFF, 0xD8, 0xFF
 * - PNG:  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
 * - WebP: 'RIFF' (bytes 0-3) + 'WEBP' (bytes 8-11)
 */
export function validateImageFile(buffer: Uint8Array): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      error: 'Empty file payload. Please upload a clear photo of the delivery receipt.',
    };
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: 'Image file exceeds the 4 MB size limit. Please upload a compressed or resized photo.',
    };
  }

  // Check JPEG magic bytes: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      valid: true,
      mimeType: 'image/jpeg',
    };
  }

  // Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      valid: true,
      mimeType: 'image/png',
    };
  }

  // Check WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // 'R'
    buffer[1] === 0x49 && // 'I'
    buffer[2] === 0x46 && // 'F'
    buffer[3] === 0x46 && // 'F'
    buffer[8] === 0x57 && // 'W'
    buffer[9] === 0x45 && // 'E'
    buffer[10] === 0x42 && // 'B'
    buffer[11] === 0x50 // 'P'
  ) {
    return {
      valid: true,
      mimeType: 'image/webp',
    };
  }

  return {
    valid: false,
    error: 'Unsupported file type. Please upload a clear photo formatted as JPEG, PNG, or WebP.',
  };
}



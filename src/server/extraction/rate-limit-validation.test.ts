import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from './file-validation';
import { hashClientIp } from './rate-limit';

describe('File Validation & Rate Limiting Helpers', () => {
  describe('validateImageFile (Magic Bytes)', () => {
    it('detects valid JPEG images via FF D8 FF signature', () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const res = validateImageFile(jpegBytes);
      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe('image/jpeg');
    });

    it('detects valid PNG images via 89 50 4E 47 0D 0A 1A 0A signature', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const res = validateImageFile(pngBytes);
      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe('image/png');
    });

    it('detects valid WebP images via RIFF....WEBP signature', () => {
      const webpBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // 'RIFF'
        0x20, 0x00, 0x00, 0x00, // file length bytes
        0x57, 0x45, 0x42, 0x50, // 'WEBP'
        0x56, 0x50, 0x38, 0x20, // 'VP8 '
      ]);
      const res = validateImageFile(webpBytes);
      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe('image/webp');
    });

    it('rejects empty payloads', () => {
      const res = validateImageFile(new Uint8Array([]));
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Empty file');
    });

    it('rejects spoofed file formats (e.g. text or executables)', () => {
      const textBytes = new TextEncoder().encode('Hello, this is not an image');
      const res = validateImageFile(textBytes);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unsupported file type');
    });

    it('rejects files exceeding 4 MB size limit', () => {
      // 4 MB + 1 byte
      const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
      // Valid JPEG header
      oversized[0] = 0xff;
      oversized[1] = 0xd8;
      oversized[2] = 0xff;

      const res = validateImageFile(oversized);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('4 MB');
    });
  });

  describe('hashClientIp (Salted SHA-256)', () => {
    it('generates consistent hashes for identical IP addresses', () => {
      const hash1 = hashClientIp('192.168.1.100');
      const hash2 = hashClientIp('192.168.1.100');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string length
    });

    it('generates different hashes for different IP addresses', () => {
      const hashA = hashClientIp('192.168.1.100');
      const hashB = hashClientIp('192.168.1.101');
      expect(hashA).not.toBe(hashB);
    });

    it('handles IPv6 loopback and normalization safely', () => {
      const hashV6 = hashClientIp('::1');
      const hashV6Upper = hashClientIp('::1 ');
      expect(hashV6).toBe(hashV6Upper);
      expect(hashV6).not.toContain('::1'); // Never leaks raw IP
    });
  });
});



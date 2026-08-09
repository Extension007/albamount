const { validateImageType } = require('../../services/imageService');

describe('validateImageType magic bytes', () => {
  test('accepts JPEG', async () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(await validateImageType(buf)).toBe(true);
  });

  test('accepts PNG', async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(await validateImageType(buf)).toBe(true);
  });

  test('rejects non-image', async () => {
    const buf = Buffer.from('<?php echo 1;?>XXXX');
    expect(await validateImageType(buf)).toBe(false);
  });

  test('rejects empty', async () => {
    expect(await validateImageType(null)).toBe(false);
    expect(await validateImageType(Buffer.alloc(0))).toBe(false);
  });
});

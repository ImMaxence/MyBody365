import { b64url } from './passkey.service';

describe('b64url', () => {
  it('round-trips any bytes without padding or URL-unsafe characters', () => {
    for (const length of [0, 1, 2, 3, 16, 31, 32, 65]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 97 + 13) % 256);
      const text = b64url.encode(bytes.buffer);
      expect(text).not.toMatch(/[+/=]/);
      expect(new Uint8Array(b64url.decode(text))).toEqual(bytes);
    }
  });

  it('decodes what Spring Security sends', () => {
    // "hello?>" in base64url
    expect(new TextDecoder().decode(b64url.decode('aGVsbG8_Pg'))).toBe('hello?>');
  });
});

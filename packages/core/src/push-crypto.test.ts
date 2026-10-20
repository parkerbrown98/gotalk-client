import { describe, expect, it } from 'vitest';

import {
  base64UrlDecode,
  base64UrlEncode,
  decryptPushBody,
  decryptPushBodyWithAny,
  encryptPushBody,
  generatePushKeys,
  PushDecryptError,
} from './push-crypto.ts';

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const text = new TextEncoder();

// RFC 8291 Appendix A.
const RFC = {
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  plaintext: 'When I grow up, I want to be a watermelon',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const rfcKeys = { privateKey: RFC.uaPrivate, p256dh: RFC.uaPublic, auth: RFC.auth };

describe('push crypto', () => {
  it('decrypts the RFC 8291 Appendix A body', () => {
    const plain = decryptPushBody(base64UrlDecode(RFC.body), rfcKeys);
    expect(new TextDecoder().decode(plain)).toBe(RFC.plaintext);
  });

  it('encrypts the RFC 8291 Appendix A body byte for byte', () => {
    const body = encryptPushBody(text.encode(RFC.plaintext), rfcKeys, {
      senderPrivateKey: base64UrlDecode(RFC.asPrivate),
      salt: base64UrlDecode(RFC.salt),
    });
    expect(base64UrlEncode(body)).toBe(RFC.body);
  });

  it('generates keys that round-trip padded plaintexts', () => {
    const keys = generatePushKeys(random);
    expect(base64UrlDecode(keys.privateKey)).toHaveLength(32);
    expect(base64UrlDecode(keys.p256dh)).toHaveLength(65);
    expect(base64UrlDecode(keys.p256dh)[0]).toBe(4);
    expect(base64UrlDecode(keys.auth)).toHaveLength(16);
    for (const padding of [0, 1, 200, 1500]) {
      const plaintext = text.encode(JSON.stringify({ v: 1, title: 'Hello', padding }));
      const body = encryptPushBody(plaintext, keys, { senderPrivateKey: generatePushKeySecret(), salt: random(16), padding });
      expect(decryptPushBody(body, keys)).toEqual(plaintext);
    }
  });

  it('tells a wrong key from a malformed body', () => {
    const mine = generatePushKeys(random);
    const theirs = generatePushKeys(random);
    const body = encryptPushBody(text.encode('hi'), theirs, { senderPrivateKey: generatePushKeySecret(), salt: random(16) });
    expect(() => decryptPushBody(body, mine)).toThrow(PushDecryptError);
    try {
      decryptPushBody(body, mine);
    } catch (e) {
      expect((e as PushDecryptError).reason).toBe('wrong_key');
    }
    expect(() => decryptPushBody(body.subarray(0, 20), mine)).toThrow(/header/);
    const tampered = body.slice();
    tampered[20] = 200;
    expect(() => decryptPushBody(tampered, mine)).toThrow(/key ID/);
  });

  it('finds the key that fits among several', () => {
    const a = generatePushKeys(random);
    const b = generatePushKeys(random);
    const body = encryptPushBody(text.encode('for b'), b, { senderPrivateKey: generatePushKeySecret(), salt: random(16) });
    const opened = decryptPushBodyWithAny(body, [a, b]);
    expect(opened?.key).toBe(b);
    expect(new TextDecoder().decode(opened!.plaintext)).toBe('for b');
    expect(decryptPushBodyWithAny(body, [a])).toBeNull();
  });

  it('rejects text that is not base64url', () => {
    expect(() => base64UrlDecode('not base64!')).toThrow();
    expect(base64UrlDecode('AQID')).toEqual(new Uint8Array([1, 2, 3]));
    expect(base64UrlEncode(new Uint8Array([251, 255]))).toBe('-_8');
  });
});

function generatePushKeySecret(): Uint8Array {
  return base64UrlDecode(generatePushKeys(random).privateKey);
}

import { describe, expect, it } from 'vitest';

import { API_VERSION_HEADER, ApiError, createGotalkClient, removeImage, unwrap, uploadFailureKind, UploadError, uploadAttachment, uploadImage } from './index.ts';

const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });

/** Fake fetch that records the Request objects openapi-fetch sends. */
function recordingFetch(respond: () => Response) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    requests.push(input as Request);
    return respond();
  };
  return { fetch, requests };
}

describe('createGotalkClient', () => {
  it('sends the API version and bearer token against the base URL', async () => {
    const { fetch, requests } = recordingFetch(() => json({ name: 'Test' }));
    const client = createGotalkClient({ baseUrl: 'https://x.example/api/v1/', getAccessToken: () => 'tok', fetch });

    const res = await client.GET('/instance');

    const req = requests[0]!;
    expect(req.url).toBe('https://x.example/api/v1/instance');
    expect(req.headers.get(API_VERSION_HEADER)).toBe('v1');
    expect(req.headers.get('Authorization')).toBe('Bearer tok');
    expect(unwrap(res).name).toBe('Test');
  });

  it('omits Authorization when there is no token', async () => {
    const { fetch, requests } = recordingFetch(() => json({}));
    await createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch }).GET('/instance');
    expect(requests[0]!.headers.has('Authorization')).toBe(false);
  });

  it('unwrap throws ApiError with problem details', async () => {
    const { fetch } = recordingFetch(() =>
      json({ title: 'Not Found', status: 404, detail: 'place not found' }, 404, 'application/problem+json'),
    );
    const res = await createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch }).GET('/places/{place}', {
      params: { path: { place: 'nope' } },
    });
    let caught: unknown;
    try {
      unwrap(res);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
    expect((caught as ApiError).message).toBe('place not found');
  });

  it('exposes Retry-After, version mismatches and field errors as first-class states', async () => {
    const limited = new Response(JSON.stringify({ status: 429, detail: 'rate limit exceeded; retry after 42s' }), {
      status: 429,
      headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '42' },
    });
    let err: ApiError | undefined;
    try {
      unwrap({ error: { status: 429 }, response: limited });
    } catch (e) {
      err = e as ApiError;
    }
    expect(err?.isRateLimited).toBe(true);
    expect(err?.retryAfter).toBe(42);

    const mismatch = new ApiError(400, { detail: 'API version "v9" is not supported by this instance; supported versions: v1' });
    expect(mismatch.isVersionMismatch).toBe(true);
    expect(new ApiError(400, { detail: 'username is invalid' }).isVersionMismatch).toBe(false);

    const invalid = new ApiError(422, { errors: [{ location: 'body.email', message: 'email address is invalid' }] });
    expect(invalid.fieldErrors).toEqual({ email: 'email address is invalid' });
  });
});

describe('uploadImage', () => {
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

  it('sends the image as the raw body with its content type, to the right path', async () => {
    const { fetch, requests } = recordingFetch(() => json({ id: 'p1', icon_url: 'https://x.example/media/place-icons/1.png' }));
    const client = createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch });

    const place = await uploadImage(client, { kind: 'placeIcon', place: 'woodworkers' }, png());

    const req = requests[0]!;
    expect(req.method).toBe('PUT');
    expect(req.url).toBe('https://x.example/api/v1/places/woodworkers/icon');
    expect(req.headers.get('Content-Type')).toBe('image/png');
    expect([...new Uint8Array(await req.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(place.icon_url).toBe('https://x.example/media/place-icons/1.png');
  });

  it('lets the caller name the type of an untyped blob', async () => {
    const { fetch, requests } = recordingFetch(() => json({ id: 'u1' }));
    await uploadImage(createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch }), { kind: 'avatar' }, new Blob([new Uint8Array([1])]), 'image/jpeg');
    expect(requests[0]!.url).toBe('https://x.example/api/v1/users/@me/avatar');
    expect(requests[0]!.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it.each([
    [413, 'request entity too large', 'too_large'],
    [422, 'the file is larger than the 8388608 byte limit', 'too_large'],
    [422, 'image: unknown format', 'unsupported'],
    [503, 'file uploads are unavailable', 'unavailable'],
    [429, 'rate limit exceeded', 'rate_limited'],
    [500, 'internal server error', 'other'],
  ])('maps %i (%s) to %s', async (status, detail, kind) => {
    const { fetch } = recordingFetch(() => json({ status, detail }, status, 'application/problem+json'));
    const err = await uploadImage(createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch }), { kind: 'instanceIcon' }, png()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).kind).toBe(kind);
    expect((err as UploadError).message).toBe(detail);
    expect(uploadFailureKind(status, detail)).toBe(kind);
  });

  it('removes an image with DELETE', async () => {
    const { fetch, requests } = recordingFetch(() => json({ id: 'p1', banner_url: null }));
    const place = await removeImage(createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch }), { kind: 'placeBanner', place: 'p1' });
    expect(requests[0]!.method).toBe('DELETE');
    expect(requests[0]!.url).toBe('https://x.example/api/v1/places/p1/banner');
    expect(place.banner_url).toBeNull();
  });

  it('keeps the server error as the cause', () => {
    expect(new UploadError(new ApiError(413)).cause).toBeInstanceOf(ApiError);
  });

  it('uploads an attachment with its name and type', async () => {
    const { fetch, requests } = recordingFetch(() => json({ id: 'a1', url: 'https://x.example/media/attachments/a1.pdf', filename: 'plans v2.pdf', width: null }, 201));
    const file = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' });
    const att = await uploadAttachment(createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch }), file, 'plans v2.pdf');
    expect(requests[0]!.method).toBe('POST');
    expect(requests[0]!.url).toBe('https://x.example/api/v1/attachments?filename=plans%20v2.pdf');
    expect(requests[0]!.headers.get('Content-Type')).toBe('application/pdf');
    expect([...new Uint8Array(await requests[0]!.arrayBuffer())]).toEqual([37, 80, 68, 70]);
    expect(att.id).toBe('a1');

    const { fetch: refuse } = recordingFetch(() => json({ status: 413, detail: 'request entity too large' }, 413, 'application/problem+json'));
    const err = await uploadAttachment(createGotalkClient({ baseUrl: 'https://x.example/api/v1', fetch: refuse }), file, 'big.pdf').catch((e: unknown) => e);
    expect((err as UploadError).kind).toBe('too_large');
  });
});

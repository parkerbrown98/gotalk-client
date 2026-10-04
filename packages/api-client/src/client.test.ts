import { describe, expect, it } from 'vitest';

import { API_VERSION_HEADER, ApiError, createGotalkClient, unwrap } from './index.ts';

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
});

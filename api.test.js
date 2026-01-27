import { describe, it, expect, beforeAll } from 'vitest';
import util from './util.js'

process.env.SERVER_URL.split(',').forEach(server => {

	describe(new URL(server).host, () => {

		const State = {
			server,
			account: process.env.ACCOUNT,
			scope: process.env.TOKEN_SCOPE || 'api-test-suite',
			token_rw: process.env.TOKEN_READ_WRITE,
		};

		beforeAll(async () => {
			State.webfinger = await util.webfinger(State.server, State.account);
			State.baseURL = State.webfinger.href;
			State.version = parseInt(State.webfinger.type.match(/draft-dejong-remotestorage-(\d+)/).pop());
			State.storage = util.storage(State);
		});

		describe('unauthorized', () => {

			const unauthorized = () => util.storage(Object.assign(util.clone(State), {
				token_rw: undefined,
			}));

			it('handles GET', async () => {
				const res = await unauthorized().get(Math.random().toString());
				expect(res.status).toBe(401);
			});

			it('handles PUT', async () => {
				const res = await unauthorized().put(Math.random().toString(), {
					[Math.random().toString()]: Math.random().toString(),
				});
				expect(res.status).toBe(401);
			});

			it('handles DELETE', async () => {
				const res = await unauthorized().delete(Math.random().toString());
				expect(res.status).toBe(401);
			});

		});

		describe('create', () => {

			Object.entries({
				'without folder': Math.random().toString(),
				'with folder': [
					Math.random().toString(),
					Math.random().toString(),
				].join('/')
			}).forEach(([key, path]) => {

				it(`handles ${ key }`, async () => {
					const res = await State.storage.put(path, {
						[Math.random().toString()]: Math.random().toString(),
					});
					expect(res.status).toBeOneOf([200, 201])
					expect(res.headers.get('etag')).toSatisfy(State.version === 0 ? util.isEtag0 : util.isEtag1);
				});

			});

		});

		describe('read', () => {

			Object.entries({
				'without folder': Math.random().toString(),
				'with folder': [
					Math.random().toString(),
					Math.random().toString(),
				].join('/')
			}).forEach(([key, path]) => {

				it(`handles ${ key }`, async () => {
					const item = {
						[Math.random().toString()]: Math.random().toString(),
					};
					const put = await State.storage.put(path, item);
					const res = await State.storage.get(path);
					expect(res.status).toBe(200)
					expect(res.headers.get('etag')).toSatisfy(State.version === 0 ? util.isEtag0 : util.isEtag1);
					expect(res.headers.get('etag')).toBe(put.headers.get('etag'));
					expect(res.headers.get('Content-Type')).toMatch('application/json');
					
					if (State.version >= 2)
						expect(res.headers.get('Content-Length')).toBe(Buffer.from(JSON.stringify(item)).length);
					
					if (State.version >= 6)
						expect(res.headers.get('Cache-control')).toBe('no-cache');

					expect(await res.text()).toBe(JSON.stringify(item));
				});

			});

		});

	});

});

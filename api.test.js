import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'path';
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
					expect(res.status).toBeOneOf([200, 201]);
					expect(res.headers.get('etag')).toSatisfy(util.validEtag(State.version));
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
					expect(res.headers.get('etag')).toSatisfy(util.validEtag(State.version));
					expect(res.headers.get('etag')).toBe(put.headers.get('etag'));
					expect(res.headers.get('Content-Type')).toMatch('application/json');

					if (State.version >= 2)
						expect(res.headers.get('Content-Length')).toBe(Buffer.from(JSON.stringify(item)).length.toString());
					
					if (State.version >= 6)
						expect(res.headers.get('Cache-control')).toBe('no-cache');

					expect(await res.text()).toBe(JSON.stringify(item));
				});

			});

		});

		describe('list', () => {

			it.skip('handles empty', async () => {
				const res = await State.storage.get('/');
				expect(res.status).toBe(200);

				const body = await res.json();
				expect(res.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				expect(res.headers.get('Content-Type')).toMatch('application/ld+json');

				if (State.version >= 2)
					expect(body['@context']).toBe('http://remotestorage.io/spec/folder-description');

				expect(body.items).toEqual({});
			});

			it('handles file', async () => {
				const folder = util.tid() + '/';
				const file = util.tid();
				const item = util.document();
				const put = await State.storage.put(join(folder, file), item);
				
				const res = await State.storage.get(folder);
				const body = await res.json();
				const entries = Object.entries(State.version >= 2 ? body.items : body);
				expect(entries.length).toEqual(1);
				entries.forEach(([key, value]) => {
					expect(key).toBe(file);
					expect(State.version >= 2 ? value['ETag'] : value).toSatisfy(util.validName(State.version));

					if (State.version < 2)
						return;
					
					expect(value['Content-Length']).toBe(Buffer.from(JSON.stringify(item)).length);
					expect(value['Content-Type']).toBeTypeOf('string');
				});
			});

			it('handles folder', async () => {
				const folder = Math.random().toString() + '/';
				const file = Math.random().toString();
				const put = await State.storage.put(join(folder, folder, Math.random().toString()), {
					[Math.random().toString()]: Math.random().toString(),
				});
				
				const res = await State.storage.get(folder);
				const body = await res.json();
				const entries = Object.entries(State.version >= 2 ? body.items : body);
				expect(entries.length).toEqual(1);
				entries.forEach(([key, value]) => {
					expect(key).toBe(folder);
					expect(State.version >= 2 ? value.ETag : value).toSatisfy(util.validName(State.version));
				});
			});

		});

	});

});

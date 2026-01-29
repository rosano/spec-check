import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import util from './util.js'

process.env.SERVER_URL.split(',').forEach(server => {

	const State = {
		server,
		account: process.env.ACCOUNT,
		scope: process.env.TOKEN_SCOPE || 'api-test-suite',
		token_rw: process.env.TOKEN_READ_WRITE,
		token_global: process.env.TOKEN_GLOBAL,
	};

	beforeAll(async () => {
		State.webfinger = await util.webfinger(State.server, State.account);
		State.baseURL = State.webfinger.href;
		State.version = parseInt(State.webfinger.type.match(/draft-dejong-remotestorage-(\d+)/).pop());
		State.storage = util.storage(State);
	});

	describe(new URL(server).host, () => {

		describe('unauthorized', () => {

			const unauthorized = () => util.storage(Object.assign(util.clone(State), {
				token_rw: undefined,
			}));

			it('handles GET', async () => {
				const res = await unauthorized().get(util.tid());
				expect(res.status).toBe(401);
			});

			it('handles PUT', async () => {
				const res = await unauthorized().put(util.tid(), util.document());
				expect(res.status).toBe(401);
			});

			it('handles DELETE', async () => {
				const res = await unauthorized().delete(util.tid());
				expect(res.status).toBe(401);
			});

		});

		describe('create', () => {

			Object.entries({
				'without folder': util.tid(),
				'with folder': path.join(util.tid(), util.tid()),
			}).forEach(([key, path]) => {

				it(`handles ${ key }`, async () => {
					const put = await State.storage.put(path, util.document());
					expect(put.status).toBeOneOf([200, 201]);
					expect(put.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				});

				it.todo('changes parent etags', async () => {
					// const list1 = await State.storage.getRoot();

					// previous test put…
					
					// const list2 = await State.storage.getRoot();
					// expect(list2.headers.get('etag')).not.toBe(list1.headers.get('etag'));
				});

			});

		});

		describe('read', () => {

			Object.entries({
				'without folder': util.tid(),
				'with folder': path.join(util.tid(), util.tid()),
			}).forEach(([key, path]) => {

				it(`handles ${ key }`, async () => {
					const item = util.document();
					const put = await State.storage.put(path, item);
					const get = await State.storage.get(path);
					expect(get.status).toBe(200)
					expect(get.headers.get('etag')).toSatisfy(util.validEtag(State.version));
					expect(get.headers.get('etag')).toBe(put.headers.get('etag'));
					expect(get.headers.get('Content-Type')).toMatch('application/json');

					if (State.version >= 2)
						expect(get.headers.get('Content-Length')).toBe(Buffer.from(JSON.stringify(item)).length.toString());
					
					if (State.version >= 6)
						expect(get.headers.get('Cache-control')).toBe('no-cache');

					expect(await get.text()).toBe(JSON.stringify(item));
				});

			});

		});

		describe('list', () => {

			it.todo('handles empty', async () => {
				const list = await State.storage.get('/');
				expect(list.status).toBe(200);

				const body = await list.json();
				expect(list.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				expect(list.headers.get('Content-Type')).toMatch('application/ld+json');

				if (State.version >= 2)
					expect(body['@context']).toBe('http://remotestorage.io/spec/folder-description');

				expect(body.items).toEqual({});
			});

			it('handles file', async () => {
				const folder = util.tid() + '/';
				const file = util.tid();
				const item = util.document();
				const put = await State.storage.put(path.join(folder, file), item);
				
				const list = await State.storage.get(folder);
				const body = await list.json();
				const entries = Object.entries(State.version >= 2 ? body.items : body);
				expect(entries.length).toEqual(1);
				entries.forEach(([key, value]) => {
					expect(key).toBe(file);
					expect(State.version >= 2 ? value['ETag'] : `"${value}"`).toBe(put.headers.get('etag'));

					if (State.version < 2)
						return;
					
					expect(value['Content-Length']).toBe(Buffer.from(JSON.stringify(item)).length);
					expect(value['Content-Type']).toBeTypeOf('string');
				});
			});

			it('handles folder', async () => {
				const folder = util.tid() + '/';
				const file = util.tid();
				const put = await State.storage.put(path.join(folder, folder, util.tid()), util.document());
				
				const list = await State.storage.get(folder);
				const body = await list.json();
				const entries = Object.entries(State.version >= 2 ? body.items : body);
				expect(entries.length).toEqual(1);
				entries.forEach(([key, value]) => {
					expect(key).toBe(folder);
					expect(State.version >= 2 ? value['ETag'] : value).toSatisfy(util.validName(State.version));
				});
			});

		});

		describe('update', () => {

			Object.entries({
				'without folder': util.tid(),
				'with folder': path.join(util.tid(), util.tid()),
			}).forEach(([key, _path]) => {

				describe(key, () => {

					it('overwrites content', async () => {
						const put1 = await State.storage.put(_path, util.document());

						const item = util.document();
						const put2 = await State.storage.put(_path, item);
						expect(put2.status).toBeOneOf([200, 201]);
						expect(put2.headers.get('etag')).toSatisfy(util.validEtag(State.version));
						expect(put2.headers.get('etag')).not.toBe(put1.headers.get('etag'));
						
						const get = await State.storage.get(_path);
						expect(get.headers.get('etag')).toBe(put2.headers.get('etag'));
						
						if (State.version >= 2)
							expect(get.headers.get('Content-Length')).toBe(Buffer.from(JSON.stringify(item)).length.toString());

						expect(await get.json()).toEqual(item);
					});

					it('changes folder etags', async () => {
						const put1 = await State.storage.put(_path, util.document());

						const folder = path.dirname(_path) + '/';
						const list1 = await State.storage.get(folder);

						const put2 = await State.storage.put(_path, util.document());
						
						const list2 = await State.storage.get(folder);
						expect(list2.headers.get('etag')).not.toBe(list1.headers.get('etag'));

						const body = await list2.json();
						const entry = (State.version >= 2 ? body.items : body)[path.basename(_path)];
						expect(State.version >= 2 ? entry['ETag'] : `"${entry}"`).toBe(put2.headers.get('etag'));
					});

				});

			});

		});

	});

});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname, basename } from 'path';
import util from './util.js'

process.env.SERVER_URL.split(',').forEach(server => {

	const State = {
		server,
		account: process.env.ACCOUNT,
		scope: process.env.TOKEN_SCOPE || 'api-test-suite',
		token_rw: process.env.TOKEN_READ_WRITE,
		token_global: process.env.TOKEN_GLOBAL,
	};

	describe(new URL(server).host, () => {

		beforeAll(async () => {
			State.webfinger = await util.webfinger(State.server, State.account);
			State.baseURL = State.webfinger.href;
			State.version = parseInt(State.webfinger.type.match(/draft-dejong-remotestorage-(\d+)/).pop());
			State.storage = util.storage(State);
		});

		// afterAll(() => {
		// 	const erase = async path => {
		// 		const list = await State.storage.get(path);
		// 		const body = await list.json();
		// 		const entries = Object.entries(State.version >= 2 ? body.items : body);
		// 		return Promise.all(entries.map(([key, value]) => {
		// 			const path = path + key;
		// 			return path.endsWith('/') ? erase(path) : State.storage.delete(path);
		// 		}));
		// 	};
		// 	return erase('/');
		// });

		describe('OPTIONS', () => {

			['GET', 'PUT', 'DELETE'].forEach(method => {

				it(`handles ${ method }`, async () => {
					const origin = util.link();
					const res = await State.storage.options(Math.random().toString(), {
						'Access-Control-Request-Method': method,
						origin,
						referer: origin,
					});
					expect(res.status).toBeOneOf([200, 204]);
					expect(res.headers.get('Access-Control-Allow-Origin')).toMatch(new RegExp(`(\\*|${ origin.replaceAll(':', '\\:').replaceAll('/', '\\/').replaceAll('.', '\\.') })`));
					expect(res.headers.get('Access-Control-Expose-Headers').split(',').map(e => e.trim())).toContain('ETag');
					expect(res.headers.get('Access-Control-Allow-Methods').split(',').map(e => e.trim())).toContain(method);
					expect(await res.text()).toBe('');
					['Authorization', 'Content-Type', 'Origin', 'If-Match', 'If-None-Match'].forEach(header => {
						expect(res.headers.get('Access-Control-Allow-Headers').split(',').map(e => e.trim())).toContain(header);
					});
				});

			});
			
		});

		describe('unauthorized', () => {

			['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

				it(`handles ${ method }`, async () => {
					const res = await util.storage(Object.assign(util.clone(State), {
						token_rw: undefined,
					}))[method.toLowerCase()](util.tid(), method === 'PUT' ? util.document() : undefined);
					expect(res.status).toBe(401);
				});

			});

		});

		describe('create', () => {

			Object.entries({
				'without folder': util.tid(),
				'with folder': join(util.tid(), util.tid()),
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

			describe('If-None-Match header', () => {

				it('returns 412 if exists', async () => {
					const path = join(util.tid(), util.tid());
					await State.storage.put(path, util.document());
					const put = await State.storage.put(path, util.document(), {
						'If-None-Match': '*',
					});
					expect(put.status).toBe(412);
				});

				it('returns 200', async () => {
					const put = await State.storage.put(join(util.tid(), util.tid()), util.document(), {
						'If-None-Match': '*',
					});
					expect(put.status).toBeOneOf([200, 201]);
				});
				
			});

		});

		describe('read', () => {

			Object.entries({
				'without folder': util.tid(),
				'with folder': join(util.tid(), util.tid()),
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

			it('handles HEAD', async () => {
				const path = util.tid();
				const item = util.document();
				const put = await State.storage.put(path, item);
				const head = await State.storage.head(path);
				expect(head.status).toBeOneOf([200, 204])
				expect(head.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				expect(head.headers.get('etag')).toBe(put.headers.get('etag'));
				expect(head.headers.get('Content-Type')).toMatch('application/json');

				if (State.version >= 2)
					expect(head.headers.get('Content-Length')).toBe(Buffer.from(JSON.stringify(item)).length.toString());
				
				if (State.version >= 6)
					expect(head.headers.get('Cache-control')).toBe('no-cache');

				expect(await head.text()).toBe('');
			});

			describe('non-existing', () => {

				it('returns 404', async () => {
					const get = await State.storage.get(util.tid());
					expect(get.status).toBe(404)
				});
				
			});

			describe('If-None-Match header', () => {

				it('returns 304 if single tag matches', async () => {
					const path = join(util.tid(), util.tid());
					const put = await State.storage.put(path, util.document());
					const get = await State.storage.get(path, {
						'If-None-Match': put.headers.get('etag'),
					});
					expect(get.status).toBe(304);
					expect(await get.text()).toBe('');
				});

				it('returns 304 if one of multiple tags matches', async () => {
					const path = join(util.tid(), util.tid());
					const put = await State.storage.put(path, util.document());
					const get = await State.storage.get(path, {
						'If-None-Match': `${ Math.random().toString() },${ put.headers.get('etag') }`,
					});
					expect(get.status).toBe(304);
					expect(await get.text()).toBe('');
				});

				it('returns 304 if no matches', async () => {
					const path = join(util.tid(), util.tid());
					const put = await State.storage.put(path, util.document());
					const get = await State.storage.get(path, {
						'If-None-Match': `${ util.tid() },${ util.tid() }`,
					});
					expect(get.status).toBe(200);
				});
				
			});

		});

		describe('list', () => {

			it('handles non-existing', async () => {
				const list = await State.storage.get(`${ Math.random().toString() }/`);
				expect(list.status).toBe(404);
			});

			it('handles existing', async () => {
				await State.storage.put(util.tid(), util.document());
				
				const list = await State.storage.head('/');
				expect(list.status).toBe(200);

				expect(list.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				expect(list.headers.get('Content-Type')).toMatch('application/ld+json');
			});

			it('handles file', async () => {
				const folder = util.tid() + '/';
				const file = util.tid();
				const item = util.document();
				const put = await State.storage.put(join(folder, file), item);
				
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

			it('handles subfolder', async () => {
				const folder = util.tid() + '/';
				const file = util.tid();
				const put = await State.storage.put(join(folder, folder, util.tid()), util.document());
				
				const list = await State.storage.get(folder);
				const body = await list.json();
				const entries = Object.entries(State.version >= 2 ? body.items : body);
				expect(entries.length).toEqual(1);
				entries.forEach(([key, value]) => {
					expect(key).toBe(folder);
					expect(State.version >= 2 ? value['ETag'] : value).toSatisfy(util.validName(State.version));
				});
			});

			describe('If-None-Match header', () => {

				it('returns 304 if single tag matches', async () => {
					const put = await State.storage.put(util.tid(), util.document());
					const head = await State.storage.head('/');
					const get = await State.storage.get('/', {
						'If-None-Match': `${ Math.random().toString() },${ head.headers.get('etag') }`,
					});
					expect(get.status).toBe(304);
					expect(await get.text()).toBe('');
				});
				
			});

		});

		describe('update', () => {

			Object.entries({
				'without folder': util.tid(),
				'with folder': join(util.tid(), util.tid()),
			}).forEach(([key, path]) => {

				describe(key, () => {

					it('overwrites content', async () => {
						const put1 = await State.storage.put(path, util.document());

						const item = util.document();
						const put2 = await State.storage.put(path, item);
						expect(put2.status).toBeOneOf([200, 201]);
						expect(put2.headers.get('etag')).toSatisfy(util.validEtag(State.version));
						expect(put2.headers.get('etag')).not.toBe(put1.headers.get('etag'));
						
						const get = await State.storage.get(path);
						expect(get.headers.get('etag')).toBe(put2.headers.get('etag'));
						
						if (State.version >= 2)
							expect(get.headers.get('Content-Length')).toBe(Buffer.from(JSON.stringify(item)).length.toString());

						expect(await get.json()).toEqual(item);
					});

					it('changes folder etags', async () => {
						const put1 = await State.storage.put(path, util.document());

						const folder = dirname(path) + '/';
						const list1 = await State.storage.get(folder);

						const put2 = await State.storage.put(path, util.document());
						
						const list2 = await State.storage.get(folder);
						expect(list2.headers.get('etag')).not.toBe(list1.headers.get('etag'));

						const body = await list2.json();
						const entry = (State.version >= 2 ? body.items : body)[basename(path)];
						expect(State.version >= 2 ? entry['ETag'] : `"${entry}"`).toBe(put2.headers.get('etag'));
					});

				});

			});

			describe('If-Match header', () => {

				it('returns 412 if does not exist match', async () => {
					const put = await State.storage.put(util.tid(), util.document(), {
						'If-Match': Math.random().toString(),
					});
					expect(put.status).toBe(412);
				});

				it('returns 412 if no match', async () => {
					const path = join(util.tid(), util.tid());
					await State.storage.put(path, util.document());
					const put = await State.storage.put(path, util.document(), {
						'If-Match': Math.random().toString(),
					});
					expect(put.status).toBe(412);
				});

				it('updates the object', async () => {
					const path = join(util.tid(), util.tid());
					const put1 = await State.storage.put(path, util.document());
					const put2 = await State.storage.put(path, util.document(), {
						'If-Match': put1.headers.get('etag'),
					});
					expect(put2.status).toBeOneOf([200, 201]);
					expect(put2.headers.get('etag')).toSatisfy(util.validEtag(State.version));
					expect(put2.headers.get('etag')).not.toBe(put1.headers.get('etag'));
				});
				
			});

		});

		describe('delete', () => {

			describe('non-existing', () => {

				it('returns 404', async () => {
					const del = await State.storage.delete(util.tid());
					expect(del.status).toBe(404)
				});
				
			});

			Object.entries({
				'without folder': util.tid(),
				'with folder': join(util.tid(), util.tid()),
			}).forEach(([key, path]) => {

				describe(key, () => {

					it('removes', async () => {
						const put = await State.storage.put(path, util.document());

						const del = await State.storage.delete(path);
						expect(del.status).toBeOneOf([200, 204]);
						
						if (State.version >= 2)
							expect(del.headers.get('etag')).toBe(put.headers.get('etag'));

						const head = await State.storage.head(path);
						expect(head.status).toBe(404);
					});

					it('changes folder etags', async () => {
						const put = await State.storage.put(path, util.document());
						const put2 = await State.storage.put(path + util.tid(), util.document());

						const folder = dirname(path) + '/';
						const list1 = await State.storage.get(folder);

						await State.storage.delete(path);
						const list2 = await State.storage.get(folder);
						expect(list2.headers.get('etag')).not.toBe(list1.headers.get('etag'));
					});

					it.todo('changes parent folder etags', async () => {
						// continue from previous…
						// const parent = dirname(folder) + '/';
						// const list3 = parent === './' ? await State.storage.getRoot() : await State.storage.get();
						// const body = await list3.json();
						// const entry = (State.version >= 2 ? body.items : body)[folder];
						// expect(State.version >= 2 ? entry['ETag'] : `"${entry}"`).toBe(list2.headers.get('etag'));
					});

				});

			});

			describe('If-Match header', () => {

				it('returns 412 if does not match', async () => {
					const path = util.tid();
					await State.storage.put(path, util.document());

					const del = await State.storage.delete(path, {
						'If-Match': Math.random().toString(),
					});
					expect(del.status).toBe(412);

					const head = await State.storage.head(path);
					expect(head.status).toBe(200);
				});

				it('returns 412 if does not exist', async () => {
					const path = util.tid();

					const del = await State.storage.delete(path, {
						'If-Match': Math.random().toString(),
					});
					expect(del.status).toBe(412);
				});

				it('deletes object', async () => {
					const path = util.tid();
					const put = await State.storage.put(path, util.document());

					const del = await State.storage.delete(path, {
						'If-Match': put.headers.get('etag'),
					});
					expect(del.status).toBeOneOf([200, 204]);

					const head = await State.storage.head(path);
					expect(head.status).toBe(404);
				});
				
			});

		});

	});

});

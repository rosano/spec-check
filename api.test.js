import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname, basename } from 'path';
import util from './util.js'
import stub from './stub.js'
import fs from 'fs'

process.env.SERVER_URL.split(',').forEach(server => {

	const State = {
		server,
		account: process.env.ACCOUNT,
		scope: process.env.TOKEN_SCOPE || 'api-test-suite',
		token_read_write: process.env.TOKEN_READ_WRITE,
		token_read_only: process.env.TOKEN_READ_ONLY,
		token_global: process.env.TOKEN_GLOBAL,
	};

	const checkHeaders = ({res, item}) => {
		if (!State.version)
			throw new Error('State.version not set');

		if (State.version >= 2)
			expect(res.headers.get('Content-Length')).toBe(Buffer.from(JSON.stringify(item)).length.toString());

		if (State.version <= 5)
			expect(res.headers.get('Expires')).toBe('0');

		if (State.version >= 6)
			expect(res.headers.get('Cache-control')).toBe('no-cache');
		
		if (State.version >= 11) {
			expect(Date.parse(res.headers.get('Last-Modified')) / 10000).toBeCloseTo(Date.now() / 10000, 0);
			expect(res.headers.get('Last-Modified')).toSatisfy(util.validDate);
		}
	};

	const checkListHeaders = ({entry, item}) => {
		if (!State.version)
			throw new Error('State.version not set');

		if (!item)
			return;

		if (State.version >= 2 && item) {
			expect(entry['Content-Length']).toBe(Buffer.from(JSON.stringify(item)).length);
			expect(entry['Content-Type']).toBeTypeOf('string');
		}

		if (State.version >= 11) {
			expect(Date.parse(entry['Last-Modified']) / 10000).toBeCloseTo(Date.now() / 10000, 0);
			expect(entry['Last-Modified']).toSatisfy(util.validDate);
		}
	};

	describe(new URL(server).host, () => {

		beforeAll(async () => {
			State.webfinger = await util.webfinger.discover(State.server, State.account);
			State.baseURL = State.webfinger.href;
			State.version = parseInt((State.webfinger.type || State.webfinger.properties['http://remotestorage.io/spec/version']).match(/draft-dejong-remotestorage-(\d+)/).pop());
			State.storage = util.storage(Object.assign(util.clone(State), {
				token: State.token_read_write,
			}));
		});

		// afterAll(() => {
		// 	const erase = async (path, storage) => {
		// 		const list = await storage.get(path);
		// 		const body = await list.json();
		// 		const entries = Object.entries(State.version >= 2 ? body.items : body);
		// 		await Promise.all(entries.map(([key, value]) => {
		// 			const _path = path + key;
		// 			return _path.endsWith('/') ? erase(_path, storage) : storage.delete(_path);
		// 		}));
		// 	};

		// 	return erase('/', State.storage).then(() => erase('/', util.storage(Object.assign(util.clone(State), {
		// 			scope: `public/${ State.scope }`,
		// 			token: State.token_read_write,
		// 		}))));
		// });

		describe.only('OPTIONS', () => {

			['GET', 'PUT', 'DELETE'].forEach(method => {

				it(`handles ${ method }`, async () => {
					const origin = stub.origin();
					const res = await State.storage.options(stub.tid(), {
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

		describe('empty token', () => {

			['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

				it(`rejects ${ method }`, async () => {
					const res = await util.storage(Object.assign(util.clone(State), {
						token: undefined,
					}))[method.toLowerCase()](stub.tid(), method === 'PUT' ? stub.document() : undefined);
					expect(res.status).toBe(401);
				});

			});

		});

		describe('other user', () => {

			['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

				it(`rejects ${ method }`, async () => {
					const res = await util.storage(Object.assign(util.clone(State), {
						baseURL: State.baseURL.replace(/\/me$/, `/${ Date.now().toString(36) }`),
						token: State.token_global,
					}))[method.toLowerCase()](stub.tid(), method === 'PUT' ? stub.document() : undefined);
					expect(res.status).toBeOneOf([401, 403]);
				});

			});

		});

		describe('read-only token', () => {

			['HEAD', 'GET'].forEach(method => {

				it(`accepts ${ method }`, async () => {
					const path = stub.tid();
					const item = stub.document();
					const put = await State.storage.put(path, item);

					const res = await util.storage(Object.assign(util.clone(State), {
						token: State.token_read_only,
					}))[method.toLowerCase()](path);
					expect(res.status).toBeOneOf([200, 204]);

					expect(await res.text()).toBe(method === 'HEAD' ? '' : JSON.stringify(item));
				});

			});

			['PUT', 'DELETE'].forEach(method => {

				it(`rejects ${ method }`, async () => {
					const path = stub.tid();
					const put = await State.storage.put(path, stub.document());

					const res = await util.storage(Object.assign(util.clone(State), {
						token: State.token_read_only,
					}))[method.toLowerCase()](path, method === 'PUT' ? stub.document() : undefined);
					expect(res.status).toBeOneOf([401, 403]);
				});

			});

		});

		describe('create', () => {

			Object.entries({
				'without folder': stub.tid(),
				'with folder': join(stub.tid(), stub.tid()),
			}).forEach(([key, path]) => {

				it(`handles ${ key }`, async () => {
					const put = await State.storage.put(path, stub.document());
					expect(put.status).toBeOneOf([200, 201]);
					expect(put.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				});

				it('changes parent etags', async () => {
					const list1 = await State.storage.get('/');

					const put = await State.storage.put(path, stub.document());
					
					const list2 = await State.storage.get('/');
					expect(list2.headers.get('etag')).not.toBe(list1.headers.get('etag'));
				});

			});

			describe('If-None-Match header', () => {

				it('returns 412 if exists', async () => {
					const path = join(stub.tid(), stub.tid());
					await State.storage.put(path, stub.document());
					const put = await State.storage.put(path, stub.document(), {
						'If-None-Match': '*',
					});
					expect(put.status).toBe(412);
				});

				it('returns 200', async () => {
					const put = await State.storage.put(join(stub.tid(), stub.tid()), stub.document(), {
						'If-None-Match': '*',
					});
					expect(put.status).toBeOneOf([200, 201]);
				});
				
			});

			describe('target file path is an existing folder', () => {

				it('returns 409', async () => {
					const folder = stub.tid();
					await State.storage.put(join(folder, stub.tid()), stub.document());
					const put = await State.storage.put(folder, stub.document());
					expect(put.status).toBe(State.version >= 2 ? 409 : 200);
				});
				
			});

			describe('folder in path is existing file', () => {

				it('returns 409', async () => {
					const folder = stub.tid();
					await State.storage.put(folder, stub.document());
					const put = await State.storage.put(join(folder, stub.tid()), stub.document());
					expect(put.status).toBe(State.version >= 2 ? 409 : 200);
				});
				
			});

			describe('Content-Range header', () => {

				// https://tools.ietf.org/html/rfc7231#section-4.3.4

				it('returns 400', async () => {
					const put = await State.storage.put(join(stub.tid(), stub.tid()), Math.random().toString(), {
						'Content-Range': 'bytes 0-3/3',
						'Content-Type': 'text/plain',
					});
					expect(put.status).toBe(State.version >= 2 ? 400 : 200);
				});
				
			});

			describe('binary file', () => {

				it('returns 200', async () => {
					const path = 'image.jpg';
					const put = await State.storage.put(path, fs.readFileSync(path), {
						'Content-Type': 'image/jpeg; charset=binary',
					});
					expect(put.status).toBeOneOf([200, 201]);
					expect(put.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				});
				
			});

		});

		describe('read', () => {

			Object.entries({
				'without folder': stub.tid(),
				'with folder': join(stub.tid(), stub.tid()),
			}).forEach(([key, path]) => {

				it(`handles ${ key }`, async () => {
					const item = stub.document();
					const put = await State.storage.put(path, item);
					const get = await State.storage.get(path);
					expect(get.status).toBe(200)
					expect(get.headers.get('etag')).toBe(put.headers.get('etag'));
					expect(get.headers.get('Content-Type')).toMatch('application/json');

					checkHeaders({
						res: get,
						item,
					});

					expect(await get.text()).toBe(JSON.stringify(item));
				});

			});

			it('handles HEAD', async () => {
				const path = stub.tid();
				const item = stub.document();
				const put = await State.storage.put(path, item);
				const head = await State.storage.head(path);
				expect(head.status).toBeOneOf([200, 204])
				expect(head.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				expect(head.headers.get('etag')).toBe(put.headers.get('etag'));
				expect(head.headers.get('Content-Type')).toMatch('application/json');

				checkHeaders({
					res: head,
					item,
				});

				expect(await head.text()).toBe('');
			});

			describe('non-existing', () => {

				it('returns 404', async () => {
					const get = await State.storage.get(stub.tid());
					expect(get.status).toBe(404)
				});
				
			});

			describe('If-None-Match header', () => {

				it('returns 304 if single tag matches', async () => {
					const path = join(stub.tid(), stub.tid());
					const put = await State.storage.put(path, stub.document());
					const get = await State.storage.get(path, {
						'If-None-Match': put.headers.get('etag'),
					});
					expect(get.status).toBe(304);
					expect(await get.text()).toBe('');
				});

				it('returns 304 if one of multiple tags matches', async () => {
					const path = join(stub.tid(), stub.tid());
					const put = await State.storage.put(path, stub.document());
					const get = await State.storage.get(path, {
						'If-None-Match': `${ Math.random().toString() },${ put.headers.get('etag') }`,
					});
					expect(get.status).toBe(304);
					expect(await get.text()).toBe('');
				});

				it('returns 304 if no matches', async () => {
					const path = join(stub.tid(), stub.tid());
					const put = await State.storage.put(path, stub.document());
					const get = await State.storage.get(path, {
						'If-None-Match': `${ stub.tid() },${ stub.tid() }`,
					});
					expect(get.status).toBe(200);
				});
				
			});

			describe('binary file', () => {

				it('returns 200', async () => {
					const path = 'image.jpg';
					const data = fs.readFileSync(path);
					const put = await State.storage.put(path, data, {
						'Content-Type': 'image/jpeg; charset=binary',
					});
					const get = await State.storage.get(path);
					expect(get.status).toBeOneOf([200, 201]);
					expect(get.headers.get('etag')).toSatisfy(util.validEtag(State.version));
					expect(get.headers.get('Content-Type')).toBeOneOf(['image/jpeg', 'image/jpeg; charset=binary']);
					expect(get.headers.get('Content-Length')).toBe(data.length.toString());
				});
				
			});

		});

		describe('list', () => {

			it('handles non-existing', async () => {
				const list = await State.storage.get(`${ Math.random().toString() }/`);
				expect(list.status).toBeOneOf([404, 200]);

				if (list.status === 200)
					expect(await list.json()).toBeOneOf([{}, stub.listing()]);
			});

			it('handles existing', async () => {
				await State.storage.put(stub.tid(), stub.document());
				
				const list = await State.storage.head('/');
				expect(list.status).toBe(200);

				expect(list.headers.get('etag')).toSatisfy(util.validEtag(State.version));
				expect(list.headers.get('Content-Type')).toMatch('application/ld+json');
			});

			it('handles folder', async () => {
				const folder = `${ stub.tid() }/`;
				const file = stub.tid();
				const item = stub.document();
				const put = await State.storage.put(join(folder, file), item);
				
				const list = await State.storage.get(folder);
				const body = await list.json();
				const entries = Object.entries(State.version >= 2 ? body.items : body);
				expect(entries.length).toEqual(1);
				entries.forEach(([key, entry]) => {
					expect(key).toBe(file);
					expect(State.version >= 2 ? entry['ETag'] : `"${entry}"`).toBe(put.headers.get('etag'));

					checkListHeaders({
						entry,
						item,
					});
				});
			});

			it('handles subfolder', async () => {
				const folder = `${ stub.tid() }/`;
				const file = stub.tid();
				const item = stub.document();
				const put = await State.storage.put(join(folder, folder, stub.tid()), item);
				
				const list = await State.storage.get(folder);
				const body = await list.json();
				const entries = Object.entries(State.version >= 2 ? body.items : body);
				expect(entries.length).toEqual(1);
				entries.forEach(([key, entry]) => {
					expect(key).toBe(folder);
					expect(State.version >= 2 ? entry['ETag'] : entry).toSatisfy(util.validName(State.version));

					checkListHeaders({
						entry,
					});
				});
			});

			describe('If-None-Match header', () => {

				it('returns 304 if single tag matches', async () => {
					const put = await State.storage.put(stub.tid(), stub.document());
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
				'without folder': stub.tid(),
				'with folder': join(stub.tid(), stub.tid()),
			}).forEach(([key, path]) => {

				describe(key, () => {

					it('overwrites content', async () => {
						const put1 = await State.storage.put(path, stub.document());

						const item = stub.document();
						const put2 = await State.storage.put(path, item);
						expect(put2.status).toBeOneOf([200, 201]);
						expect(put2.headers.get('etag')).toSatisfy(util.validEtag(State.version));
						expect(put2.headers.get('etag')).not.toBe(put1.headers.get('etag'));
						
						const get = await State.storage.get(path);
						expect(get.headers.get('etag')).toBe(put2.headers.get('etag'));
						
						checkHeaders({
							res: get,
							item,
						});

						expect(await get.json()).toEqual(item);
					});

					it('changes ancestor etags', async () => {
						await State.storage.put(path, stub.document());

						const folder = `${ dirname(path) }/`;
						const list1 = await State.storage.get(folder);

						const put = await State.storage.put(path, stub.document());
						
						const list2 = await State.storage.get(folder);
						expect(list2.headers.get('etag')).not.toBe(list1.headers.get('etag'));

						const body = await list2.json();
						const entry = (State.version >= 2 ? body.items : body)[basename(path)];
						expect(State.version >= 2 ? entry['ETag'] : `"${entry}"`).toBe(put.headers.get('etag'));
					});

				});

			});

			describe('If-Match header', () => {

				it('returns 412 if does not exist match', async () => {
					const put = await State.storage.put(stub.tid(), stub.document(), {
						'If-Match': Math.random().toString(),
					});
					expect(put.status).toBe(412);
				});

				it('returns 412 if no match', async () => {
					const path = join(stub.tid(), stub.tid());
					await State.storage.put(path, stub.document());
					const put = await State.storage.put(path, stub.document(), {
						'If-Match': Math.random().toString(),
					});
					expect(put.status).toBe(412);
				});

				it('updates the object', async () => {
					const path = join(stub.tid(), stub.tid());
					const put1 = await State.storage.put(path, stub.document());
					const put2 = await State.storage.put(path, stub.document(), {
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
					const del = await State.storage.delete(stub.tid());
					expect(del.status).toBe(404)
				});
				
			});

			Object.entries({
				'without folder': stub.tid(),
				'with folder': join(stub.tid(), stub.tid()),
			}).forEach(([key, path]) => {

				describe(key, () => {

					it('removes', async () => {
						const put = await State.storage.put(path, stub.document());

						const del = await State.storage.delete(path);
						expect(del.status).toBeOneOf([200, 204]);
						
						if (State.version >= 2)
							expect(del.headers.get('etag')).toBe(put.headers.get('etag'));

						const head = await State.storage.head(path);
						expect(head.status).toBe(404);
					});

					it('changes ancestor etags', async () => {
						const put = await State.storage.put(path, stub.document());

						const folder = `${ dirname(path) }/`;
						const listA1 = await State.storage.get(folder);
						const listB1 = await State.storage.get('/');

						await State.storage.delete(path);
						
						const listA2 = await State.storage.get(folder);
						expect(listA2.headers.get('etag')).not.toBe(listA1.headers.get('etag'));
						
						const listB2 = await State.storage.get('/');
						expect(listB2.headers.get('etag')).not.toBe(listB1.headers.get('etag'));
					});

				});

			});

			describe('If-Match header', () => {

				it('returns 412 if does not match', async () => {
					const path = stub.tid();
					await State.storage.put(path, stub.document());

					const del = await State.storage.delete(path, {
						'If-Match': Math.random().toString(),
					});
					expect(del.status).toBe(412);

					const head = await State.storage.head(path);
					expect(head.status).toBe(200);
				});

				it('returns 412 if does not exist', async () => {
					const path = stub.tid();

					const del = await State.storage.delete(path, {
						'If-Match': Math.random().toString(),
					});
					expect(del.status).toBe(412);
				});

				it('deletes object', async () => {
					const path = stub.tid();
					const put = await State.storage.put(path, stub.document());

					const del = await State.storage.delete(path, {
						'If-Match': put.headers.get('etag'),
					});
					expect(del.status).toBeOneOf([200, 204]);

					const head = await State.storage.head(path);
					expect(head.status).toBe(404);
				});
				
			});

		});

		describe('root folder', () => {

			describe('scope token', () => {

				['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

					it(`rejects ${ method }`, async () => {
						const path = ['PUT', 'DELETE'].includes(method) ? stub.tid() : '/';
						const res = await util.storage(Object.assign(util.clone(State), {
							token: State.token_read_write,
							scope: '/',
						}))[method.toLowerCase()](path, method === 'PUT' ? stub.document() : undefined);
						expect(res.status).toBeOneOf([401, 403]);
					});

				});

			});

			describe('root token', () => {

				it.todo('lists HEAD', async () => {
					const storage = util.storage(Object.assign(util.clone(State), {
						token: State.token_global,
						scope: '/',
					}));
					
					const list = await storage.head('/');
					expect(list.status).toBeOneOf([200, 204]);
					expect(list.headers.get('etag')).toSatisfy(util.validEtag(State.version));
					expect(list.headers.get('Content-Type')).toMatch('application/ld+json');
					expect(await list.text()).toMatch('');
				});

				['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

					it.todo(`accepts ${ method }`, async () => {
						const path = ['PUT', 'DELETE'].includes(method) ? stub.tid() : '/';

						if (method === 'DELETE') {
							const get = await storage.put(path, stub.document());
							expect(get.status).toBe(200);
						};

						const res = await storage[method.toLowerCase()](path, method === 'PUT' ? stub.document() : undefined);
						expect(res.status).toBeOneOf({
							HEAD: [200, 204],
							GET: [200],
							PUT: [200, 201],
							DELETE: [200],
						}[method]);

						if (method === 'PUT') {
							const get = await storage.get(path);
							expect(get.status).toBe(200);
						};
					})

				});

			});

		});

		describe('public folder', () => {

			describe('with no token', () => {

				['HEAD', 'GET'].forEach(method => {

					it(`accepts ${ method } file`, async () => {
						const path = stub.tid();
						const item = stub.document();
						const put = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						})).put(path, item);

						const res = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: undefined,
						}))[method.toLowerCase()](path);
						expect(res.status).toBeOneOf(method === 'HEAD' ? [200, 204] : [200]);

						checkHeaders({
							res,
							item,
						});

						expect(await res.text()).toBe(method === 'HEAD' ? '' : JSON.stringify(item));
					});

					it(`rejects ${ method } list`, async () => {
						const folder = `${ stub.tid() }/`;
						const file = stub.tid();
						
						const put = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						})).put(join(folder, file), stub.document());

						const list1 = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: undefined,
						}))[method.toLowerCase()](folder);
						expect(list1.status).toBeOneOf([401, 403]);

						const list2 = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: undefined,
						}))[method.toLowerCase()]('/');
						expect(list2.status).toBe(list1.status);
						expect(list2.headers).toMatchObject(list1.headers);
						expect(await list2.text()).toBe(await list1.text());
					});

				});

				['PUT', 'DELETE'].forEach(method => {

					it(`rejects ${ method }`, async () => {
						const path = stub.tid();
						const item = stub.document();
						const put = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						})).put(path, item);
						
						const res = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: undefined,
						}))[method.toLowerCase()](path, method === 'PUT' ? stub.document() : undefined);
						expect(res.status).toBeOneOf([401, 403]);
					});

				});

			});

			describe('with token', () => {

				['HEAD', 'GET'].forEach(method => {

					it(`accepts ${ method } list`, async () => {
						const folder = `${ stub.tid() }/`;
						const file = stub.tid();
						
						const put = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						})).put(join(folder, file), stub.document());

						const list1 = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						}))[method.toLowerCase()](folder);
						expect(list1.status).toBe(200);

						const list2 = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						}))[method.toLowerCase()]('/');
						expect(list2.status).toBe(list1.status);
					});

				});

				['PUT', 'DELETE'].forEach(method => {

					it(`accepts ${ method }`, async () => {
						const path = stub.tid();
						const item = stub.document();
						const put = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						})).put(path, item);

						if (method === 'PUT')
							return expect(put.status).toBeOneOf([200, 201]);
						
						const del = await util.storage(Object.assign(util.clone(State), {
							scope: `public/${ State.scope }`,
							token: State.token_read_write,
						})).delete(path, method === 'PUT' ? stub.document() : undefined);
						expect(del.status).toBeOneOf([200, 204]);
					});

				});

				describe.todo('wrong scope', () => {

					['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

						it(`rejects ${ method }`, async () => {
							const res = await util.storage(Object.assign(util.clone(State), {
								scope: `public/${ Math.random().toString(36) }`,
								token: State.token_read_write,
							}))[method.toLowerCase()](stub.tid(), method === 'PUT' ? stub.document() : undefined);
							expect(res.status).toBeOneOf([401, 403]);
						});

					});

				});

			});
			
		});

	});

});

import { expect } from 'chai';
import { join, dirname, basename } from 'path';
import util from './util.js'
import stub from './stub.js'
import { readFile } from 'node:fs/promises';

const State = {};

const populate = () => Object.assign(State, {
	server: process.env.SERVER_URL,
	account_handle: process.env.ACCOUNT_HANDLE,
	scope: process.env.TOKEN_SCOPE || 'api-test-suite',
	token_read_write: process.env.TOKEN_READ_WRITE,
	token_read_only: process.env.TOKEN_READ_ONLY,
	token_global: process.env.TOKEN_GLOBAL,
	spec_version: process.env.SPEC_VERSION,
});

populate();

const checkHeaders = ({res, item}) => {
	if (!State.spec_version)
		throw new Error('State.spec_version not set');

	if (State.spec_version >= 2)
		expect(res.headers.get('Content-Length')).to.equal(util.byteLength(JSON.stringify(item)).toString());

	if (State.spec_version <= 5)
		expect(res.headers.get('Expires')).to.equal('0');

	if (State.spec_version >= 6)
		expect(res.headers.get('Cache-control')).to.equal('no-cache');
	
	if (State.spec_version >= 11) {
		expect(Date.parse(res.headers.get('Last-Modified'))).to.be.closeTo(Date.now(), 10000);
		expect(res.headers.get('Last-Modified')).to.satisfy(util.validDate);
	}
};

const checkListHeaders = ({entry, item}) => {
	if (!State.spec_version)
		throw new Error('State.spec_version not set');

	if (!item)
		return;

	if (State.spec_version >= 2 && item) {
		expect(entry['Content-Length']).to.equal(util.byteLength(JSON.stringify(item)));
		expect(entry['Content-Type']).to.be.a('string');
	}

	if (State.spec_version >= 11) {
		expect(Date.parse(entry['Last-Modified'])).to.be.closeTo(Date.now(), 10000);
		expect(entry['Last-Modified']).to.satisfy(util.validDate);
	}
};

before(async () => {
	if (typeof window !== 'undefined')
		populate();

	State.webfinger = await util.webfinger.discover(State.server, State.account_handle);
	State.baseURL = State.webfinger.href;
	State.storage = util.storage(Object.assign(util.clone(State), {
		token: State.token_read_write,
	}));

	if (!State.spec_version)
		State.spec_version = util.webfinger.version(State.webfinger);
});

after(() => {
	const erase = async (path, storage) => {
		const list = await storage.get(path);
		const body = await list.json();
		const entries = Object.entries(State.spec_version >= 2 ? body.items : body);
		await Promise.all(entries.map(([key, value]) => {
			const _path = path + key;
			return _path.endsWith('/') ? erase(_path, storage) : storage.delete(_path);
		}));
	};

	return erase('/', State.storage).then(() => erase('/', util.storage(Object.assign(util.clone(State), {
			scope: `public/${ State.scope }`,
			token: State.token_read_write,
		}))));
});

describe('OPTIONS', () => {

	['GET', 'PUT', 'DELETE'].forEach(method => {

		it(`handles ${ method }`, async () => {
			const origin = stub.origin();
			const res = await State.storage.options(stub.tid(), {
				'Access-Control-Request-Method': method,
				origin,
				referer: origin,
			});
			expect(res.status).to.be.oneOf([200, 204]);
			expect(res.headers.get('Access-Control-Allow-Origin')).to.match(new RegExp(`(\\*|${ origin.replaceAll(':', '\\:').replaceAll('/', '\\/').replaceAll('.', '\\.') })`));
			expect(res.headers.get('Access-Control-Expose-Headers').split(',').map(e => e.trim())).to.include('ETag');
			expect(res.headers.get('Access-Control-Allow-Methods').split(',').map(e => e.trim())).to.include(method);
			expect(await res.text()).to.equal('');
			['Authorization', 'Content-Type', 'Origin', 'If-Match', 'If-None-Match'].forEach(header => {
				expect(res.headers.get('Access-Control-Allow-Headers').split(',').map(e => e.trim())).to.include(header);
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
			expect(res.status).to.equal(401);
		});

	});

});

describe('other user', () => {

	['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

		it(`rejects ${ method }`, async () => {
			const handle = Math.random().toString(36).slice(2);
			const res = await util.storage(Object.assign(util.clone(State), {
				baseURL: State.baseURL.replace(new RegExp(`\\/${ process.env.ACCOUNT_HANDLE }$`), `/${ handle }`),
				token: State.token_global,
			}))[method.toLowerCase()](stub.tid(), method === 'PUT' ? stub.document() : undefined);
			expect(res.status).to.be.oneOf([401, 403]);
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

			expect(res.status).to.be.oneOf([200, 204]);

			expect(await res.text()).to.equal(method === 'HEAD' ? '' : JSON.stringify(item));
		});

	});

	['PUT', 'DELETE'].forEach(method => {

		it(`rejects ${ method }`, async () => {
			const path = stub.tid();
			const put = await State.storage.put(path, stub.document());

			const res = await util.storage(Object.assign(util.clone(State), {
				token: State.token_read_only,
			}))[method.toLowerCase()](path, method === 'PUT' ? stub.document() : undefined);
			expect(res.status).to.be.oneOf([401, 403]);
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
			expect(put.status).to.be.oneOf([200, 201]);
			expect(put.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
		});

		it('changes parent etags', async () => {
			const list1 = await State.storage.get('/');

			const put = await State.storage.put(path, stub.document());
			
			const list2 = await State.storage.get('/');
			expect(list2.headers.get('etag')).not.to.equal(list1.headers.get('etag'));
		});

	});

	describe('If-None-Match header', () => {

		it('returns 412 if exists', async () => {
			const path = join(stub.tid(), stub.tid());
			await State.storage.put(path, stub.document());
			const put = await State.storage.put(path, stub.document(), {
				'If-None-Match': '*',
			});
			expect(put.status).to.equal(412);
		});

		it('returns 200', async () => {
			const put = await State.storage.put(join(stub.tid(), stub.tid()), stub.document(), {
				'If-None-Match': '*',
			});
			expect(put.status).to.be.oneOf([200, 201]);
		});
		
	});

	describe('target file path is an existing folder', () => {

		it('returns 409', async () => {
			const folder = stub.tid();
			await State.storage.put(join(folder, stub.tid()), stub.document());
			const put = await State.storage.put(folder, stub.document());
			expect(put.status).to.equal(State.spec_version >= 2 ? 409 : 200);
		});
		
	});

	describe('folder in path is existing file', () => {

		it('returns 409', async () => {
			const folder = stub.tid();
			await State.storage.put(folder, stub.document());
			const put = await State.storage.put(join(folder, stub.tid()), stub.document());
			expect(put.status).to.equal(State.spec_version >= 2 ? 409 : 200);
		});
		
	});

	describe('Content-Range header', () => {

		// https://tools.ietf.org/html/rfc7231#section-4.3.4

		it('returns 400', async () => {
			const put = await State.storage.put(join(stub.tid(), stub.tid()), Math.random().toString(), {
				'Content-Range': 'bytes 0-3/3',
				'Content-Type': 'text/plain',
			});
			expect(put.status).to.equal(State.spec_version >= 2 ? 400 : 200);
		});
		
	});

	describe('binary file', () => {

		it('returns 200', async () => {
			const path = 'image.jpg';
			const put = await State.storage.put(path, await readFile(path), {
				'Content-Type': 'image/jpeg; charset=binary',
			});
			expect(put.status).to.be.oneOf([200, 201]);
			expect(put.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
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
			expect(get.status).to.equal(200)
			expect(get.headers.get('etag')).to.equal(put.headers.get('etag'));
			expect(get.headers.get('Content-Type')).to.have.string('application/json');

			checkHeaders({
				res: get,
				item,
			});

			expect(await get.text()).to.equal(JSON.stringify(item));
		});

	});

	it('handles HEAD', async () => {
		const path = stub.tid();
		const item = stub.document();
		const put = await State.storage.put(path, item);
		const head = await State.storage.head(path);
		expect(head.status).to.be.oneOf([200, 204])
		expect(head.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
		expect(head.headers.get('etag')).to.equal(put.headers.get('etag'));
		expect(head.headers.get('Content-Type')).to.have.string('application/json');

		checkHeaders({
			res: head,
			item,
		});

		expect(await head.text()).to.equal('');
	});

	describe('non-existing', () => {

		it('returns 404', async () => {
			const get = await State.storage.get(stub.tid());
			expect(get.status).to.equal(404)
		});
		
	});

	describe('If-None-Match header', () => {

		it('returns 304 if single tag matches', async () => {
			const path = join(stub.tid(), stub.tid());
			const put = await State.storage.put(path, stub.document());
			const get = await State.storage.get(path, {
				'If-None-Match': put.headers.get('etag'),
			});
			expect(get.status).to.equal(304);
			expect(await get.text()).to.equal('');
		});

		it('returns 304 if one of multiple tags matches', async () => {
			const path = join(stub.tid(), stub.tid());
			const put = await State.storage.put(path, stub.document());
			const get = await State.storage.get(path, {
				'If-None-Match': `${ Math.random().toString() },${ put.headers.get('etag') }`,
			});
			expect(get.status).to.equal(304);
			expect(await get.text()).to.equal('');
		});

		it('returns 304 if no matches', async () => {
			const path = join(stub.tid(), stub.tid());
			const put = await State.storage.put(path, stub.document());
			const get = await State.storage.get(path, {
				'If-None-Match': `${ stub.tid() },${ stub.tid() }`,
			});
			expect(get.status).to.equal(200);
		});
		
	});

	describe('binary file', () => {

		it('returns 200', async () => {
			const path = 'image.jpg';
			const data = await readFile(path);
			const put = await State.storage.put(path, data, {
				'Content-Type': 'image/jpeg; charset=binary',
			});
			const get = await State.storage.get(path);
			expect(get.status).to.be.oneOf([200, 201]);
			expect(get.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
			expect(get.headers.get('Content-Type')).to.be.oneOf(['image/jpeg', 'image/jpeg; charset=binary']);
			expect(get.headers.get('Content-Length')).to.equal(data.length.toString());
		});
		
	});

});

describe('list', () => {

	it('handles non-existing', async () => {
		const list = await State.storage.get(`${ Math.random().toString() }/`);
		expect(list.status).to.be.oneOf([404, 200]);

		if (list.status === 200)
			expect(JSON.stringify(await list.json())).to.be.oneOf([{}, stub.listing()].map(JSON.stringify));
	});

	it('handles existing', async () => {
		await State.storage.put(stub.tid(), stub.document());
		
		const list = await State.storage.head('/');
		expect(list.status).to.equal(200);

		expect(list.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
		expect(list.headers.get('Content-Type')).to.have.string('application/ld+json');
	});

	it('handles folder', async () => {
		const folder = `${ stub.tid() }/`;
		const file = stub.tid();
		const item = stub.document();
		const put = await State.storage.put(join(folder, file), item);
		
		const list = await State.storage.get(folder);
		const body = await list.json();
		const entries = Object.entries(State.spec_version >= 2 ? body.items : body);
		expect(entries.length).to.equal(1);
		entries.forEach(([key, entry]) => {
			expect(key).to.equal(file);
			expect(`"${ State.spec_version >= 2 ? entry['ETag'] : entry }"`).to.equal(put.headers.get('etag'));

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
		const entries = Object.entries(State.spec_version >= 2 ? body.items : body);
		expect(entries.length).to.equal(1);
		entries.forEach(([key, entry]) => {
			expect(key).to.equal(folder);
			expect(State.spec_version >= 2 ? entry['ETag'] : entry).to.satisfy(util.validName(State.spec_version));

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
			expect(get.status).to.equal(304);
			expect(await get.text()).to.equal('');
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
				expect(put2.status).to.be.oneOf([200, 201]);
				expect(put2.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
				expect(put2.headers.get('etag')).not.to.equal(put1.headers.get('etag'));
				
				const get = await State.storage.get(path);
				expect(get.headers.get('etag')).to.equal(put2.headers.get('etag'));
				
				checkHeaders({
					res: get,
					item,
				});

				expect(await get.json()).to.deep.equal(item);
			});

			it('changes ancestor etags', async () => {
				await State.storage.put(path, stub.document());

				const folder = `${ dirname(path) }/`;
				const list1 = await State.storage.get(folder);

				const put = await State.storage.put(path, stub.document());
				
				const list2 = await State.storage.get(folder);
				expect(list2.headers.get('etag')).not.to.equal(list1.headers.get('etag'));

				const body = await list2.json();
				const entry = (State.spec_version >= 2 ? body.items : body)[basename(path)];
				expect(`"${ State.spec_version >= 2 ? entry['ETag'] : entry }"`).to.equal(put.headers.get('etag'));
			});

		});

	});

	describe('If-Match header', () => {

		it('returns 412 if does not exist match', async () => {
			const put = await State.storage.put(stub.tid(), stub.document(), {
				'If-Match': Math.random().toString(),
			});
			expect(put.status).to.equal(412);
		});

		it('returns 412 if no match', async () => {
			const path = join(stub.tid(), stub.tid());
			await State.storage.put(path, stub.document());
			const put = await State.storage.put(path, stub.document(), {
				'If-Match': Math.random().toString(),
			});
			expect(put.status).to.equal(412);
		});

		it('updates the object', async () => {
			const path = join(stub.tid(), stub.tid());
			const put1 = await State.storage.put(path, stub.document());
			const put2 = await State.storage.put(path, stub.document(), {
				'If-Match': put1.headers.get('etag'),
			});
			expect(put2.status).to.be.oneOf([200, 201]);
			expect(put2.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
			expect(put2.headers.get('etag')).not.to.equal(put1.headers.get('etag'));
		});
		
	});

});

describe('delete', () => {

	describe('non-existing', () => {

		it('returns 404', async () => {
			const del = await State.storage.delete(stub.tid());
			expect(del.status).to.equal(404)
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
				expect(del.status).to.be.oneOf([200, 204]);
				
				if (State.spec_version >= 2)
					expect(del.headers.get('etag')).to.equal(put.headers.get('etag'));

				const head = await State.storage.head(path);
				expect(head.status).to.equal(404);
			});

			it('changes ancestor etags', async () => {
				const put = await State.storage.put(path, stub.document());

				const folder = `${ dirname(path) }/`;
				const listA1 = await State.storage.get(folder);
				const listB1 = await State.storage.get('/');

				await State.storage.delete(path);
				
				const listA2 = await State.storage.get(folder);
				expect(listA2.headers.get('etag')).not.to.equal(listA1.headers.get('etag'));
				
				const listB2 = await State.storage.get('/');
				expect(listB2.headers.get('etag')).not.to.equal(listB1.headers.get('etag'));
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
			expect(del.status).to.equal(412);

			const head = await State.storage.head(path);
			expect(head.status).to.equal(200);
		});

		it('returns 412 if does not exist', async () => {
			const path = stub.tid();

			const del = await State.storage.delete(path, {
				'If-Match': Math.random().toString(),
			});
			expect(del.status).to.equal(412);
		});

		it('deletes object', async () => {
			const path = stub.tid();
			const put = await State.storage.put(path, stub.document());

			const del = await State.storage.delete(path, {
				'If-Match': put.headers.get('etag'),
			});
			expect(del.status).to.be.oneOf([200, 204]);

			const head = await State.storage.head(path);
			expect(head.status).to.equal(404);
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
				expect(res.status).to.be.oneOf([401, 403]);
			});

		});

	});

	describe('root token', () => {

		it.skip('lists HEAD', async () => {
			const storage = util.storage(Object.assign(util.clone(State), {
				token: State.token_global,
				scope: '/',
			}));
			
			const list = await storage.head('/');
			expect(list.status).to.be.oneOf([200, 204]);
			expect(list.headers.get('etag')).to.satisfy(util.validEtag(State.spec_version));
			expect(list.headers.get('Content-Type')).to.have.string('application/ld+json');
			expect(await list.text()).to.have.string('');
		});

		['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

			it.skip(`accepts ${ method }`, async () => {
				const path = ['PUT', 'DELETE'].includes(method) ? stub.tid() : '/';

				if (method === 'DELETE') {
					const get = await storage.put(path, stub.document());
					expect(get.status).to.equal(200);
				};

				const res = await storage[method.toLowerCase()](path, method === 'PUT' ? stub.document() : undefined);
				expect(res.status).to.be.oneOf({
					HEAD: [200, 204],
					GET: [200],
					PUT: [200, 201],
					DELETE: [200],
				}[method]);

				if (method === 'PUT') {
					const get = await storage.get(path);
					expect(get.status).to.equal(200);
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
				expect(res.status).to.be.oneOf(method === 'HEAD' ? [200, 204] : [200]);

				checkHeaders({
					res,
					item,
				});

				expect(await res.text()).to.equal(method === 'HEAD' ? '' : JSON.stringify(item));
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
				expect(list1.status).to.be.oneOf([401, 403]);

				const list2 = await util.storage(Object.assign(util.clone(State), {
					scope: `public/${ State.scope }`,
					token: undefined,
				}))[method.toLowerCase()]('/');
				expect(list2.status).to.equal(list1.status);
				expect(list2.headers).to.deep.include(list1.headers);
				expect(await list2.text()).to.equal(await list1.text());
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
				expect(res.status).to.be.oneOf([401, 403]);
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
				expect(list1.status).to.equal(200);

				const list2 = await util.storage(Object.assign(util.clone(State), {
					scope: `public/${ State.scope }`,
					token: State.token_read_write,
				}))[method.toLowerCase()]('/');
				expect(list2.status).to.equal(list1.status);
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
					return expect(put.status).to.be.oneOf([200, 201]);
				
				const del = await util.storage(Object.assign(util.clone(State), {
					scope: `public/${ State.scope }`,
					token: State.token_read_write,
				})).delete(path, method === 'PUT' ? stub.document() : undefined);
				expect(del.status).to.be.oneOf([200, 204]);
			});

		});

		describe.skip('wrong scope', () => {

			['HEAD', 'GET', 'PUT', 'DELETE'].forEach(method => {

				it(`rejects ${ method }`, async () => {
					const res = await util.storage(Object.assign(util.clone(State), {
						scope: `public/${ Math.random().toString(36) }`,
						token: State.token_read_write,
					}))[method.toLowerCase()](stub.tid(), method === 'PUT' ? stub.document() : undefined);
					expect(res.status).to.be.oneOf([401, 403]);
				});

			});

		});

	});
	
});

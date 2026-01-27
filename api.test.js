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
				const response = await unauthorized().get(Math.random().toString());
				expect(response.status).toBe(401);
			});

			it('handles PUT', async () => {
				const response = await unauthorized().put(Math.random().toString(), {
					[Math.random().toString()]: Math.random().toString(),
				});
				expect(response.status).toBe(401);
			});

			it('handles DELETE', async () => {
				const response = await unauthorized().delete(Math.random().toString());
				expect(response.status).toBe(401);
			});

		});

		describe('PUT JSON object', () => {
			
			it('handles without folder', async () => {
				const response = await State.storage.put(Math.random().toString(), {
					[Math.random().toString()]: Math.random().toString(),
				});
				expect(response.status).toBeOneOf([200, 201])
				expect(response.headers.get('etag')).toSatisfy(State.version === 0 ? util.isEtag0 : util.isEtag1);
			});

			it('handles with folder', async () => {
				const response = await State.storage.put([
					Math.random().toString(),
					Math.random().toString(),
				].join('/'), {
					[Math.random().toString()]: Math.random().toString(),
				});
				expect(response.status).toBeOneOf([200, 201])
				expect(response.headers.get('etag')).toSatisfy(State.version === 0 ? util.isEtag0 : util.isEtag1);
			});

		});

	});

});

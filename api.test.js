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
			State.storage = util.storage(State);
		});

		describe('unauthorized', () => {

			it('handles GET', async () => {
				const response = await State.storage.get(Math.random().toString());
				expect(response.status).toBe(401);
			});

			it('handles PUT', async () => {
				const response = await State.storage.put(Math.random().toString());
				expect(response.status).toBe(401);
			});

			it('handles DELETE', async () => {
				const response = await State.storage.delete(Math.random().toString());
				expect(response.status).toBe(401);
			});

		});
	});

});

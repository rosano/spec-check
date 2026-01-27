import { describe, it, expect, beforeAll } from 'vitest';
import util from './util.js'

process.env.SERVER_URL.split(',').forEach(server => {

	describe(server, () => {

		const State = {
			server,
			account: process.env.ACCOUNT,
			scope: process.env.TOKEN_SCOPE || 'api-test-suite',
			token_rw: process.env.TOKEN_READ_WRITE,
		};
	});

});

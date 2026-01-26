import { describe, it, expect, beforeAll } from 'vitest';
import util from './util.js'

const Config = {
	server: process.env.SERVER_URL,
	account_1: process.env.ACCOUNT_1,
	scope: process.env.TOKEN_SCOPE || 'api-test-suite',
	token_rw: process.env.TOKEN_READ_WRITE,
};

beforeAll(async () => {
	Config.baseURL = (await util.webfinger(Config.server, Config.account_1)).href;
});

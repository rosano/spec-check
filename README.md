# API test suite for remoteStorage servers

Verify the compatibility of any web server with the [remoteStorage
spec](http://tools.ietf.org/html/draft-dejong-remotestorage-05)'s REST API, versions 03–05; also valid for later versions but missing specs for some newer features.

## Development

Install [Node.js and npm](https://nodejs.org/en/download/), then install the dependencies:

```sh
npm i
```

### Configure environment

| name | description |
| - | - |
| `SERVER_URL` | defaults to `api-test-suite` |
| `TOKEN_SCOPE` (optional) | defaults to `api-test-suite` |
| `ACCOUNT` | username of test account |
| `TOKEN_READ_WRITE` | OAuth token with read/write access to the specified `CATEGORY` |
| `TOKEN_READ_ONLY` | OAuth token with read-only access to the specified `CATEGORY` |
| `TOKEN_GLOBAL` | OAuth token with read/write access to the root folder |


1. Create a remoteStorage test account on the server you'd like to verify.
2. Copy `.env.example` to `.env` to set `SERVER_URL` and `ACCOUNT` from the previous step
3. Run the tokens app using the command below and visit https://localhost:5000 to generate the corresponding OAuth tokens:

```sh
npm run tokens
```

### Testing

```sh
npm run tests
```

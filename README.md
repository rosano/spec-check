# spec-check

[remoteStorage REST API](http://tools.ietf.org/html/draft-dejong-remotestorage-22) validator.

https://spec-check.0data.app

The spec version to test comes from the webfinger response by default, but you can also use the browser version to say "test that this server conforms to version X".

Mocha has a `grep` option to filter tests in the browser, for example [public folder with no token](https://spec-check.0data.app/?grep=%5Epublic%20folder%20with%20no%20token%20).

## Development

Install [Node.js and npm](https://nodejs.org/en/download/), then install the dependencies:

```sh
npm i
```

### Configure environment

| name | description | example/default |
| - | - | - |
| `SERVER_URL` | server root url | `https://kosmos.org` |
| `ACCOUNT_HANDLE` | username of test account | `tony` |
| `TOKEN_SCOPE` (optional) | scope/category to test | `api-test-suite` |
| `SPEC_VERSION` (optional) | draft version number | `22` |
| `TOKEN_READ_WRITE` | OAuth token with read/write access to the specified `TOKEN_SCOPE` | … |
| `TOKEN_READ_ONLY` | OAuth token with read-only access to the specified `TOKEN_SCOPE` | … |
| `TOKEN_GLOBAL` | OAuth token with read/write access to the root folder | … |

1. Create a remoteStorage test account on the server you'd like to verify.
2. Copy `.env.example` to `.env` to set `SERVER_URL` and `ACCOUNT_HANDLE` from the previous step
3. Visit the browser version above or run the local command below to generate the corresponding OAuth tokens.

### Testing

```sh
npm test
```

Create an alternative environments (like `.env.kosmos`) and run them with

```sh
ENV=kosmos npm test
```

### Local

Start the static server:

```sh
npm test
```

then visit http://localhost:8080.


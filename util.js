const mod = {

  tid: () => Math.random().toString(36).replace('0.', new Date().toJSON().replace(/\D/g, '')),

  document: (key, value) => ({
    [key || mod.tid()]: value || mod.tid(),
  }),

  isEtag0: string => !string.match(/\D/i),
  isEtag1: string => string.trim().length && string.match(/^([^']|\\')*/i),
  validEtag: version => version === 0 ? mod.isEtag0 : mod.isEtag1,

  isName0: string => string.match(/[a-zA-Z0-9%-_]/i),
  isName1: string => string.trim().length && string.match(/[a-zA-Z0-9%-_\.\-\_]/i),
  validName: version => version === 0 ? mod.isName0 : mod.isName1,

  clone: object => Object.assign({}, object),

  async webfinger (server, account) {
    const params = {
      resource: `acct:${ account }@${ (new URL(server)).hostname }`,
    };

    const json = await (await fetch(`${ server }/.well-known/webfinger?${ new URLSearchParams(params) }`)).json();
    
    return json.links.filter(e => e.rel === 'remotestorage').shift();
  },

  _fetch () {
    // console.log(...arguments);
    return fetch(...arguments);
  },

  _url: (State, path) => [
    State.baseURL,
    State.scope,
    path,
  ].join('/').replace(/\/+/g, '/'),

  storage (State) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (State.token_rw)
      headers['Authorization'] = 'Bearer ' + State.token_rw;

    return {
      get: path => mod._fetch(mod._url(State, path), {
        headers,
      }),
      put: (path, body) => mod._fetch(mod._url(State, path), {
        headers,
        method: 'PUT',
        body: JSON.stringify(body),
      }),
      delete: path => mod._fetch(mod._url(State, path), {
        headers,
        method: 'DELETE',
      }),
    };
  },

};

export default mod;

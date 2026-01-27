const mod = {

  isEtag0: string => !string.match(/\D/i),
  isEtag1: string => string.trim().length && string.match(/^([^']|\\')*/i),

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

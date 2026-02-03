const mod = {

  isEtag0: string => !string.match(/\D/i),
  isEtag1: string => string.trim().length && string.match(/^([^']|\\')*/i),
  validEtag: version => version === 0 ? mod.isEtag0 : mod.isEtag1,

  isName0: string => string.match(/[a-zA-Z0-9%-_]/i),
  isName1: string => string.trim().length && string.match(/[a-zA-Z0-9%-_\.\-\_]/i),
  validName: version => version === 0 ? mod.isName0 : mod.isName1,
  
  validDate: text => text.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/),

  clone: object => Object.assign({}, object),

  async webfinger (server, account) {
    const params = {
      resource: `acct:${ account }@${ (new URL(server)).hostname }`,
    };

    const json = await (await fetch(`${ server }/.well-known/webfinger?${ new URLSearchParams(params) }`)).json();

    return json.links.filter(e => ['remotestorage', 'http://tools.ietf.org/id/draft-dejong-remotestorage'].includes(e.rel)).shift();
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

    if (State.token)
      headers['Authorization'] = `Bearer ${ State.token }`;

    return {
      get: (path, _headers = {}) => mod._fetch(mod._url(State, path), {
        headers: Object.assign(mod.clone(headers), _headers),
      }),
      put: (path, body, _headers = {}) => mod._fetch(mod._url(State, path), {
        headers: Object.assign(mod.clone(headers), _headers),
        method: 'PUT',
        body: JSON.stringify(_headers).includes('charset=binary') ? body : JSON.stringify(body),
      }),
      delete: (path, _headers = {}) => mod._fetch(mod._url(State, path), {
        headers: Object.assign(mod.clone(headers), _headers),
        method: 'DELETE',
      }),
      head: path => mod._fetch(mod._url(State, path), {
        headers,
        method: 'HEAD',
      }),
      options: (path, _headers = {}) => mod._fetch(mod._url(State, path), {
        headers: Object.assign(mod.clone(headers), _headers),
        method: 'OPTIONS',
      }),
    };
  },

};

export default mod;

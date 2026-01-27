const util = {

  async webfinger (server, account) {
    const params = {
      resource: `acct:${ account }@${ (new URL(server)).hostname }`,
    };

    const json = await (await fetch(`${ server }/.well-known/webfinger?${ new URLSearchParams(params) }`)).json();
    
    return json.links.filter(e => e.rel === 'remotestorage').shift();
  },

  _url: (State, path) => [
    State.baseURL,
    State.scope,
    path,
  ].join('/'),

  storage (State) {
    const headers = {
      'Content-Type': 'application/json',
    };

    return {
      get: path => fetch(util._url(State, path), {
        headers: headers,
      }),
      put: (path, body) => fetch(util._url(State, path), {
        headers: headers,
        method: 'PUT',
        body: JSON.stringify(body),
      }),
      delete: path => fetch(util._url(State, path), {
        headers: headers,
        method: 'DELETE',
      }),
    };
  },

};

export default util;

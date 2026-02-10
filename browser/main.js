const storageKey = 'config';

const mod = {

  target: {},

  // actions

  async webfinger () {
    window.discover.innerText = JSON.stringify(mod._webfinger = await util.webfinger.discover(mod.config.server, mod.config.account), null, ' ');

    if (!mod._webfinger)
      return;

    window.oauth_read_write.removeAttribute('disabled');
    window.oauth_read_only.removeAttribute('disabled');
    window.oauth_global.removeAttribute('disabled');
  },

  oauth: permission => location.href = `${ util.webfinger.auth(mod._webfinger) }?${ new URLSearchParams({
    redirect_uri: location.href,
    scope: `${ mod.config.scope }:${ permission }`,
    response_type: 'token',
    client_id: location.href,
    state: mod.marshal({
      account: mod.config.account,
      permission,
    }),
  }) }`,

  reset () {
    const uri = window.location.toString();

    window.history.replaceState({}, document.title, uri.substring(0, uri.indexOf("#")))

    window.error.classList.add('hidden');
    window.error.innerHTML = '';

    window.nostate.classList.remove('hidden');
  },

  forget () {
    localStorage.removeItem(storageKey);

    mod.initialize()

    mod.react();

    Object.keys(mod.config).forEach(e => {
      window[e].value = mod.config[e];
    });

    window.forget.remove();
  },

  _save () {
    localStorage.setItem(storageKey, JSON.stringify(mod.config));

    mod.propagate(mod.config);
  },

  reveal () {
    [
      'token_read_write',
      'token_read_only',
      'token_global',
    ].forEach(e => window[e].type = window[e].type === 'password' ? 'text' : 'password')
  },

  // message

  didChange (event) {
    mod.config[event.target.id] = event.target.value;

    mod._save();

    mod.initialize()

    mod.react();
  },

  // react

  react () {
    window.webfinger.disabled = !!Object.entries(mod.config).filter(([key, value]) => !key.startsWith('token_') && !value).length;

    window.oauth_read_write.disabled = !mod._webfinger;
    window.oauth_read_only.disabled = !mod._webfinger;
    window.oauth_global.disabled = !mod._webfinger;
    
    window.test.disabled = !!Object.entries(mod.config).filter(([key, value]) => key.startsWith('token_') && !value).length;
    window.reveal.disabled = !Object.entries(mod.config).filter(([key, value]) => key.startsWith('token_') && value).length;
  },

  // utilities

  marshal: state => btoa(JSON.stringify(state)),

  unmarshal: state => JSON.parse(atob(state)),

  process (params) {
    if (params.state.account !== mod.config.account)
      return Object.assign(window.error, {
        innerText: `Account should match '${ mod.config.account }'`,
        className: '',
      });

    const key = {
      'rw': 'token_read_write',
      'r': 'token_read_only',
      '*': 'token_global',
    }[params.state.permission];

    mod.config[key] = params.access_token;

    mod._save();

    window[key].value = params.access_token;

    mod.reset();
  },

  initialize () {
    mod.config = {
      server: '',
      account: '',
      scope: '',
      token_read_write: '',
      token_read_only: '',
      token_global: '',
    };
  },

  propagate: config => window.process.env = Object.fromEntries(Object.entries(config).map(([key, value]) => [{
      server: 'SERVER_URL',
      account: 'ACCOUNT',
      scope: 'TOKEN_SCOPE',
      token_read_write: 'TOKEN_READ_WRITE',
      token_read_only: 'TOKEN_READ_ONLY',
      token_global: 'TOKEN_GLOBAL',
  }[key], value])),

  // lifecycle

  DOMContentLoaded () {
    mod.initialize();

    const stored = localStorage.getItem(storageKey);

    if (stored)
      window.forget.appendChild(Object.assign(document.createElement('button'), {
        innerText: 'delete config',
        onclick: mod.forget,
      }));
    
    if (stored)
      mod.propagate(Object.assign(mod.config, JSON.parse(stored)));

    if (!mod.config.scope)
      mod.config.scope = 'api-test-suite';

    const params = Object.fromEntries(new window.URLSearchParams(window.location.hash.slice(1)));
    
    if (params.state)
      params.state = mod.unmarshal(params.state);

    if (params.access_token)
      mod.process(params);

    Object.keys(mod.config).forEach(e => {
      window[e].value = mod.config[e];

      window[e].addEventListener('input', mod.didChange);
    });

    mod.react();
  },

  didLoad () {
    window.process = {
      env: {},
    };
  },

};

mod.didLoad();

document.addEventListener('DOMContentLoaded', mod.DOMContentLoaded);

window.mod = mod;

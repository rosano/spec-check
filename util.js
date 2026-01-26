const util = {

  async webfinger (server, account) {
    const params = {
      resource: `acct:${ account }@${ (new URL(server)).hostname }`,
    };

    const json = await (await fetch(`${ server }/.well-known/webfinger?${ new URLSearchParams(params) }`)).json();
    
    return json.links.filter(e => e.rel === 'remotestorage').shift();
  },

};

export default util;

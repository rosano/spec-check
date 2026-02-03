const mod = {

  tid: () => Math.random().toString(36).replace('0.', new Date().toJSON().replace(/\D/g, '')),

  document: (key, value) => ({
    [key || mod.tid()]: value || mod.tid(),
  }),

  origin: () => `https://${ Math.random().toString(32) }`,

};

export default mod;

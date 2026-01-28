require('dotenv').config();

const port = process.env.PORT || 3000;

require('http').createServer((req, res) => {
  if (req.url === '/util.js')
    return res
      .writeHead(200, {'Content-Type': 'text/javascript'})
      .end(require('fs').readFileSync(__dirname + '/../util.js', 'utf8'));  

  const template = require('fs').readFileSync(require('path').join(__dirname, 'view.html'), 'utf8');
  return res
    .writeHead(200, {'Content-Type': 'text/html'})
    .end([
      'SERVER_URL',
      'ACCOUNT',
      'TOKEN_SCOPE',
      'TOKEN_READ_WRITE',
    ].reduce((coll, e) => coll.replaceAll(`$${ e }`, process.env[e]), template));
})
.on('listening', () => console.info(`Listening on port ${ port }`))
.listen(port);

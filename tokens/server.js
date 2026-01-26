require('dotenv').config()

const port = process.env.PORT || 3000;

require('http').createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end([
    'SERVER_URL',
    'ACCOUNT_1',
    'TOKEN_SCOPE',
    'TOKEN_READ_WRITE',
  ].reduce((coll, e) => coll.replaceAll('$' + e, process.env[e]), require('fs').readFileSync(__dirname + '/view.html', 'utf8')));
}).listen(port);

console.info('Listening on port ' + port);

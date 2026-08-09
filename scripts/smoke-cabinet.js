require('dotenv').config();
const http = require('http');
const { app } = require('../config/app');
const routes = require('../routes/index');

app.use('/', routes);

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const jar = {};

  function request(method, path, body) {
    return new Promise((resolve, reject) => {
      const headers = {
        Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
      };
      if (body) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(body);
      }
      const req = http.request(`${base}${path}`, { method, headers }, (res) => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          setCookie.forEach((c) => {
            const m = c.match(/^([^=]+)=([^;]+)/);
            if (m) jar[m[1]] = m[2];
          });
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            body: data
          });
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  try {
    const health = await request('GET', '/health');
    console.log('health:', health.status, health.body);

    const cabinet = await request('GET', '/cabinet');
    console.log('cabinet (no auth):', cabinet.status, cabinet.location || cabinet.body.slice(0, 100));

    const loginPage = await request('GET', '/user/login');
    const csrfMatch =
      loginPage.body.match(/name="_csrf"[^>]*value="([^"]*)"/) ||
      loginPage.body.match(/value="([^"]*)"[^>]*name="_csrf"/) ||
      loginPage.body.match(/id="_csrf"[^>]*value="([^"]*)"/);
    console.log('login page:', loginPage.status, 'csrf:', csrfMatch && csrfMatch[1] ? 'found' : 'missing');

    const verifyBad = await request('GET', '/verify-email/1/' + 'a'.repeat(64));
    console.log('verify invalid:', verifyBad.status, verifyBad.body.includes('недействительна') || verifyBad.body.includes('Ошибка') ? 'error-page-ok' : 'unexpected');
  } catch (err) {
    console.error('smoke error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

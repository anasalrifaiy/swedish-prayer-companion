/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const STARTUP_DIAGNOSTIC_PATH = '/__diagnostics/startup';
const MAX_DIAGNOSTIC_BYTES = 4096;
const MAX_DIAGNOSTICS_PER_MINUTE = 30;
let diagnosticWindowStartedAt = Date.now();
let diagnosticRequestCount = 0;

const ALLOWED_DIAGNOSTIC_STAGES = new Set([
  'layout_module_loaded',
  'error_handler_unavailable',
  'root_mounted',
  'fonts_loaded',
  'font_error',
  'uncaught_js_error',
  'react_error_boundary',
]);

function writeStartupLog(record) {
  process.stderr.write(`[Expo Go startup] ${JSON.stringify(record)}\n`);
}

function acceptDiagnosticRequest() {
  const now = Date.now();
  if (now - diagnosticWindowStartedAt >= 60_000) {
    diagnosticWindowStartedAt = now;
    diagnosticRequestCount = 0;
  }
  if (diagnosticRequestCount >= MAX_DIAGNOSTICS_PER_MINUTE) return false;
  diagnosticRequestCount += 1;
  return true;
}

function cleanDiagnosticText(value, maxLength) {
  if (typeof value !== 'string') return undefined;
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(token|api[_-]?key|password|secret)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, maxLength);
}

function respondJsonError(res, statusCode, message) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

function receiveStartupDiagnostic(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return;
  }

  if (!acceptDiagnosticRequest()) {
    res.writeHead(429, { 'cache-control': 'no-store' });
    res.end();
    return;
  }

  let size = 0;
  let tooLarge = false;
  const chunks = [];

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_DIAGNOSTIC_BYTES) {
      tooLarge = true;
      chunks.length = 0;
      return;
    }
    if (!tooLarge) chunks.push(chunk);
  });

  req.on('end', () => {
    if (tooLarge) {
      respondJsonError(res, 413, 'Diagnostic payload too large');
      return;
    }

    let diagnostic;
    try {
      diagnostic = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      respondJsonError(res, 400, 'Invalid diagnostic payload');
      return;
    }

    if (!diagnostic || !ALLOWED_DIAGNOSTIC_STAGES.has(diagnostic.stage)) {
      respondJsonError(res, 400, 'Unknown diagnostic stage');
      return;
    }

    writeStartupLog({
      source: 'client',
      stage: diagnostic.stage,
      name: cleanDiagnosticText(diagnostic.name, 100),
      message: cleanDiagnosticText(diagnostic.message, 500),
      stack: cleanDiagnosticText(diagnostic.stack, 2000),
      isFatal: diagnostic.isFatal === true,
    });
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return typeof appJson.expo?.name === 'string'
      ? appJson.expo.name
      : 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toScriptString(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, 'utf-8');
  if (platform === 'android') {
    writeStartupLog({ source: 'request', event: 'android_manifest_served' });
  }
  res.writeHead(200, {
    'content-type': 'application/json',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `exps://${host}${basePath}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_ATTRIBUTE_PLACEHOLDER/g, escapeHtml(expsUrl))
    .replace(/EXPS_URL_JSON_PLACEHOLDER/g, toScriptString(expsUrl))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(STATIC_ROOT, safePath);
  const isAndroidBundle = urlPath.endsWith('/_expo/static/js/android/bundle.js');

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (isAndroidBundle) {
      writeStartupLog({ source: 'request', event: 'android_bundle_not_found' });
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  if (isAndroidBundle) {
    writeStartupLog({
      source: 'request',
      event: 'android_bundle_served',
      bytes: content.length,
    });
  }
  res.writeHead(200, { 'content-type': contentType });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
const appName = getAppName();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || '/';
  }

  if (pathname === STARTUP_DIAGNOSTIC_PATH) {
    return receiveStartupDiagnostic(req, res);
  }

  if (pathname === '/' || pathname === '/manifest') {
    const platform = req.headers['expo-platform'];
    if (platform === 'ios' || platform === 'android') {
      return serveManifest(platform, res);
    }

    if (pathname === '/') {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || '3000', 10);
server.listen(port, '0.0.0.0', () => {
  console.log(`Serving static Expo build on port ${port}`);
});

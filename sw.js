const CACHE='scancode-zxing-only-v5';
const CORE=['./','./index.html','./styles.css','./app.js','./sw-reg.js','./manifest.webmanifest',
'./icons/icon-192.png','./icons/icon-512.png','./icons/favicon-32.png','./icons/favicon-16.png',
'./vendor/zxing-wasm-reader.iife.js','./vendor/zxing_reader.wasm','./vendor/tesseract.min.js',
'./vendor/tesseract-core/tesseract-core.wasm.js','./vendor/tesseract-core/tesseract-core.wasm',
'./vendor/lang-data/eng.traineddata.gz','./vendor/xlsx.full.min.js','./vendor/jszip.min.js'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const url of CORE) {
      try { await c.add(url); } catch (e) { /* ignore missing files (e.g., vendor not checked in) */ }
    }
  })());
});
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(net => {
    if (req.method==='GET' && net && net.status===200 && net.type==='basic') {
      const cp = net.clone();
      caches.open(CACHE).then(c => c.put(req, cp));
    }
    return net;
  }).catch(() => caches.match('./index.html'))));
});

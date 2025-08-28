/* very small passthrough service worker */
const CACHE = 'scancode-v2';
const CORE = [
  './vendor/zxing-wasm-reader.iife.js',
  './vendor/zxing_reader.wasm',
  './vendor/jsQR.js',
  './vendor/tesseract.min.js',
  './vendor/tesseract-core/tesseract-core.wasm.js',
  './vendor/tesseract-core/tesseract-core.wasm',
  './vendor/lang-data/eng.traineddata.gz',
  './vendor/xlsx.full.min.js',
  './vendor/jszip.min.js',
  './',
  './index.html',
  './styles.css',
  './app.js',
  './sw-reg.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(res=> res || fetch(req).then(netRes => {
      if(req.method==='GET' && netRes && netRes.status===200 && netRes.type==='basic'){
        const copy = netRes.clone();
        caches.open(CACHE).then(c=> c.put(req, copy));
      }
      return netRes;
    }).catch(()=> caches.match('./index.html')))
  );
});

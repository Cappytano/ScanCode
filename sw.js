/* very small passthrough service worker */
const CACHE = 'scancode-v2';
const CORE = [
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
  e.waitUntil(self.clients.claim());
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

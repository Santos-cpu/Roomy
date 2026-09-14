const CACHE_NAME = 'piso-app-v2'; // Subimos la versión para forzar la actualización
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json'
];

// 1. Instalación
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  // Obliga al nuevo Service Worker a tomar el control inmediatamente
  self.skipWaiting(); 
});

// 2. Activación y limpieza de versiones antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Estrategia "Network First" (Red primero)
self.addEventListener('fetch', event => {
  // Solo aplicamos esto a peticiones GET (no a Firebase/Firestore)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si hay internet y la petición tiene éxito, guardamos una copia fresca en caché
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => {
        // Si no hay internet (el fetch falla), devolvemos lo que haya en la caché
        return caches.match(event.request);
      })
  );
});

const CACHE_NAME = 'piso-app-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json'
];

// Instalación del Service Worker y guardado en caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Archivos cacheados');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar peticiones para servir desde caché si no hay internet (App Shell)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la respuesta cacheada si existe, si no, hace la petición a internet
        return response || fetch(event.request);
      })
  );
});
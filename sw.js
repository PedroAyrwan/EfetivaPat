// ==========================================
// ARQUIVO: sw.js (Service Worker) - Versão v4
// ==========================================

const CACHE_NAME = 'efetivapat-v4';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './admin.html',
  './repositorio_admin.html',
  './levantamento.html',
  './redefinir_senha.html',
  './levantamento.css',
  './config.js',
  './admin_repo_logic.js',
  './levantamento.js',
  './imagem/logo.png',
  // Agora aponta apenas para o arquivo que você tem
  './icons/icon.png'
];

// 1. INSTALAÇÃO
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando v4...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ATIVAÇÃO
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando v4...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 3. INTERCEPTAÇÃO
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
// ==========================================
// ARQUIVO: sw.js (Service Worker) - Versão v5
// ==========================================

// Mudei para v5 para garantir que o celular baixe o novo ícone
const CACHE_NAME = 'efetivapat-v5';

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
  // Garante que ele salve o ícone único que está na pasta correta
  './icons/icon.png'
];

// 1. INSTALAÇÃO
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando v5...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ATIVAÇÃO (Limpa as versões antigas v1, v2, v3, v4...)
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando v5...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removendo cache antigo:', key);
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
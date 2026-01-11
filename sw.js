// ==========================================
// ARQUIVO: sw.js (Service Worker)
// ==========================================

// Nome do Cache (Mude o 'v1' para 'v2' sempre que atualizar o site para forçar a atualização no celular dos usuários)
const CACHE_NAME = 'efetivapat-v1';

// Lista de arquivos que devem ser salvos no celular para funcionar offline/rápido
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './admin.html',
  './repositorio_admin.html',
  './levantamento.html',
  './levantamento.css',
  './config.js',
  './admin_repo_logic.js',
  './levantamento.js',
  './imagem/logo.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
  // Se tiver outros arquivos CSS ou JS (ex: admin_style.css), adicione aqui.
];

// 1. INSTALAÇÃO: Baixa e salva os arquivos no cache
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando arquivos estáticos');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Força o SW a ativar imediatamente
});

// 2. ATIVAÇÃO: Limpa caches antigos (importante para atualizações)
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando...');
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

// 3. INTERCEPTAÇÃO (FETCH): Define o que vem do cache e o que vem da internet
self.addEventListener('fetch', (event) => {
  // REGRA 1: Requisições para o Supabase (banco de dados) NUNCA devem ir para o cache.
  // Queremos dados sempre frescos, em tempo real.
  if (event.request.url.includes('supabase.co')) {
    return; // Deixa o navegador buscar direto na internet
  }

  // REGRA 2: Arquivos estáticos (HTML, CSS, JS, Imagens) tentam cache primeiro.
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Se achou no cache, retorna do cache (Rápido!)
      if (response) {
        return response;
      }
      // Se não achou (ex: é um arquivo novo ou link externo), busca na internet
      return fetch(event.request);
    })
  );
});
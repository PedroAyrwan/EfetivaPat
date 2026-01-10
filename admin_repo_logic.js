// ==========================================
// ARQUIVO: admin_repo_logic.js (Detector Universal de Duplicados)
// ==========================================

const { createClient } = supabase;

// CONFIGURAÇÕES
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'arquivo_clientes'; 
const urlParams = new URLSearchParams(window.location.search);
const targetUserId = urlParams.get('id');

let currentPath = ""; 

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> SISTEMA PRONTO.");
    initAdminRepo();
});

async function initAdminRepo() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') { 
        alert("Acesso Negado."); window.location.href = "index.html"; return; 
    }

    if (!targetUserId) { showToast("Erro: ID ausente.", "error"); return; }

    const { data: clientProfile } = await supabaseClient.from('profiles').select('email, name').eq('id', targetUserId).single();
    if(clientProfile) {
        const name = clientProfile.name || clientProfile.email;
        const display = document.getElementById('clientEmailDisplay');
        if(display) display.innerText = `Gerenciando: ${name}`;
    }

    listFiles();
    setupDragAndDrop();
}

// ==========================================
// 2. FUNÇÃO DO ARRASTAR (SOMENTE ARQUIVOS)
// ==========================================
async function handleDrop(e) {
    const dropArea = document.getElementById('drop-area');
    if(dropArea) dropArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    
    if (!files || files.length === 0) return;

    showToast(`Recebendo ${files.length} itens...`, "info");

    let filesToUpload = [];

    // Filtra arquivos válidos
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 0) {
            filesToUpload.push(file);
        }
    }

    if (filesToUpload.length > 0) {
        uploadQueue(filesToUpload);
    } else {
        alert("Nenhum arquivo solto válido identificado.\n\nSe você tentou arrastar uma PASTA, por favor use o botão 'Selecionar Pasta Inteira'.");
    }
}

function setupDragAndDrop() {
    const dropArea = document.getElementById('drop-area');
    if(!dropArea) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false);
        document.body.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    ['dragenter', 'dragover'].forEach(evt => dropArea.addEventListener(evt, () => dropArea.classList.add('drag-over'), false));
    ['dragleave', 'drop'].forEach(evt => dropArea.addEventListener(evt, () => dropArea.classList.remove('drag-over'), false));

    dropArea.addEventListener('drop', handleDrop, false);
}

// ==========================================
// 3. FUNÇÃO DO BOTÃO (SOMENTE PASTAS)
// ==========================================
window.handleFolderSelect = function(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    
    const validFiles = fileList.filter(f => f.name !== '.DS_Store' && f.name !== 'Thumbs.db');
    
    if (validFiles.length > 0) {
        uploadQueue(validFiles);
    } else {
        showToast("A pasta está vazia.", "error");
    }
}

// ==========================================
// 4. SISTEMA DE UPLOAD (COM DETECTOR AGRESSIVO DE DUPLICADOS)
// ==========================================
async function uploadQueue(files) {
    showToast(`Enviando ${files.length} arquivos...`, "info");

    for (const file of files) {
        let path = file.webkitRelativePath || file.name;
        if (path.startsWith('/')) path = path.slice(1);
        
        await uploadFile(file, path);
    }

    listFiles();
    
    const folderInput = document.getElementById('folderInput');
    if(folderInput) folderInput.value = '';
}

async function uploadFile(file, relativePath) {
    // Sanitização
    const cleanPath = relativePath.split('/').map(p => 
        p.normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
         .replace(/[^a-zA-Z0-9.-]/g, '_') 
    ).join('/');

    // UI Progresso
    const progressContainer = document.getElementById('upload-progress-container');
    const pid = 'prog-' + Math.random().toString(36).substr(2, 9);
    
    if (progressContainer) {
        progressContainer.insertAdjacentHTML('afterbegin', `
            <div id="${pid}" class="upload-item bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3 mb-2 animate-enter">
                <span class="material-symbols-outlined text-primary animate-pulse">cloud_upload</span>
                <div class="flex-1">
                    <div class="flex justify-between text-xs mb-1">
                        <span class="truncate max-w-[200px] font-medium text-slate-700 dark:text-white">${cleanPath}</span>
                        <span id="${pid}-txt" class="text-slate-400">Enviando...</span>
                    </div>
                    <div class="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5"><div id="${pid}-bar" class="bg-primary h-1.5 rounded-full transition-all duration-300" style="width: 10%"></div></div>
                </div>
            </div>`);
    }

    const bar = document.getElementById(`${pid}-bar`);
    const txt = document.getElementById(`${pid}-txt`);
    const item = document.getElementById(pid);

    try {
        let fake = 10;
        const interval = setInterval(() => { if(fake<90) { fake+=10; if(bar) bar.style.width=fake+'%'; } }, 200);

        let fullPath = `${targetUserId}/${currentPath}/${cleanPath}`.replace(/\/+/g, '/');
        
        const { error } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .upload(fullPath, file, { cacheControl: '3600', upsert: false });

        clearInterval(interval);

        // --- CORREÇÃO: DETECÇÃO AMPLA DE DUPLICIDADE ---
        if (error) {
            console.log("Erro detectado:", error); // Isso vai aparecer no F12 se der pau

            // Verifica se é duplicado checando VÁRIAS possibilidades
            const isDuplicate = 
                error.message.includes("Duplicate") || 
                error.message.includes("already exists") || 
                error.error === "Duplicate" ||
                error.statusCode === "409";

            if (isDuplicate) {
                // É duplicado! Trata como Aviso (Laranja)
                if(bar) { bar.style.width = '100%'; bar.style.background = '#f59e0b'; } // Laranja
                if(txt) txt.innerText = 'Já existe (Ignorado)';
                
                showToast(`Arquivo ignorado: "${cleanPath}" (Já existe)`, "info");

                // Remove da tela
                setTimeout(() => { if(item) item.remove(); }, 2000);
                
                return; // IMPORTANTE: Sai da função sem jogar erro
            }
            
            // Se não for duplicado, joga o erro para ficar vermelho
            throw error;
        }

        // Sucesso
        if(bar) { bar.style.width = '100%'; bar.style.background = '#10b981'; }
        if(txt) txt.innerText = 'Ok';
        setTimeout(() => { if(item) item.remove(); }, 1500);

    } catch (err) {
        console.error(`Erro fatal upload (${cleanPath}):`, err);
        
        let msg = "Erro";
        if (err.message && err.message.includes("Failed to fetch")) msg = "Erro Rede";
        else if (err.message) msg = err.message.slice(0, 20); // Mostra pedaço do erro
        
        if(bar) bar.style.background = '#ef4444';
        if(txt) txt.innerText = msg;
    }
}

// ==========================================
// 5. LISTAGEM
// ==========================================
async function listFiles() {
    const listBody = document.getElementById('filesListBody');
    if(!listBody) return;
    listBody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400"><span class="material-symbols-outlined animate-spin">refresh</span> Carregando...</td></tr>`;

    let searchPath = `${targetUserId}/${currentPath}`.replace(/\/$/, '');
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).list(searchPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (error) { listBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao listar.</td></tr>`; return; }
    listBody.innerHTML = '';
    
    if (currentPath !== "") {
        listBody.innerHTML += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer border-b dark:border-slate-700" onclick="goUp()"><td class="py-3 px-4 flex gap-2 items-center text-slate-600 dark:text-slate-300"><span class="material-symbols-outlined">arrow_upward</span> .. (Voltar)</td><td colspan="3"></td></tr>`;
    }

    if (!data || data.length === 0) { listBody.innerHTML += `<tr><td colspan="4" class="text-center py-12 text-slate-400">Pasta vazia. Arraste arquivos aqui.</td></tr>`; return; }

    data.forEach(item => {
        if (!item.id) { // Pasta
            listBody.innerHTML += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer border-b dark:border-slate-700" onclick="enterFolder('${item.name}')">
                <td class="py-3 px-4 flex gap-2 items-center font-medium text-slate-800 dark:text-white"><span class="material-symbols-outlined text-yellow-500 fill-1">folder</span> ${item.name}</td>
                <td class="text-sm text-slate-500">-</td>
                <td class="text-sm text-slate-500">-</td>
                <td class="text-right px-4"><button onclick="event.stopPropagation(); deleteFolder('${item.name}')" class="p-2 text-slate-400 hover:text-red-500"><span class="material-symbols-outlined">delete</span></button></td>
            </tr>`;
        } else if (item.name !== '.keep') { // Arquivo
            const size = (item.metadata.size/1024).toFixed(1) + ' KB';
            const icon = getFileIcon(item.name);
            listBody.innerHTML += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b dark:border-slate-700">
                <td class="py-3 px-4 flex gap-2 items-center text-slate-800 dark:text-white"><span class="material-symbols-outlined ${icon.color}">${icon.icon}</span> ${item.name}</td>
                <td class="text-sm text-slate-500">${new Date(item.created_at).toLocaleDateString()}</td>
                <td class="text-sm text-slate-500">${size}</td>
                <td class="text-right px-4"><button onclick="deleteFile('${item.name}')" class="p-2 text-slate-400 hover:text-red-500"><span class="material-symbols-outlined">delete</span></button></td>
            </tr>`;
        }
    });
}

function enterFolder(f) { currentPath += f + "/"; updateBreadcrumb(); listFiles(); }
function goUp() { let p = currentPath.split('/').filter(x=>x); p.pop(); currentPath = p.length ? p.join('/')+'/' : ""; updateBreadcrumb(); listFiles(); }
function updateBreadcrumb() { document.getElementById('pathBreadcrumb').innerText = currentPath ? "Início > " + currentPath.replaceAll('/', ' > ').slice(0, -3) : "Início"; }

async function createFolder() {
    let name = prompt("Nome da pasta:"); if(!name) return;
    name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_');
    await uploadFile({ size: 1 }, name + "/.keep");
    listFiles();
}
async function deleteFile(n) { if(confirm("Apagar?")) { await supabaseClient.storage.from(BUCKET_NAME).remove([`${targetUserId}/${currentPath}${n}`]); listFiles(); } }
async function deleteFolder(n) { if(confirm("Apagar pasta?")) { showToast("Para segurança, delete arquivos internos primeiro.", "info"); } }

function showToast(msg, type) { if(typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: type==='error'?'#ef4444':'#10b981' } }).showToast(); }
function getFileIcon(n) { let e = n.split('.').pop().toLowerCase(); if(e==='pdf') return {icon:'picture_as_pdf',color:'text-red-500'}; if(['jpg','png'].includes(e)) return {icon:'image',color:'text-blue-500'}; return {icon:'description', color:'text-slate-400'}; }
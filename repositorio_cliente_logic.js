// ==========================================
// ARQUIVO: repositorio_logic.js
// ==========================================

const { createClient } = supabase;

// 1. CONEXÃO (Usa as variáveis do config.js)
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET_NAME = 'arquivo_clientes'; 
let currentUserId = null;
let currentPath = ""; 

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    initSystem();
});

async function initSystem() {
    // Verifica sessão
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // Se não estiver logado, manda de volta pro login
    if (!session) { 
        window.location.href = "index.html"; 
        return; 
    }

    currentUserId = session.user.id;
    loadUserProfile(currentUserId);
    listFiles();
    setupSearch();
    
    // Configura Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = "index.html";
    });
}

// ------------------------------------------
// LISTAGEM DE ARQUIVOS
// ------------------------------------------
async function listFiles() {
    const listBody = document.getElementById('filesListBody');
    if (!listBody) return;

    listBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400">Carregando arquivos...</td></tr>`;

    const searchPath = currentPath ? `${currentUserId}/${currentPath}` : currentUserId;

    const { data, error } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .list(searchPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar arquivos.</td></tr>`;
        return;
    }

    listBody.innerHTML = '';

    // Botão Voltar
    if (currentPath !== "") {
        listBody.innerHTML += `
            <tr class="hover:bg-slate-50 cursor-pointer border-b" onclick="goUp()">
                <td class="py-3 px-4 text-slate-600"><span class="material-symbols-outlined align-middle">arrow_upward</span> .. (Voltar)</td>
                <td colspan="3"></td>
            </tr>`;
    }

    if (!data || data.length === 0 || (data.length === 1 && data[0].name === '.emptyFolderPlaceholder')) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center py-12 text-slate-400">Nenhum arquivo encontrado.</td></tr>`;
        return;
    }

    data.forEach(item => {
        if (item.name === '.emptyFolderPlaceholder') return;

        if (!item.id) {
            // PASTA
            listBody.innerHTML += `
                <tr class="hover:bg-slate-50 cursor-pointer border-b" onclick="enterFolder('${item.name}')">
                    <td class="py-3 px-4 font-medium text-slate-700 flex items-center gap-2">
                        <span class="material-symbols-outlined text-yellow-500 text-3xl">folder</span> 
                        <span class="text-base">${item.name}</span>
                    </td>
                    <td>-</td><td>-</td><td></td>
                </tr>`;
        } else {
            // ARQUIVO
            const size = formatBytes(item.metadata.size);
            const date = new Date(item.created_at).toLocaleDateString('pt-BR');
            const iconData = getFileIcon(item.name);
            const ext = item.name.split('.').pop().toLowerCase();
            const isDoc = ['doc', 'docx', 'xls', 'xlsx'].includes(ext);

            let viewBtn = '';
            if (!isDoc) {
                viewBtn = `
                <button onclick="viewFile('${item.name}')" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Visualizar">
                    <span class="material-symbols-outlined text-[20px]">visibility</span>
                </button>`;
            }

            listBody.innerHTML += `
                <tr class="hover:bg-slate-50 border-b group transition-colors">
                    <td class="py-3 px-4 text-slate-700 flex items-center gap-3">
                        <span class="material-symbols-outlined ${iconData.color} text-3xl">${iconData.icon}</span> 
                        <span class="truncate max-w-[200px] font-medium">${item.name}</span>
                    </td>
                    <td class="text-sm text-slate-500 hidden sm:table-cell">${date}</td>
                    <td class="text-sm text-slate-500 hidden md:table-cell">${size}</td>
                    <td class="text-right px-4">
                        <div class="flex justify-end gap-2">
                            ${viewBtn}
                            <button onclick="downloadFile('${item.name}')" class="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors" title="Baixar">
                                <span class="material-symbols-outlined text-[20px]">download</span>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }
    });
}

// ------------------------------------------
// MODAL DE VISUALIZAÇÃO
// ------------------------------------------
async function viewFile(name) {
    const full = currentPath ? `${currentUserId}/${currentPath}${name}` : `${currentUserId}/${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(full, 60);
    
    if(!data) { showToast("Erro ao abrir arquivo.", "error"); return; }

    const url = data.signedUrl;
    const ext = name.split('.').pop().toLowerCase();
    
    const modal = document.getElementById('previewModal');
    const content = document.getElementById('preview-content');
    document.getElementById('modalTitle').innerText = name;

    modal.classList.remove('hidden');

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        content.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded-lg shadow-lg">`;
    } else if (ext === 'pdf') {
        content.innerHTML = `<iframe src="${url}" class="w-full h-full rounded-lg border-none"></iframe>`;
    } else {
        content.innerHTML = `<div class="text-center"><p class="text-slate-500 mb-4">Arquivo não suportado para visualização rápida.</p><a href="${url}" target="_blank" class="text-primary underline">Abrir em nova aba</a></div>`;
    }
}

window.closeModal = function() {
    document.getElementById('previewModal').classList.add('hidden');
    document.getElementById('preview-content').innerHTML = '';
}

// ------------------------------------------
// DOWNLOADS
// ------------------------------------------
async function downloadAllFiles() {
    const searchPath = currentPath ? `${currentUserId}/${currentPath}` : currentUserId;
    showToast("Preparando download...", "info");
    
    const { data: files } = await supabaseClient.storage.from(BUCKET_NAME).list(searchPath);

    if (!files || files.length === 0) {
        showToast("Nenhum arquivo para baixar.", "error");
        return;
    }

    const zip = new JSZip();
    let count = 0;

    for (const file of files) {
        if (file.name === '.emptyFolderPlaceholder' || !file.id) continue;
        const fullPath = searchPath + (searchPath.endsWith('/') ? '' : '/') + file.name;
        const { data: blob } = await supabaseClient.storage.from(BUCKET_NAME).download(fullPath);
        if (blob) { zip.file(file.name, blob); count++; }
    }

    if (count === 0) { showToast("Pasta vazia.", "error"); return; }

    showToast("Compactando...", "info");
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "arquivos_efetivapat.zip");
}

async function downloadFile(name) {
    const full = currentPath ? `${currentUserId}/${currentPath}${name}` : `${currentUserId}/${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(full, 60, { download: true });
    if(data) window.open(data.signedUrl, '_blank');
}

// ------------------------------------------
// UTILITÁRIOS
// ------------------------------------------
function setupSearch() {
    document.getElementById('searchDrive').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#filesListBody tr').forEach(row => {
            if(row.innerText.includes('.. (Voltar)')) return;
            row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
        });
    });
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return { icon: 'picture_as_pdf', color: 'text-red-500' };
    if (['doc', 'docx', 'txt'].includes(ext)) return { icon: 'article', color: 'text-blue-600' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'table_view', color: 'text-green-600' };
    if (['jpg', 'jpeg', 'png'].includes(ext)) return { icon: 'image', color: 'text-purple-500' };
    if (['zip', 'rar'].includes(ext)) return { icon: 'folder_zip', color: 'text-yellow-600' };
    return { icon: 'draft', color: 'text-slate-400' };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function loadUserProfile(uid) {
    const { data } = await supabaseClient.from('profiles').select('name, email').eq('id', uid).single();
    if(data) document.getElementById('userName').innerText = data.name || data.email;
}

function enterFolder(name) { currentPath += name + "/"; listFiles(); }
function goUp() { 
    const p = currentPath.split('/').filter(x=>x); 
    p.pop(); 
    currentPath = p.length ? p.join('/')+'/' : ""; 
    listFiles(); 
}

function showToast(msg, type) {
    const bg = type === 'error' ? "#ef4444" : "#136dec";
    if (typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: bg } }).showToast();
}
// ==========================================
// ARQUIVO: repositorio_cliente_logic.js
// VERSÃO CORRIGIDA (Sem conflito com config.js)
// ==========================================

// O 'supabaseClient' JÁ EXISTE pois veio do config.js. 
// Não precisamos criá-lo de novo.

const BUCKET_NAME = 'arquivo_clientes'; 
let currentRootId = null; // ID da pasta que será aberta (Dono ou Chefe)
let currentPath = ""; 

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    initSystem();
});

async function initSystem() {
    // 1. Verifica sessão
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // Se não estiver logado, manda de volta pro login
    if (!session) { 
        window.location.href = "index.html"; 
        return; 
    }

    const user = session.user;

    // 2. Carrega o perfil (nome no topo)
    loadUserProfile(user.id);

    // 3. LÓGICA DE PERMISSÃO (Dono vs Funcionário)
    try {
        const roleLabel = document.getElementById('roleLabel');

        // Verifica se este email é funcionário de alguém
        const { data: teamData } = await supabaseClient
            .from('team_members')
            .select('owner_id')
            .eq('member_email', user.email)
            .maybeSingle();

        if (teamData && teamData.owner_id) {
            // A) É FUNCIONÁRIO: Acessa a pasta do Chefe
            console.log(">>> Modo Funcionário: Acessando pasta do ID", teamData.owner_id);
            currentRootId = teamData.owner_id;
            
            // Muda o rótulo visual para VERDE
            if(roleLabel) {
                roleLabel.innerText = "FUNCIONÁRIO";
                roleLabel.classList.remove('text-primary'); // Remove azul
                roleLabel.classList.add('text-green-600');  // Põe verde
            }
        } else {
            // B) É DONO/CLIENTE: Acessa a própria pasta
            console.log(">>> Modo Cliente: Acessando própria pasta");
            currentRootId = user.id;
            
            if(roleLabel) roleLabel.innerText = "CLIENTE";
        }

        // 4. Carrega os arquivos
        listFiles();

    } catch (err) {
        console.error("Erro ao definir permissões:", err);
    }

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
    const emptyState = document.getElementById('emptyState');
    
    if (!listBody) return;

    listBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 flex justify-center"><span class="material-symbols-outlined animate-spin">progress_activity</span></td></tr>`;
    if(emptyState) emptyState.classList.add('hidden');

    // Usa currentRootId (que pode ser do chefe)
    const searchPath = currentPath ? `${currentRootId}/${currentPath}` : currentRootId;

    const { data, error } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .list(searchPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
        console.error(error);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar arquivos.</td></tr>`;
        return;
    }

    listBody.innerHTML = '';

    // Botão Voltar
    if (currentPath !== "") {
        listBody.innerHTML += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-700" onclick="goUp()">
                <td class="py-3 px-4 text-slate-600 dark:text-slate-400 font-bold"><span class="material-symbols-outlined align-middle mr-2">arrow_back</span> Voltar</td>
                <td colspan="3"></td>
            </tr>`;
    }

    // Filtra itens inválidos
    const validItems = data ? data.filter(i => i.name !== '.emptyFolderPlaceholder' && i.name !== '.keep') : [];

    if (validItems.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        listBody.innerHTML = "";
        return;
    }

    validItems.forEach(item => {
        const isFolder = !item.id; 

        if (isFolder) {
            // --- PASTA ---
            listBody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-700 transition-colors" onclick="enterFolder('${item.name}')">
                    <td class="py-3 px-4 font-medium text-slate-700 dark:text-slate-200 flex items-center gap-3">
                        <span class="material-symbols-outlined text-yellow-500 text-3xl">folder</span> 
                        <span class="text-base">${item.name}</span>
                    </td>
                    <td class="text-slate-400 text-xs hidden sm:table-cell">-</td>
                    <td class="text-slate-400 text-xs hidden md:table-cell">-</td>
                    <td></td>
                </tr>`;
        } else {
            // --- ARQUIVO ---
            const size = formatBytes(item.metadata.size);
            const date = new Date(item.created_at).toLocaleDateString('pt-BR');
            const iconData = getFileIcon(item.name);
            const ext = item.name.split('.').pop().toLowerCase();
            
            // Botão visualizar
            let viewBtn = '';
            if (['jpg','jpeg','png','gif','webp','pdf'].includes(ext)) {
                viewBtn = `
                <button onclick="viewFile('${item.name}')" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full transition-colors" title="Visualizar">
                    <span class="material-symbols-outlined text-[20px]">visibility</span>
                </button>`;
            }

            listBody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-700 group transition-colors">
                    <td class="py-3 px-4 text-slate-700 dark:text-slate-300 flex items-center gap-3">
                        <span class="material-symbols-outlined ${iconData.color} text-3xl">${iconData.icon}</span> 
                        <span class="truncate max-w-[150px] sm:max-w-[200px] font-medium">${item.name}</span>
                    </td>
                    <td class="text-sm text-slate-500 hidden sm:table-cell">${date}</td>
                    <td class="text-sm text-slate-500 hidden md:table-cell">${size}</td>
                    <td class="text-right px-4">
                        <div class="flex justify-end gap-1">
                            ${viewBtn}
                            <button onclick="downloadFile('${item.name}')" class="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-full transition-colors" title="Baixar">
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
    const full = currentPath ? `${currentRootId}/${currentPath}${name}` : `${currentRootId}/${name}`;
    const modal = document.getElementById('previewModal');
    const content = document.getElementById('preview-content');
    
    document.getElementById('modalTitle').innerText = name;
    modal.classList.remove('hidden');
    content.innerHTML = '<span class="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>';

    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(full, 3600);
    
    if(!data) { 
        showToast("Erro ao abrir arquivo.", "error"); 
        closeModal();
        return; 
    }

    const url = data.signedUrl;
    const ext = name.split('.').pop().toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        content.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded-lg shadow-lg">`;
    } else if (ext === 'pdf') {
        content.innerHTML = `<iframe src="${url}" class="w-full h-full rounded-lg border-none bg-white"></iframe>`;
    } else {
        content.innerHTML = `
            <div class="text-center">
                <span class="material-symbols-outlined text-6xl text-slate-300 mb-4">description</span>
                <p class="text-slate-500 mb-4">Arquivo não suportado para visualização rápida.</p>
                <a href="${url}" target="_blank" class="text-primary underline font-bold">Abrir em nova aba</a>
            </div>`;
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
    const searchPath = currentPath ? `${currentRootId}/${currentPath}` : currentRootId;
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
    saveAs(content, "documentos_efetivapat.zip");
}

async function downloadFile(name) {
    const full = currentPath ? `${currentRootId}/${currentPath}${name}` : `${currentRootId}/${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(full, 60, { download: true });
    if(data) {
        const a = document.createElement('a');
        a.href = data.signedUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

// ------------------------------------------
// UTILITÁRIOS E PERFIL
// ------------------------------------------
function setupSearch() {
    document.getElementById('searchDrive').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#filesListBody tr').forEach(row => {
            if(row.innerText.includes('Voltar')) return;
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
    return { icon: 'description', color: 'text-slate-400' };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function loadUserProfile(uid) {
    // Busca o nome do usuário logado
    const { data } = await supabaseClient.from('profiles').select('name, email').eq('id', uid).single();
    if(data) {
        document.getElementById('userName').innerText = data.name || data.email;
    }
}

function enterFolder(name) { 
    currentPath += name + "/"; 
    listFiles(); 
    updateBreadcrumb();
}

function goUp() { 
    const p = currentPath.split('/').filter(x=>x); 
    p.pop(); 
    currentPath = p.length ? p.join('/')+'/' : ""; 
    listFiles(); 
    updateBreadcrumb();
}

function updateBreadcrumb() {
    const el = document.getElementById('pathBreadcrumb');
    if (!currentPath) {
        el.innerText = "Início";
    } else {
        el.innerText = "Início > " + currentPath.replaceAll('/', ' > ').slice(0, -3);
    }
}

function showToast(msg, type) {
    const bg = type === 'error' ? "#ef4444" : "#136dec";
    if (typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, style: { background: bg, borderRadius: "8px" }, position: "right" }).showToast();
}
// ==========================================
// ARQUIVO: admin_repo_logic.js
// ==========================================

const BUCKET_NAME = 'arquivo_clientes'; 
const urlParams = new URLSearchParams(window.location.search);
const targetClientId = urlParams.get('id');
let currentPath = ""; 

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> GERENCIADOR ADMINISTRATIVO INICIADO.");
    setTimeout(initSystem, 100);
});

async function initSystem() {
    // Verifica se o config.js carregou a instância do Supabase
    if (typeof supabaseClient === 'undefined') {
        alert("Erro Crítico: config.js não carregou.");
        return;
    }

    // 1. Verifica Sessão Ativa
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { 
        window.location.href = "index.html"; 
        return; 
    }

    // 2. Verifica se o usuário é Admin
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (!profile || profile.role !== 'admin') { 
        alert("Acesso Negado."); 
        window.location.href = "repositorio_cliente.html"; 
        return; 
    }

    // 3. Verifica se o ID do cliente alvo foi passado na URL
    if (!targetClientId) {
        showToast("Erro: ID do cliente não informado.", "error");
        setTimeout(() => window.location.href = "admin.html", 2000);
        return;
    }

    await loadClientInfo();
    await checkLevantamentoStatus(); 
    await listFiles();
    setupDragAndDrop();
}

async function loadClientInfo() {
    try {
        const { data: client } = await supabaseClient
            .from('profiles')
            .select('name, email')
            .eq('id', targetClientId)
            .single();

        if (client) {
            const displayName = client.name || client.email;
            document.getElementById('clientEmailDisplay').innerText = displayName;
            document.getElementById('pageTitle').innerText = `Arquivos de ${displayName.split(' ')[0]}`;
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// 2. LÓGICA DO BOTÃO LEVANTAMENTO
// ==========================================
async function checkLevantamentoStatus() {
    const toggle = document.getElementById('toggleLevantamento');
    const btn = document.getElementById('btnOpenLevantamento');
    
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).list(`${targetClientId}/Levantamento`);
    const exists = data && data.length > 0;
    
    if(toggle) toggle.checked = exists;
    if(btn) exists ? btn.classList.remove('hidden') : btn.classList.add('hidden');
}

async function handleLevantamentoToggle() {
    const toggle = document.getElementById('toggleLevantamento');
    const btn = document.getElementById('btnOpenLevantamento');
    
    if (toggle.checked) {
        showToast("Ativando estrutura de Levantamento...", "info");
        // Cria a pasta fotos dentro de Levantamento para organização
        const pathFotos = `${targetClientId}/Levantamento/fotos/.emptyFolderPlaceholder`;
        const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(pathFotos, new Blob(['']), { upsert: true });

        if (!error) {
            showToast("Estrutura Criada!", "success");
            btn.classList.remove('hidden');
            if(currentPath === "") listFiles();
        } else {
            showToast("Erro ao criar estrutura.", "error");
            toggle.checked = false;
        }
    } else {
        btn.classList.add('hidden');
        showToast("Atalho desativado (os arquivos permanecem salvos).", "info");
    }
}

function goToLevantamento() {
    window.location.href = `levantamento.html?id=${targetClientId}`;
}

// ==========================================
// 3. LISTAGEM DE ARQUIVOS E NAVEGAÇÃO
// ==========================================
async function listFiles() {
    const listBody = document.getElementById('filesListBody');
    if (!listBody) return;
    
    listBody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400"><span class="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span><p class="mt-2 text-xs">Carregando...</p></td></tr>`;

    const fullPath = currentPath ? `${targetClientId}/${currentPath}` : `${targetClientId}`;

    try {
        const { data, error } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .list(fullPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

        if (error) throw error;
        listBody.innerHTML = '';

        if (currentPath !== "") {
            listBody.innerHTML += `<tr class="hover:bg-slate-50 cursor-pointer border-b" onclick="goUp()"><td class="py-3 px-6 text-primary font-bold flex items-center gap-2"><span class="material-symbols-outlined">arrow_back</span> Voltar</td><td colspan="3"></td></tr>`;
        }

        const items = data.filter(i => i.name !== '.emptyFolderPlaceholder');

        if (items.length === 0) {
            listBody.innerHTML += `<tr><td colspan="4" class="text-center py-12 text-slate-400">Esta pasta está vazia.</td></tr>`;
            return;
        }

        items.forEach(item => {
            const isFolder = !item.id;
            const iconData = isFolder ? {icon:'folder', color:'text-yellow-500'} : getFileIcon(item.name);
            const sizeText = isFolder ? '-' : formatBytes(item.metadata.size);
            const dateText = item.created_at ? new Date(item.created_at).toLocaleDateString() : '-';
            
            const tr = document.createElement('tr');
            tr.className = `hover:bg-slate-50 border-b transition-colors group`;
            if(isFolder) tr.onclick = () => enterFolder(item.name);

            tr.innerHTML = `
                <td class="py-3 px-6 cursor-pointer flex items-center gap-3">
                    <span class="material-symbols-outlined ${iconData.color}">${iconData.icon}</span>
                    <span class="font-medium text-slate-700">${item.name}</span>
                </td>
                <td class="py-3 px-6 text-xs text-slate-500 hidden sm:table-cell">${dateText}</td>
                <td class="py-3 px-6 text-xs text-slate-500 hidden md:table-cell">${sizeText}</td>
                <td class="py-3 px-6 text-right">
                    <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${!isFolder ? `<button onclick="downloadFile('${item.name}')" class="p-1 text-primary hover:bg-blue-50 rounded"><span class="material-symbols-outlined text-[20px]">download</span></button>` : ''}
                        <button onclick="event.stopPropagation(); deleteItem('${item.name}', ${isFolder})" class="p-1 text-red-500 hover:bg-red-50 rounded"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar lista.</td></tr>`;
    }
}

// Navegação
function enterFolder(name) { currentPath += name + "/"; listFiles(); updateBreadcrumb(); }
function goUp() { let p = currentPath.split('/').filter(x=>x); p.pop(); currentPath = p.length ? p.join('/')+'/' : ""; listFiles(); updateBreadcrumb(); }
function goHome() { currentPath = ""; listFiles(); updateBreadcrumb(); }
function updateBreadcrumb() {
    const el = document.getElementById('pathBreadcrumb');
    if(el) el.innerHTML = !currentPath ? `<span class="material-symbols-outlined text-[18px]">home</span> Início` : `<span onclick="goHome()" class="cursor-pointer hover:underline">Início</span> / ${currentPath.replace(/\/$/, "").replace(/\//g, " / ")}`;
}

// ==========================================
// 4. UPLOAD E OPERAÇÕES
// ==========================================
async function handleFiles(files) {
    if (!files.length) return;
    showToast(`Enviando ${files.length} item(s)...`, "info");
    for (const file of files) { await uploadFile(file); }
    listFiles();
}

async function uploadFile(file) {
    const cleanName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_');
    const fullPath = `${targetClientId}/${currentPath}${cleanName}`;
    const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(fullPath, file, { upsert: true });
    if (error) showToast(`Erro ao enviar ${file.name}`, "error");
}

async function createFolder() {
    let name = prompt("Nome da nova pasta:");
    if (!name) return;
    const path = `${targetClientId}/${currentPath}${name}/.emptyFolderPlaceholder`;
    await supabaseClient.storage.from(BUCKET_NAME).upload(path, new Blob(['']), { upsert: true });
    listFiles();
}

async function deleteItem(name, isFolder) {
    if (!confirm(`Excluir "${name}"?`)) return;
    const path = `${targetClientId}/${currentPath}${name}`;
    if (isFolder) {
        const { data } = await supabaseClient.storage.from(BUCKET_NAME).list(path);
        const toDelete = data.map(f => `${path}/${f.name}`);
        if(toDelete.length) await supabaseClient.storage.from(BUCKET_NAME).remove(toDelete);
        await supabaseClient.storage.from(BUCKET_NAME).remove([`${path}/.emptyFolderPlaceholder`]);
    } else {
        await supabaseClient.storage.from(BUCKET_NAME).remove([path]);
    }
    showToast("Excluído com sucesso!", "success");
    listFiles();
}

async function downloadFile(name) {
    const fullPath = `${targetClientId}/${currentPath}${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(fullPath, 60, { download: true });
    if(data) { window.open(data.signedUrl, '_blank'); }
}

// ==========================================
// UTILITÁRIOS
// ==========================================
function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return { icon: 'picture_as_pdf', color: 'text-red-500' };
    if (['xlsx', 'xls', 'csv'].includes(ext)) return { icon: 'table_view', color: 'text-green-600' };
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return { icon: 'image', color: 'text-purple-500' };
    return { icon: 'description', color: 'text-slate-400' };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function setupDragAndDrop() {
    const dropArea = document.getElementById('drop-area');
    if(!dropArea) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    dropArea.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
}

function showToast(msg, type="info") {
    const bg = type === 'error' ? "#ef4444" : (type === 'success' ? "#10b981" : "#136dec");
    if (typeof Toastify !== 'undefined') {
        Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", style: { background: bg, borderRadius: "8px" } }).showToast();
    }
}
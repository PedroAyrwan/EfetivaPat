// ==========================================
// ARQUIVO: admin_repo_logic.js (Versão v7 - Com Levantamento e Renomeação Automática)
// ==========================================

const BUCKET_NAME = 'arquivo_clientes'; 
const urlParams = new URLSearchParams(window.location.search);
const targetClientId = urlParams.get('id');
let currentPath = ""; 

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> GERENCIADOR INICIADO v7.");
    setTimeout(initSystem, 100);
});

async function initSystem() {
    // Segurança: Verifica se o config.js carregou
    if (typeof supabaseClient === 'undefined') {
        alert("Erro Crítico: config.js não carregou.");
        return;
    }

    // 1. Verifica Sessão
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    // 2. Verifica Admin
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') { 
        alert("Acesso Negado."); window.location.href = "repositorio_cliente.html"; return; 
    }

    // 3. Verifica Cliente Alvo
    if (!targetClientId) {
        showToast("Erro: ID do cliente não informado.", "error");
        setTimeout(() => window.location.href = "admin.html", 2000);
        return;
    }

    await loadClientInfo();
    
    // Checa se já existe levantamento para ativar o botão
    await checkLevantamentoStatus();
    
    await listFiles();
    setupDragAndDrop();
}

async function loadClientInfo() {
    try {
        const { data: client } = await supabaseClient.from('profiles').select('name, email').eq('id', targetClientId).single();
        if (client) {
            const displayName = client.name || client.email;
            document.getElementById('clientEmailDisplay').innerText = displayName;
            document.getElementById('pageTitle').innerText = `Arquivos de ${displayName.split(' ')[0]}`;
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// LÓGICA DO LEVANTAMENTO PATRIMONIAL (ATUALIZADO)
// ==========================================

async function checkLevantamentoStatus() {
    const toggle = document.getElementById('toggleLevantamento');
    const btn = document.getElementById('btnOpenLevantamento');
    
    // Verifica se existe a pasta raiz "Levantamento"
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).list(`${targetClientId}/Levantamento`);
    const exists = data && data.length > 0;
    
    if(toggle) toggle.checked = exists;
    
    if(btn) {
        if(exists) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
}

async function handleLevantamentoToggle() {
    const toggle = document.getElementById('toggleLevantamento');
    const btn = document.getElementById('btnOpenLevantamento');
    
    if (toggle.checked) {
        // ATIVAR: Cria a pasta "Levantamento" E a subpasta "fotos"
        showToast("Criando estrutura de Levantamento...", "info");
        
        // Caminho para criar a pasta fotos diretamente (o Supabase cria os pais automaticamente)
        const pathFotos = `${targetClientId}/Levantamento/fotos/.emptyFolderPlaceholder`;
        
        const { error } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .upload(pathFotos, new Blob(['']), { upsert: true });

        if (error) {
            showToast("Erro ao criar pastas.", "error");
            toggle.checked = false;
        } else {
            showToast("Levantamento Ativado! Pasta 'fotos' criada.", "success");
            btn.classList.remove('hidden');
            // Se estivermos na raiz, atualiza a lista
            if(currentPath === "") listFiles();
        }
    } else {
        // DESATIVAR
        btn.classList.add('hidden');
        showToast("Atalho desativado (Arquivos mantidos).", "info");
    }
}

function goToLevantamento() {
    window.location.href = `levantamento.html?id=${targetClientId}`;
}

// ==========================================
// 2. LISTAGEM DE ARQUIVOS
// ==========================================
async function listFiles() {
    const listBody = document.getElementById('filesListBody');
    if (!listBody) return;
    
    // Remove skeleton hardcoded se existir no HTML original e poe spinner
    const skeleton = document.getElementById('skeleton-loader-1');
    if(skeleton) skeleton.parentElement.innerHTML = '';
    
    listBody.innerHTML = `<tr><td colspan="4" class="py-12 text-center text-slate-400"><span class="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span><p class="mt-2 text-xs">Carregando...</p></td></tr>`;

    const fullPath = currentPath ? `${targetClientId}/${currentPath}` : `${targetClientId}`;

    try {
        const { data, error } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .list(fullPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

        if (error) throw error;
        listBody.innerHTML = '';

        if (currentPath !== "") {
            listBody.innerHTML += `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer border-b border-slate-100 dark:border-slate-700 transition-colors" onclick="goUp()"><td class="py-3 px-6 text-slate-600 dark:text-slate-400 font-bold flex items-center gap-2"><span class="material-symbols-outlined">arrow_back</span> Voltar</td><td colspan="3"></td></tr>`;
        }

        const validItems = data ? data.filter(i => i.name !== '.emptyFolderPlaceholder' && i.name !== '.keep') : [];

        if (validItems.length === 0) {
            listBody.innerHTML += `<tr><td colspan="4" class="text-center py-12 text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center"><span class="material-symbols-outlined text-4xl mb-2 opacity-30">folder_open</span>Pasta vazia.</td></tr>`;
            return;
        }

        validItems.forEach(item => {
            const isFolder = !item.id;
            const iconData = isFolder ? {icon:'folder', color:'text-yellow-500'} : getFileIcon(item.name);
            const sizeText = isFolder ? '-' : formatBytes(item.metadata.size);
            const dateText = item.created_at ? new Date(item.created_at).toLocaleDateString() : '-';
            
            // Destaque para pastas do sistema
            const isSystemFolder = isFolder && (item.name === 'Levantamento' || item.name === 'fotos');
            const rowClass = isSystemFolder ? "bg-indigo-50/60 dark:bg-indigo-900/10 border-indigo-100" : "";
            const badge = isSystemFolder ? '<span class="ml-2 text-[9px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 uppercase tracking-wide">Sistema</span>' : '';

            const tr = document.createElement('tr');
            tr.className = `hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 transition-colors group ${rowClass}`;
            
            if(isFolder) tr.onclick = () => enterFolder(item.name);

            tr.innerHTML = `
                <td class="py-3 px-6 cursor-pointer">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined ${iconData.color} text-2xl">${iconData.icon}</span>
                        <span class="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[200px] sm:max-w-xs">${item.name}</span>
                        ${badge}
                    </div>
                </td>
                <td class="py-3 px-6 text-xs text-slate-500 hidden sm:table-cell">${dateText}</td>
                <td class="py-3 px-6 text-xs text-slate-500 hidden md:table-cell">${sizeText}</td>
                <td class="py-3 px-6 text-right">
                    <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${!isFolder ? `<button onclick="downloadFile('${item.name}')" class="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Baixar"><span class="material-symbols-outlined text-[20px]">download</span></button>` : ''}
                        <button onclick="event.stopPropagation(); deleteItem('${item.name}', ${isFolder})" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Excluir"><span class="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });

    } catch (err) {
        console.error("Erro listagem:", err);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Erro ao carregar lista.</td></tr>`;
    }
}

// ==========================================
// 3. UPLOAD (COM RENOMEAÇÃO INTELIGENTE)
// ==========================================
async function handleFiles(files) {
    if (!files || files.length === 0) return;
    showToast(`Processando ${files.length} itens...`, "info");

    for (const file of files) {
        let relativePath = file.webkitRelativePath || file.name;
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
        
        // LÓGICA DE RENOMEAÇÃO PARA LEVANTAMENTO
        let fileToUpload = file;
        let finalPath = relativePath;

        // Verifica se estamos na pasta 'fotos' dentro de 'Levantamento'
        if (currentPath.includes('Levantamento/fotos')) {
            // Pergunta dados ao usuário para renomear
            const renameData = await promptForLevantamentoRename(file.name);
            
            if (renameData) {
                // Cria um novo arquivo com o novo nome
                const newName = renameData.newName;
                const blob = file.slice(0, file.size, file.type); 
                fileToUpload = new File([blob], newName, { type: file.type });
                finalPath = newName; // Atualiza o caminho
                showToast(`Renomeado para: ${newName}`, "success");
            } else {
                showToast("Upload cancelado ou nome mantido.", "info");
                if (renameData === null) continue; // Usuário clicou em cancelar no prompt, pula arquivo
            }
        }

        await uploadFile(fileToUpload, finalPath);
    }

    showToast("Processo finalizado!", "success");
    listFiles();
    
    if(document.getElementById('fileElem')) document.getElementById('fileElem').value = '';
    if(document.getElementById('folderInput')) document.getElementById('folderInput').value = '';
}

// Função Auxiliar para Perguntar Nome e Número
async function promptForLevantamentoRename(originalName) {
    // Pequeno delay para UI respirar
    await new Promise(r => setTimeout(r, 100));

    const itemName = prompt(`Arquivo: ${originalName}\n\nQual o NOME do Item? (ex: cadeira)\nDeixe vazio para não renomear.`);
    if (itemName === null) return null; // Cancelou
    if (itemName.trim() === "") return false; // Não quis renomear

    const itemNum = prompt(`Qual o NÚMERO do Item? (ex: 03)`);
    if (itemNum === null) return null; 

    const isItemPhoto = confirm(`Esta é a foto do ITEM (${itemName})?\n\n[OK] = Sim, é a foto do Item\n[CANCELAR] = Não, é a foto do Número`);
    
    // Normaliza strings (remove acentos e espaços)
    const safeItemName = itemName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "_");
    const safeItemNum = itemNum.trim().replace(/[^0-9]/g, "");
    const ext = originalName.split('.').pop();

    let newFileName = "";
    
    if (isItemPhoto) {
        // Regra: foto do item como "foto cadeira"
        newFileName = `foto_${safeItemName}.${ext}`;
    } else {
        // Regra: foto do numero como "foto numero 03"
        newFileName = `foto_numero_${safeItemNum}.${ext}`;
    }

    return { newName: newFileName };
}

function handleFolderSelect(event) { handleFiles(event.target.files); }

async function uploadFile(file, relativePath) {
    // Normalização padrão para outros casos
    const cleanPath = relativePath.split('/').map(p => 
        p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_') 
    ).join('/');

    const container = document.getElementById('upload-progress-container');
    const pid = 'prog-' + Math.random().toString(36).substr(2, 9);
    
    if (container) {
        container.classList.remove('hidden');
        container.insertAdjacentHTML('afterbegin', `
            <div id="${pid}" class="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-3 text-xs mb-2">
                <span class="material-symbols-outlined text-primary text-sm animate-spin">sync</span>
                <span class="truncate flex-1 font-mono">${cleanPath}</span>
            </div>
        `);
    }
    const item = document.getElementById(pid);

    try {
        const fullPath = `${targetClientId}/${currentPath}${cleanPath}`.replace(/\/+/g, '/');
        
        // Upload para o Supabase
        const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(fullPath, file, { cacheControl: '3600', upsert: false });

        if (error) {
            const isDuplicate = error.message.includes("Duplicate") || error.message.includes("already exists") || error.statusCode === "409";
            if (isDuplicate) {
                if(item) { item.innerHTML = `<span class="material-symbols-outlined text-yellow-500 text-sm">warning</span> <span class="truncate flex-1 text-slate-500">${cleanPath} (Já existe)</span>`; }
                setTimeout(() => item?.remove(), 3000);
                return; 
            }
            throw error;
        }
        if(item) {
            item.innerHTML = `<span class="material-symbols-outlined text-green-500 text-sm">check_circle</span> <span class="truncate flex-1 text-slate-600">${cleanPath}</span>`;
            setTimeout(() => item.remove(), 2000);
        }

    } catch (err) {
        console.error(err);
        if(item) { item.innerHTML = `<span class="material-symbols-outlined text-red-500 text-sm">error</span> <span class="truncate flex-1 text-red-500">Erro: ${cleanPath}</span>`; }
    }
}

// ==========================================
// 4. AÇÕES E UTILITÁRIOS
// ==========================================
async function createFolder() {
    let name = prompt("Nome da nova pasta:");
    if (!name) return;
    name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_');
    
    const path = `${targetClientId}/${currentPath}${name}/.emptyFolderPlaceholder`;
    const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(path, new Blob(['']), { upsert: true });

    if (error) showToast("Erro ao criar pasta.", "error");
    else { listFiles(); }
}

async function downloadFile(name) {
    const fullPath = `${targetClientId}/${currentPath}${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(fullPath, 60, { download: true });
    
    if(data) {
        const a = document.createElement('a'); a.href = data.signedUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    } else { showToast("Erro ao gerar link.", "error"); }
}

async function deleteItem(name, isFolder) {
    if (!confirm(`Excluir "${name}"?`)) return;
    const basePath = `${targetClientId}/${currentPath}${name}`;

    try {
        if (isFolder) {
            showToast("Apagando conteúdo...", "info");
            const { data: files } = await supabaseClient.storage.from(BUCKET_NAME).list(basePath);
            if (files && files.length > 0) {
                const paths = files.map(f => `${basePath}/${f.name}`);
                await supabaseClient.storage.from(BUCKET_NAME).remove(paths);
            }
            // Tenta remover placeholder se existir
            await supabaseClient.storage.from(BUCKET_NAME).remove([`${basePath}/.emptyFolderPlaceholder`]);
        } else {
            await supabaseClient.storage.from(BUCKET_NAME).remove([basePath]);
        }
        showToast("Excluído.", "success");
        listFiles();
    } catch (err) { showToast("Erro ao excluir.", "error"); }
}

function enterFolder(name) { currentPath += name + "/"; listFiles(); updateBreadcrumb(); }
function goUp() { let p = currentPath.split('/').filter(x=>x); p.pop(); currentPath = p.length ? p.join('/')+'/' : ""; listFiles(); updateBreadcrumb(); }
function goHome() { currentPath = ""; listFiles(); updateBreadcrumb(); }

function updateBreadcrumb() {
    const el = document.getElementById('pathBreadcrumb');
    if(el) el.innerHTML = !currentPath ? `<span class="material-symbols-outlined text-[18px] align-middle">home</span> Início` : `<span onclick="goHome()" class="cursor-pointer hover:underline flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">home</span>Início</span> <span class="text-slate-300 mx-1">/</span> ${currentPath.replaceAll('/', ' <span class="text-slate-300">/</span> ').slice(0, -32)}`;
}

function setupDragAndDrop() {
    const dropArea = document.getElementById('drop-area');
    if(!dropArea) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => { dropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false); });
    ['dragenter', 'dragover'].forEach(() => dropArea.classList.add('dragover'));
    ['dragleave', 'drop'].forEach(() => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return { icon: 'picture_as_pdf', color: 'text-red-500' };
    if (['doc', 'docx', 'txt'].includes(ext)) return { icon: 'article', color: 'text-blue-600' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'table_view', color: 'text-green-600' };
    if (['jpg', 'png', 'jpeg', 'webp', 'svg'].includes(ext)) return { icon: 'image', color: 'text-purple-500' };
    if (['zip', 'rar'].includes(ext)) return { icon: 'folder_zip', color: 'text-orange-500' };
    return { icon: 'description', color: 'text-slate-400' };
}

function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function showToast(msg, type="info") {
    const bg = type === 'error' ? "#ef4444" : (type === 'success' ? "#10b981" : "#136dec");
    if (typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", style: { background: bg, borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" } }).showToast();
}
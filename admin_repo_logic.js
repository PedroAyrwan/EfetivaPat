// ==========================================
// ARQUIVO: admin_repo_logic.js (Versão v10 - Lógica "Força Bruta")
// ==========================================

const BUCKET_NAME = 'arquivo_clientes'; 
const urlParams = new URLSearchParams(window.location.search);
const targetClientId = urlParams.get('id');
let currentPath = ""; 

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> GERENCIADOR v10 (FORÇA BRUTA) INICIADO.");
    setTimeout(initSystem, 100);
});

async function initSystem() {
    if (typeof supabaseClient === 'undefined') {
        alert("Erro: config.js não carregou."); return;
    }

    // Verifica Sessão
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    // Verifica Admin
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') { 
        alert("Acesso Negado."); window.location.href = "repositorio_cliente.html"; return; 
    }

    // Verifica Cliente
    if (!targetClientId) {
        showToast("Erro: ID do cliente ausente.", "error"); return;
    }

    await loadClientInfo();
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
// 2. LÓGICA DO LEVANTAMENTO
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
        showToast("Criando estrutura de Levantamento...", "info");
        // Garante criação da pasta fotos
        const pathFotos = `${targetClientId}/Levantamento/fotos/.emptyFolderPlaceholder`;
        
        const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(pathFotos, new Blob(['']), { upsert: true });

        if (error) {
            showToast("Erro ao criar pastas.", "error");
            toggle.checked = false;
        } else {
            showToast("Levantamento Ativado!", "success");
            btn.classList.remove('hidden');
            if(currentPath === "") listFiles();
        }
    } else {
        btn.classList.add('hidden');
        showToast("Atalho desativado.", "info");
    }
}

function goToLevantamento() {
    window.location.href = `levantamento.html?id=${targetClientId}`;
}

// ==========================================
// 3. LISTAGEM
// ==========================================
async function listFiles() {
    const listBody = document.getElementById('filesListBody');
    if (!listBody) return;
    
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
            
            // Highlight pastas de sistema
            const isSystemFolder = isFolder && (item.name === 'Levantamento' || item.name === 'fotos');
            const rowClass = isSystemFolder ? "bg-indigo-50/60 dark:bg-indigo-900/10 border-indigo-100" : "";
            
            const tr = document.createElement('tr');
            tr.className = `hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 transition-colors group ${rowClass}`;
            if(isFolder) tr.onclick = () => enterFolder(item.name);

            tr.innerHTML = `
                <td class="py-3 px-6 cursor-pointer">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined ${iconData.color} text-2xl">${iconData.icon}</span>
                        <span class="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[200px] sm:max-w-xs">${item.name}</span>
                    </div>
                </td>
                <td class="py-3 px-6 text-xs text-slate-500 hidden sm:table-cell">${dateText}</td>
                <td class="py-3 px-6 text-xs text-slate-500 hidden md:table-cell">${sizeText}</td>
                <td class="py-3 px-6 text-right">
                    <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        ${!isFolder ? `<button onclick="downloadFile('${item.name}')" class="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors" title="Baixar"><span class="material-symbols-outlined">download</span></button>` : ''}
                        <button onclick="event.stopPropagation(); deleteItem('${item.name}', ${isFolder})" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Excluir"><span class="material-symbols-outlined">delete</span></button>
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Erro lista.</td></tr>`;
    }
}

// ==========================================
// 4. UPLOAD INTELIGENTE (CORRIGIDO)
// ==========================================
async function handleFiles(files) {
    if (!files || files.length === 0) return;
    showToast(`Processando ${files.length} itens...`, "info");

    const isLevantamentoContext = currentPath.startsWith('Levantamento');

    for (const file of files) {
        let finalFile = file;
        let finalName = file.name;
        let forcePath = null; // Se null, usa o currentPath

        const isImage = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name);
        const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);

        // --- LÓGICA RIGOROSA DO LEVANTAMENTO ---
        if (isLevantamentoContext) {
            
            // CASO 1: É IMAGEM -> Força ir para "Levantamento/fotos/"
            if (isImage) {
                console.log("Detectado: Imagem em Levantamento -> Redirecionando para fotos");
                forcePath = "Levantamento/fotos/";
                
                // Pergunta nome e número
                const renameData = await promptForLevantamentoRename(file.name);
                if (renameData) {
                    finalName = renameData.newName;
                    finalFile = new File([file], finalName, { type: file.type });
                } else if (renameData === null) {
                    // Usuário cancelou
                    continue; 
                }
            }

            // CASO 2: É EXCEL -> Força ir para "Levantamento/" (Raiz do levantamento)
            else if (isExcel) {
                console.log("Detectado: Excel em Levantamento -> Substituindo na raiz");
                forcePath = "Levantamento/";
                // Apaga planilhas antigas na raiz do levantamento antes de subir a nova
                await deleteOldSpreadsheetsInLevantamentoRoot();
            }
        }

        // Faz o upload (se forcePath existir, ele ignora onde o usuário está olhando)
        await uploadFile(finalFile, finalName, forcePath);
    }

    showToast("Finalizado!", "success");
    listFiles(); // Atualiza a visualização
    
    // Limpa inputs
    if(document.getElementById('fileElem')) document.getElementById('fileElem').value = '';
}

// Apaga APENAS planilhas na raiz do Levantamento
async function deleteOldSpreadsheetsInLevantamentoRoot() {
    const rootPath = `${targetClientId}/Levantamento/`;
    const { data: files } = await supabaseClient.storage.from(BUCKET_NAME).list(rootPath);
    
    if (files && files.length > 0) {
        const spreadsheets = files.filter(f => f.name.match(/\.(xlsx|xls|csv)$/i));
        if (spreadsheets.length > 0) {
            showToast("Substituindo planilha antiga...", "info");
            const paths = spreadsheets.map(f => `${rootPath}${f.name}`);
            await supabaseClient.storage.from(BUCKET_NAME).remove(paths);
        }
    }
}

async function promptForLevantamentoRename(originalName) {
    // Delay para a UI não travar
    await new Promise(r => setTimeout(r, 100));

    const itemName = prompt(`CONFIGURANDO FOTO: ${originalName}\n\nDigite o NOME do Item (ex: Cadeira):`);
    if (itemName === null) return null; // Cancelar
    if (itemName.trim() === "") return false; // Manter original

    const itemNum = prompt(`Digite o NÚMERO do Item (ex: 03):`);
    if (itemNum === null) return null; 

    const isItemPhoto = confirm(`Essa foto é do ITEM (${itemName})?\n\n[OK] = Sim, Foto do Item\n[CANCELAR] = Não, Foto do Número/Etiqueta`);
    
    const safeItemName = itemName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "_");
    const safeItemNum = itemNum.trim().replace(/[^0-9]/g, "");
    const ext = originalName.split('.').pop().toLowerCase();

    let newFileName = "";
    if (isItemPhoto) {
        newFileName = `foto_${safeItemName}.${ext}`;
    } else {
        newFileName = `foto_numero_${safeItemNum}.${ext}`;
    }

    return { newName: newFileName };
}

// Upload com opção de Override Path
async function uploadFile(file, fileName, overridePath = null) {
    // Se overridePath existe, usa ele. Se não, usa currentPath.
    // .replace(/\/$/, "") remove barra no final para evitar duplicidade na concatenação
    let pathPart = overridePath !== null ? overridePath : currentPath;
    
    // Garante que o path termine com / se não for vazio
    if (pathPart && !pathPart.endsWith('/')) pathPart += '/';

    const cleanName = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Caminho completo: ID_CLIENTE / PASTA / ARQUIVO
    const fullPath = `${targetClientId}/${pathPart}${cleanName}`.replace(/\/+/g, '/');

    // UI de Progresso
    const container = document.getElementById('upload-progress-container');
    const pid = 'prog-' + Math.random().toString(36).substr(2, 9);
    if (container) {
        container.classList.remove('hidden');
        container.insertAdjacentHTML('afterbegin', `
            <div id="${pid}" class="bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-3 text-xs mb-2">
                <span class="material-symbols-outlined text-primary text-sm animate-spin">sync</span>
                <span class="truncate flex-1 font-mono">${cleanName}</span>
                <span class="text-[9px] text-slate-400 bg-slate-100 px-1 rounded">${pathPart || 'Raiz'}</span>
            </div>
        `);
    }
    const item = document.getElementById(pid);

    try {
        const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(fullPath, file, { cacheControl: '3600', upsert: true });

        if (error) throw error;

        if(item) {
            item.innerHTML = `<span class="material-symbols-outlined text-green-500 text-sm">check_circle</span> <span class="truncate flex-1 text-slate-600">${cleanName}</span>`;
            setTimeout(() => item.remove(), 2500);
        }

    } catch (err) {
        console.error("Erro Upload:", err);
        if(item) { item.innerHTML = `<span class="material-symbols-outlined text-red-500 text-sm">error</span> <span class="truncate flex-1 text-red-500">Falha</span>`; }
    }
}

// ==========================================
// 5. FUNÇÕES PADRÃO (CreateFolder, Delete, etc)
// ==========================================
async function createFolder() {
    let name = prompt("Nome da nova pasta:");
    if (!name) return;
    name = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_');
    
    const path = `${targetClientId}/${currentPath}${name}/.emptyFolderPlaceholder`;
    const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(path, new Blob(['']), { upsert: true });

    if (error) showToast("Erro ao criar.", "error"); else listFiles();
}

async function downloadFile(name) {
    const fullPath = `${targetClientId}/${currentPath}${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(fullPath, 60, { download: true });
    if(data) {
        const a = document.createElement('a'); a.href = data.signedUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    } else { showToast("Erro link.", "error"); }
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
    if(el) el.innerHTML = !currentPath ? `<span class="material-symbols-outlined text-[18px] align-middle">home</span> Início` : `<span onclick="goHome()" class="cursor-pointer hover:underline flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">home</span>Início</span> <span class="text-slate-300 mx-1">/</span> ${currentPath.replaceAll('/', ' / ').slice(0, -3)}`;
}

function setupDragAndDrop() {
    const dropArea = document.getElementById('drop-area');
    if(!dropArea) return;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => { dropArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false); });
    dropArea.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
}

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return { icon: 'picture_as_pdf', color: 'text-red-500' };
    if (['doc', 'docx', 'txt'].includes(ext)) return { icon: 'article', color: 'text-blue-600' };
    if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'table_view', color: 'text-green-600' };
    if (['jpg', 'png', 'jpeg', 'webp', 'svg'].includes(ext)) return { icon: 'image', color: 'text-purple-500' };
    return { icon: 'description', color: 'text-slate-400' };
}

function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function showToast(msg, type="info") {
    const bg = type === 'error' ? "#ef4444" : (type === 'success' ? "#10b981" : "#136dec");
    if (typeof Toastify !== 'undefined') Toastify({ text: msg, duration: 3000, gravity: "top", position: "right", style: { background: bg, borderRadius: "8px" } }).showToast();
}
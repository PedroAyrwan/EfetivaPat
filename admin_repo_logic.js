// ==========================================
// ARQUIVO: admin_repo_logic.js (Versão v11 - Debug e Força Bruta)
// ==========================================

const BUCKET_NAME = 'arquivo_clientes'; 
const urlParams = new URLSearchParams(window.location.search);
const targetClientId = urlParams.get('id');
let currentPath = ""; 

// 1. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    // ESTE ALERTA DEVE APARECER AO RECARREGAR A PÁGINA
    console.log("SISTEMA V11 CARREGADO");
    setTimeout(initSystem, 500);
});

async function initSystem() {
    if (typeof supabaseClient === 'undefined') { alert("Erro: config.js não carregou."); return; }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') { alert("Acesso Negado."); window.location.href = "repositorio_cliente.html"; return; }

    if (!targetClientId) { showToast("Erro: ID cliente não encontrado.", "error"); return; }

    await loadClientInfo();
    await checkLevantamentoStatus(); 
    await listFiles();
    setupDragAndDrop();
}

async function loadClientInfo() {
    try {
        const { data: client } = await supabaseClient.from('profiles').select('name, email').eq('id', targetClientId).single();
        if (client) {
            document.getElementById('clientEmailDisplay').innerText = client.name || client.email;
            document.getElementById('pageTitle').innerText = `Arquivos de ${(client.name || client.email).split(' ')[0]}`;
        }
    } catch (e) { console.error(e); }
}

// 2. LÓGICA DO LEVANTAMENTO (Pastas)
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
        showToast("Criando pastas Levantamento e fotos...", "info");
        // Cria Levantamento/fotos/.emptyFolderPlaceholder
        const path = `${targetClientId}/Levantamento/fotos/.emptyFolderPlaceholder`;
        const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(path, new Blob(['']), { upsert: true });
        
        if (!error) {
            showToast("Estrutura criada!", "success");
            btn.classList.remove('hidden');
            if(currentPath === "") listFiles();
        } else {
            showToast("Erro ao criar pastas.", "error");
            toggle.checked = false;
        }
    } else {
        btn.classList.add('hidden');
        showToast("Desativado visualmente.", "info");
    }
}

function goToLevantamento() { window.location.href = `levantamento.html?id=${targetClientId}`; }

// 3. UPLOAD INTELIGENTE (O CORAÇÃO DO PROBLEMA)
async function handleFiles(files) {
    if (!files || files.length === 0) return;
    
    // Detecta se estamos dentro de "Levantamento" (Raiz ou Subpasta)
    // Se currentPath for vazio, verifica se a pasta selecionada visualmente é Levantamento (caso raro)
    const isInLevantamento = currentPath.startsWith('Levantamento');

    showToast(`Analisando ${files.length} arquivos...`, "info");

    for (const file of files) {
        let fileToUpload = file;
        let finalName = file.name;
        let destinationPath = currentPath; // Padrão: onde o usuário está

        const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name);
        const isSpreadsheet = /\.(xlsx|xls|csv)$/i.test(file.name);

        // --- LÓGICA ESPECIAL PARA LEVANTAMENTO ---
        if (isInLevantamento) {
            
            // CASO A: É UMA FOTO
            if (isImage) {
                // Força o destino para a pasta 'fotos', não importa onde esteja
                destinationPath = "Levantamento/fotos/";
                
                // Pergunta os dados
                const renameData = await promptRenameImage(file.name);
                if (renameData) {
                    finalName = renameData.newName;
                    // Recria o arquivo com o novo nome
                    fileToUpload = new File([file], finalName, { type: file.type });
                    showToast(`Renomeado para: ${finalName}`, "success");
                } else if (renameData === null) {
                    continue; // Cancelou upload
                }
            }

            // CASO B: É PLANILHA
            else if (isSpreadsheet) {
                // Força o destino para a raiz do Levantamento
                destinationPath = "Levantamento/";
                
                // Apaga a planilha anterior ANTES de subir a nova
                await deleteOldSpreadsheet();
            }
        }

        // Executa o upload com o destino calculado
        await uploadFileToPath(fileToUpload, finalName, destinationPath);
    }

    listFiles();
    if(document.getElementById('fileElem')) document.getElementById('fileElem').value = '';
}

// Pergunta dados da foto
async function promptRenameImage(originalName) {
    // Pequeno delay para UI
    await new Promise(r => setTimeout(r, 50));

    const nomeItem = prompt(`ARQUIVO: ${originalName}\n\nDigite o NOME do Item (ex: Cadeira):`);
    if (nomeItem === null) return null; // Cancelou
    if (nomeItem.trim() === "") return false; // Não quis renomear

    const numItem = prompt(`Digite o NÚMERO do Item (ex: 03):`);
    if (numItem === null) return null;

    const isItem = confirm(`É a foto do ITEM (${nomeItem})?\n\n[OK] = Sim, foto do Item\n[CANCELAR] = Não, foto da Etiqueta/Número`);

    const safeName = nomeItem.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "_");
    const safeNum = numItem.replace(/[^0-9]/g, "");
    const ext = originalName.split('.').pop();

    if (isItem) {
        return { newName: `foto_${safeName}.${ext}` };
    } else {
        return { newName: `foto_numero_${safeNum}.${ext}` };
    }
}

// Apaga planilhas antigas na raiz Levantamento
async function deleteOldSpreadsheet() {
    showToast("Verificando planilhas antigas...", "info");
    const path = `${targetClientId}/Levantamento/`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).list(path);
    
    if(data && data.length > 0) {
        const toDelete = data
            .filter(f => f.name.match(/\.(xlsx|xls|csv)$/i))
            .map(f => `${path}${f.name}`);
            
        if(toDelete.length > 0) {
            await supabaseClient.storage.from(BUCKET_NAME).remove(toDelete);
            showToast("Planilha anterior removida.", "info");
        }
    }
}

// Função de Upload Genérica
async function uploadFileToPath(file, fileName, folderPath) {
    // Garante barra no final do path
    if (folderPath && !folderPath.endsWith('/')) folderPath += '/';
    
    const cleanName = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = `${targetClientId}/${folderPath}${cleanName}`.replace(/\/+/g, '/'); // Remove barras duplas

    const toastId = showToast(`Enviando ${cleanName}...`, "info");

    try {
        const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(fullPath, file, { upsert: true });
        if(error) throw error;
        // Sucesso silencioso para não spammar
    } catch (err) {
        console.error(err);
        showToast(`Erro no envio: ${cleanName}`, "error");
    }
}

// 4. LISTAGEM E UTILITÁRIOS
async function listFiles() {
    const tbody = document.getElementById('filesListBody');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8">Carregando...</td></tr>';

    const path = currentPath ? `${targetClientId}/${currentPath}` : `${targetClientId}`;

    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).list(path, { sortBy: { column: 'name', order: 'asc' } });

    if(error) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-red-500">Erro ao listar.</td></tr>'; return; }

    tbody.innerHTML = '';
    
    if(currentPath !== "") {
        tbody.innerHTML += `<tr onclick="goUp()" class="cursor-pointer hover:bg-slate-100 border-b"><td class="py-3 px-6 font-bold" colspan="4">⬅ Voltar</td></tr>`;
    }

    const items = data.filter(i => i.name !== '.emptyFolderPlaceholder');
    if(items.length === 0) {
        tbody.innerHTML += `<tr><td colspan="4" class="text-center py-8 text-slate-400">Pasta Vazia</td></tr>`;
        return;
    }

    items.forEach(item => {
        const isFolder = !item.id;
        const icon = isFolder ? '📁' : (item.name.match(/\.(jpg|png)$/i) ? '🖼️' : '📄');
        
        // Se for a pasta fotos ou Levantamento, destaca
        const isSpecial = (item.name === 'Levantamento' || item.name === 'fotos') && isFolder;
        const style = isSpecial ? 'background-color: #eff6ff;' : '';

        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-slate-50 cursor-pointer';
        row.style = style;
        if(isFolder) row.onclick = () => enterFolder(item.name);

        row.innerHTML = `
            <td class="py-3 px-6 flex items-center gap-2">${icon} ${item.name}</td>
            <td class="py-3 px-6 hidden sm:table-cell">${item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
            <td class="py-3 px-6 hidden md:table-cell">${isFolder ? '-' : formatBytes(item.metadata.size)}</td>
            <td class="py-3 px-6 text-right">
                ${!isFolder ? `<button onclick="downloadFile('${item.name}')" class="text-blue-500 mr-2">⬇</button>` : ''}
                <button onclick="event.stopPropagation(); deleteItem('${item.name}', ${isFolder})" class="text-red-500">✖</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Funções de Navegação
function enterFolder(name) { currentPath += name + "/"; listFiles(); updateBreadcrumb(); }
function goUp() { let p = currentPath.split('/').filter(x=>x); p.pop(); currentPath = p.length ? p.join('/')+'/' : ""; listFiles(); updateBreadcrumb(); }
function goHome() { currentPath = ""; listFiles(); updateBreadcrumb(); }
function updateBreadcrumb() { 
    const el = document.getElementById('pathBreadcrumb');
    if(el) el.innerHTML = currentPath ? `Início / ${currentPath}` : `Início`;
}

// Utilitários
async function createFolder() {
    let name = prompt("Nome da pasta:");
    if(!name) return;
    const path = `${targetClientId}/${currentPath}${name}/.emptyFolderPlaceholder`;
    await supabaseClient.storage.from(BUCKET_NAME).upload(path, new Blob(['']), {upsert:true});
    listFiles();
}
async function deleteItem(name, isFolder) {
    if(!confirm(`Excluir ${name}?`)) return;
    const path = `${targetClientId}/${currentPath}${name}`;
    if(isFolder) {
        const {data} = await supabaseClient.storage.from(BUCKET_NAME).list(path);
        const files = data.map(f => `${path}/${f.name}`);
        if(files.length) await supabaseClient.storage.from(BUCKET_NAME).remove(files);
        await supabaseClient.storage.from(BUCKET_NAME).remove([`${path}/.emptyFolderPlaceholder`]);
    } else {
        await supabaseClient.storage.from(BUCKET_NAME).remove([path]);
    }
    listFiles();
}
async function downloadFile(name) {
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(`${targetClientId}/${currentPath}${name}`, 60, {download: true});
    if(data) window.open(data.signedUrl, '_blank');
}
function formatBytes(bytes) { if(bytes==0) return '0 B'; const k=1024, sizes=['B','KB','MB'], i=Math.floor(Math.log(bytes)/Math.log(k)); return parseFloat((bytes/Math.pow(k,i)).toFixed(1))+' '+sizes[i]; }
function setupDragAndDrop() {
    const d = document.getElementById('drop-area');
    if(!d) return;
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('bg-blue-50'); });
    d.addEventListener('dragleave', e => { e.preventDefault(); d.classList.remove('bg-blue-50'); });
    d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('bg-blue-50'); handleFiles(e.dataTransfer.files); });
}
function showToast(msg, type) {
    if(typeof Toastify !== 'undefined') Toastify({text: msg, duration: 3000, style: {background: type=='error'?'#ef4444':'#10b981'}}).showToast();
}
// repo_logic.js - Versão com Visualização de PDF

const { createClient } = supabase;
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

// BUCKET CONFIG
const BUCKET_NAME = 'arquivo_clientes'; 
const urlParams = new URLSearchParams(window.location.search);
const targetUserId = urlParams.get('id');

let currentPath = ""; 

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
async function initRepo() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    const { data: adminProfile } = await supabaseClient
        .from("profiles").select("role").eq("id", session.user.id).single();

    if (adminProfile.role !== 'admin') {
        alert("Acesso restrito.");
        window.location.href = "client.html";
        return;
    }

    if (!targetUserId) {
        alert("Cliente não especificado.");
        window.location.href = "admin.html";
        return;
    }

    loadClientInfo();
    setupDragAndDrop(); 
    listFiles();
}

async function loadClientInfo() {
    const { data: client } = await supabaseClient
        .from('profiles').select('name, email').eq('id', targetUserId).single();
    if (client) {
        document.getElementById('clientNameBreadcrumb').innerText = client.name || client.email;
    }
}

// ==========================================
// 2. DRAG AND DROP VISUAL
// ==========================================
function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    fileInput.addEventListener('dragenter', () => {
        dropZone.classList.add('border-primary', 'bg-blue-50', 'dark:bg-slate-700', 'scale-[1.02]');
        dropZone.classList.remove('border-slate-300', 'dark:border-slate-600');
    });

    fileInput.addEventListener('dragleave', () => {
        resetDropZoneStyle();
    });

    fileInput.addEventListener('drop', () => {
        resetDropZoneStyle();
    });

    function resetDropZoneStyle() {
        dropZone.classList.remove('border-primary', 'bg-blue-50', 'dark:bg-slate-700', 'scale-[1.02]');
        dropZone.classList.add('border-slate-300', 'dark:border-slate-600');
    }
}

// ==========================================
// 3. NAVEGAÇÃO E UPLOAD
// ==========================================
function enterFolder(folderName) {
    currentPath += folderName + "/";
    updatePathDisplay();
    listFiles();
}

function goHome() {
    currentPath = "";
    updatePathDisplay();
    listFiles();
}

function goUp() {
    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    currentPath = parts.length > 0 ? parts.join('/') + "/" : "";
    updatePathDisplay();
    listFiles();
}

function updatePathDisplay() {
    const display = document.getElementById('currentPathDisplay');
    display.innerText = currentPath === "" ? "Início" : "Início / " + currentPath.slice(0, -1).replaceAll('/', ' / ');
}

async function createNewFolder() {
    const folderName = prompt("Digite o nome da nova pasta:");
    if (!folderName) return;
    const safeName = folderName.replace(/[^a-zA-Z0-9.\-_ ]/g, "").trim();
    if (!safeName) { alert("Nome inválido."); return; }

    try {
        const fullPath = `${targetUserId}/${currentPath}${safeName}/.keep`;
        const emptyFile = new File([""], ".keep", { type: "text/plain" });
        await supabaseClient.storage.from(BUCKET_NAME).upload(fullPath, emptyFile);
        listFiles();
    } catch (err) {
        alert("Erro: " + err.message);
    }
}

async function uploadFile(file) {
    if (!file) return;
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';

    try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const filePath = `${targetUserId}/${currentPath}${safeName}`;

        const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

        if (error) throw error;
        progressBar.style.width = '100%';
        setTimeout(() => { progressContainer.classList.add('hidden'); }, 1000);
        listFiles();
    } catch (err) {
        alert('Erro: ' + err.message);
        progressContainer.classList.add('hidden');
    } finally {
        document.getElementById('fileInput').value = "";
    }
}

// ==========================================
// 4. LISTAGEM (COM BOTÃO VISUALIZAR PDF)
// ==========================================
async function listFiles() {
    const listBody = document.getElementById('filesListBody');
    const countSpan = document.getElementById('fileCount');
    listBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Carregando...</td></tr>';

    try {
        let searchPath = targetUserId + '/' + currentPath;
        if (searchPath.endsWith('/')) {
            searchPath = searchPath.slice(0, -1);
        }

        const { data, error } = await supabaseClient
            .storage
            .from(BUCKET_NAME)
            .list(searchPath, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'name', order: 'asc' },
            });

        if (error) throw error;
        listBody.innerHTML = '';

        if (currentPath !== "") {
            listBody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer" onclick="goUp()">
                    <td class="py-3 px-6"><span class="material-symbols-outlined text-slate-400">arrow_upward</span></td>
                    <td class="py-3 px-6 font-semibold text-slate-600 dark:text-slate-300">.. (Voltar)</td>
                    <td class="py-3 px-6"></td><td class="py-3 px-6"></td>
                </tr>`;
        }

        if (!data || data.length === 0) {
            countSpan.innerText = "Pasta vazia";
            return;
        }

        const folders = data.filter(item => !item.id); 
        const files = data.filter(item => item.id && item.name !== '.keep');

        countSpan.innerText = `${folders.length} pastas, ${files.length} arquivos`;

        // Renderiza PASTAS
        folders.forEach(folder => {
            const row = `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700 group">
                    <td class="py-3 px-6 cursor-pointer" onclick="enterFolder('${folder.name}')">
                        <span class="material-symbols-outlined text-yellow-500 fill-current">folder</span>
                    </td>
                    <td class="py-3 px-6 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer" onclick="enterFolder('${folder.name}')">
                        ${folder.name}
                    </td>
                    <td class="py-3 px-6 text-xs text-slate-400">-</td>
                    <td class="py-3 px-6 text-right">
                        <button onclick="deleteFolder('${folder.name}')" class="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors" title="Excluir Pasta">
                            <span class="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                    </td>
                </tr>
            `;
            listBody.insertAdjacentHTML('beforeend', row);
        });

        // Renderiza ARQUIVOS
        for (const file of files) {
            const fullPath = `${targetUserId}/${currentPath}${file.name}`;
            const { data: publicUrl } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(fullPath);
            const sizeKB = (file.metadata.size / 1024).toFixed(1) + ' KB';
            
            // --- LÓGICA DO VISUALIZAR (NOVO) ---
            const isPdf = file.name.toLowerCase().endsWith('.pdf');
            let previewButton = '';
            
            // Se for PDF, cria o botão de Olho
            if (isPdf) {
                previewButton = `
                    <a href="${publicUrl.publicUrl}" target="_blank" class="p-1.5 text-slate-400 hover:text-primary rounded hover:bg-blue-50 transition-colors" title="Visualizar PDF">
                        <span class="material-symbols-outlined text-[20px]">visibility</span>
                    </a>
                `;
            }

            const row = `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700">
                    <td class="py-3 px-6"><span class="material-symbols-outlined text-blue-400">description</span></td>
                    <td class="py-3 px-6 text-sm text-slate-700 dark:text-slate-300">${file.name}</td>
                    <td class="py-3 px-6 text-xs text-slate-500 hidden sm:table-cell">${sizeKB}</td>
                    <td class="py-3 px-6 text-right">
                        <div class="flex justify-end gap-2">
                            ${previewButton}
                            
                            <a href="${publicUrl.publicUrl}" target="_blank" class="p-1.5 text-slate-400 hover:text-green-600 rounded hover:bg-green-50" title="Baixar">
                                <span class="material-symbols-outlined text-[20px]">download</span>
                            </a>
                            
                            <button onclick="deleteFile('${file.name}')" class="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50" title="Excluir">
                                <span class="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            listBody.insertAdjacentHTML('beforeend', row);
        }

    } catch (err) {
        console.error(err);
    }
}

// ==========================================
// 5. EXCLUSÃO
// ==========================================

async function deleteFile(fileName) {
    if (!confirm(`Excluir "${fileName}"?`)) return;
    try {
        const fullPath = `${targetUserId}/${currentPath}${fileName}`;
        const { error } = await supabaseClient.storage.from(BUCKET_NAME).remove([fullPath]);
        if (error) throw error;
        listFiles();
    } catch (err) {
        alert("Erro: " + err.message);
    }
}

async function deleteFolder(folderName) {
    if (!confirm(`Tem certeza? Isso apagará a pasta "${folderName}" e TODOS os arquivos dentro dela!`)) return;

    try {
        let folderPathList = `${targetUserId}/${currentPath}${folderName}`; 
        await deleteFolderContentsRecursive(folderPathList);
        listFiles();

    } catch (err) {
        alert("Erro ao excluir pasta: " + err.message);
    }
}

async function deleteFolderContentsRecursive(pathPrefix) {
    const { data, error } = await supabaseClient.storage.from(BUCKET_NAME).list(pathPrefix);
    
    if (error) throw error;
    if (!data || data.length === 0) return;

    const filesToDelete = [];
    const subFolders = [];

    data.forEach(item => {
        if (item.id) {
            filesToDelete.push(`${pathPrefix}/${item.name}`);
        } else {
            subFolders.push(`${pathPrefix}/${item.name}`);
        }
    });

    if (filesToDelete.length > 0) {
        await supabaseClient.storage.from(BUCKET_NAME).remove(filesToDelete);
    }

    for (const subFolder of subFolders) {
        await deleteFolderContentsRecursive(subFolder);
    }
}

initRepo();
// ==========================================
// ARQUIVO: repositorio_logic.js (Cliente - Com Ícones Personalizados)
// ==========================================

const { createClient } = supabase;

// CONFIGURAÇÕES
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'arquivo_clientes'; 
let currentUserId = null;
let currentPath = ""; 

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> SISTEMA INICIADO.");
    initSystem();
});

async function initSystem() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    currentUserId = session.user.id;

    loadUserProfile(currentUserId);
    listFiles();
    setupChat();
    setupSearch();
}

// ==========================================
// 2. FUNÇÃO BAIXAR TUDO (ZIP)
// ==========================================
async function downloadAllFiles() {
    const searchPath = currentPath ? `${currentUserId}/${currentPath}` : currentUserId;
    
    Toastify({ text: "Preparando download...", duration: 3000, gravity: "top", position: "center", style: { background: "#136dec" } }).showToast();
    
    const { data: files, error } = await supabaseClient.storage.from(BUCKET_NAME).list(searchPath);

    if (error || !files || files.length === 0) {
        Toastify({ text: "Nenhum arquivo para baixar.", duration: 3000, style: { background: "#ef4444" } }).showToast();
        return;
    }

    const zip = new JSZip();
    let count = 0;

    for (const file of files) {
        if (file.name === '.emptyFolderPlaceholder' || !file.id) continue;

        const fullPath = searchPath + (searchPath.endsWith('/') ? '' : '/') + file.name;
        const { data: blob } = await supabaseClient.storage.from(BUCKET_NAME).download(fullPath);
        
        if (blob) {
            zip.file(file.name, blob);
            count++;
        }
    }

    if (count === 0) {
        Toastify({ text: "A pasta está vazia.", duration: 3000, style: { background: "#f59e0b" } }).showToast();
        return;
    }

    Toastify({ text: "Compactando arquivos...", duration: 3000, style: { background: "#136dec" } }).showToast();
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "arquivos_efetivapat.zip");
}

// ==========================================
// 3. PESQUISA
// ==========================================
function setupSearch() {
    const searchInput = document.getElementById('searchDrive'); 
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#filesListBody tr');

        rows.forEach(row => {
            if (row.innerText.includes('.. (Voltar)') || row.innerText.includes('Nenhum arquivo')) return;
            const nameCell = row.querySelector('td'); 
            if (nameCell) {
                const text = nameCell.innerText.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            }
        });
    });
}

// ==========================================
// 4. LISTAGEM DE ARQUIVOS (COM ÍCONES)
// ==========================================
async function listFiles() {
    const listBody = document.getElementById('filesListBody');
    if (!listBody) return;

    listBody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400">Carregando...</td></tr>`;

    const searchPath = currentPath ? `${currentUserId}/${currentPath}` : currentUserId;

    const { data, error } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .list(searchPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (error) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Erro de acesso.</td></tr>`;
        return;
    }

    listBody.innerHTML = '';

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
            // === PASTA ===
            listBody.innerHTML += `
                <tr class="hover:bg-slate-50 cursor-pointer border-b" onclick="enterFolder('${item.name}')">
                    <td class="py-3 px-4 font-medium text-slate-700 flex items-center gap-2">
                        <span class="material-symbols-outlined text-yellow-500 text-3xl">folder</span> 
                        <span class="text-base">${item.name}</span>
                    </td>
                    <td>-</td><td>-</td><td></td>
                </tr>`;
        } else {
            // === ARQUIVO ===
            const size = formatBytes(item.metadata.size);
            const date = new Date(item.created_at).toLocaleDateString('pt-BR');
            const ext = item.name.split('.').pop().toLowerCase();
            const isDoc = ['doc', 'docx', 'xls', 'xlsx'].includes(ext);

            // GERA O ÍCONE PERSONALIZADO AQUI
            const iconData = getFileIcon(item.name);

            let viewButtonHTML = '';
            if (!isDoc) {
                viewButtonHTML = `
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
                    <td class="text-sm text-slate-500">${date}</td>
                    <td class="text-sm text-slate-500">${size}</td>
                    <td class="text-right px-4">
                        <div class="flex justify-end gap-2">
                            ${viewButtonHTML}
                            <button onclick="downloadFile('${item.name}')" class="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors" title="Baixar">
                                <span class="material-symbols-outlined text-[20px]">download</span>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }
    });
}

// ==========================================
// 5. HELPER: ÍCONES POR TIPO DE ARQUIVO
// ==========================================
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();

    // PDF
    if (ext === 'pdf') {
        return { icon: 'picture_as_pdf', color: 'text-red-500' };
    }
    // Word / Texto
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) {
        return { icon: 'article', color: 'text-blue-600' };
    }
    // Excel / CSV
    if (['xls', 'xlsx', 'csv', 'xml'].includes(ext)) {
        return { icon: 'table_view', color: 'text-green-600' };
    }
    // Imagens
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        return { icon: 'image', color: 'text-purple-500' };
    }
    // Compactados (Zip/Rar)
    if (['zip', 'rar', '7z'].includes(ext)) {
        return { icon: 'folder_zip', color: 'text-yellow-600' };
    }
    // Padrão (Outros)
    return { icon: 'draft', color: 'text-slate-400' };
}

// ==========================================
// 6. AÇÕES INDIVIDUAIS
// ==========================================
function enterFolder(name) { currentPath += name + "/"; listFiles(); }
function goUp() { 
    const p = currentPath.split('/').filter(x=>x); 
    p.pop(); 
    currentPath = p.length ? p.join('/')+'/' : ""; 
    listFiles(); 
}
async function viewFile(name) {
    const full = currentPath ? `${currentUserId}/${currentPath}${name}` : `${currentUserId}/${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(full, 60);
    if(data) window.open(data.signedUrl, '_blank');
}
async function downloadFile(name) {
    const full = currentPath ? `${currentUserId}/${currentPath}${name}` : `${currentUserId}/${name}`;
    const { data } = await supabaseClient.storage.from(BUCKET_NAME).createSignedUrl(full, 60, { download: true });
    if(data) window.open(data.signedUrl, '_blank');
}

// ==========================================
// 7. UTILITÁRIOS E CHAT
// ==========================================
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function loadUserProfile(uid) {
    const { data } = await supabaseClient.from('profiles').select('name, email').eq('id', uid).single();
    if(data) {
        const el = document.getElementById('userName'); 
        if(el) el.innerText = data.name || data.email;
    }
}

document.getElementById('btnProfileLogout')?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
});

function setupChat() {
    window.toggleChat = function() {
        const win = document.getElementById('chat-window');
        if(win) win.classList.toggle('hidden');
    }

    window.handleChatSubmit = async function(e) {
        e.preventDefault();
        const inp = document.getElementById('chat-input');
        const txt = inp.value.trim();
        if(!txt) return;

        addMsg(txt, 'user');
        inp.value = '';

        setTimeout(() => {
            const count = document.querySelectorAll('#filesListBody tr').length;
            let resp = "Sou uma IA simples. Pergunte quantos arquivos tem.";
            if(txt.toLowerCase().includes('quantos') || txt.toLowerCase().includes('total')) resp = `Vejo ${count} itens na lista.`;
            addMsg(resp, 'ai');
        }, 800);
    }
}

function addMsg(txt, sender) {
    const box = document.getElementById('chat-messages');
    const style = sender === 'user' ? "bg-primary text-white self-end" : "bg-white text-slate-700 border";
    box.innerHTML += `<div class="p-3 rounded-lg text-sm mb-2 max-w-[85%] ${style}">${txt}</div>`;
    box.scrollTop = box.scrollHeight;
}
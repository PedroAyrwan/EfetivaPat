// ==========================================
// ARQUIVO: admin_logic.js (Versão Final e Corrigida)
// ==========================================

const { createClient } = supabase;

// CONFIGURAÇÕES
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'arquivo_clientes';
const STORAGE_LIMIT_MB = 500; 

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> PAINEL ADMIN INICIADO.");
    initDashboard();
});

async function initDashboard() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') { 
        alert("Acesso Negado."); window.location.href = "index.html"; return; 
    }

    document.getElementById('btnVoltar')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = "index.html";
    });

    loadDashboardData();
}

// ==========================================
// 2. CARREGAMENTO DOS DADOS
// ==========================================
async function loadDashboardData() {
    const tableBody = document.getElementById('usersTableBody');
    if(tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Carregando dados...</td></tr>`;

    try {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        updateStatsCards(users);
        renderTable(users);
        
        // Inicia o cálculo silenciosamente
        calculateAllStorage(users);

    } catch (err) {
        console.error("Erro Fatal:", err);
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4">Erro de conexão.</td></tr>`;
    }
}

function updateStatsCards(users) {
    const total = users.length;
    const admins = users.filter(u => u.role === 'admin').length;
    const clients = users.filter(u => u.role === 'client').length;

    setText('totalCount', total);
    setText('adminCount', admins);
    setText('clientCount', clients);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if(el) el.innerText = value;
}

function renderTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    tableBody.innerHTML = '';

    users.forEach(user => {
        const initials = (user.email || 'U').substring(0, 2).toUpperCase();
        const name = user.name || user.email.split('@')[0];
        const isClient = user.role === 'client';
        
        const badgeClass = isClient 
            ? "bg-blue-100 text-blue-700 border-blue-200" 
            : "bg-purple-100 text-purple-700 border-purple-200";
        const roleName = isClient ? "Cliente" : "Admin";
        const avatarClass = isClient ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600";
        
        const folderBtn = isClient 
            ? `<a href="repositorio_admin.html?id=${user.id}" class="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" title="Abrir Arquivos"><span class="material-symbols-outlined text-lg">folder_open</span></a>`
            : `<span class="p-2 w-9"></span>`;

        const usageId = `disk-usage-${user.id}`;

        const row = `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td class="py-3 px-6 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full ${avatarClass} flex items-center justify-center text-sm font-bold shadow-sm">
                        ${initials}
                    </div>
                    <div><p class="font-bold text-slate-700 text-sm">${name}</p></div>
                </td>
                <td class="py-3 px-6 text-sm text-slate-500 hidden sm:table-cell">${user.email}</td>
                <td class="py-3 px-6 hidden md:table-cell">
                    <span class="px-2 py-1 rounded text-xs font-bold border ${badgeClass}">${roleName}</span>
                </td>
                <td class="py-3 px-6 text-sm font-medium text-slate-500">
                    <span id="${usageId}" class="text-xs text-slate-400 animate-pulse">Calc...</span>
                </td>
                <td class="py-3 px-6 text-right">
                    <div class="flex justify-end gap-1">
                        ${folderBtn}
                        <a href="edit_usuario.html?id=${user.id}" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><span class="material-symbols-outlined text-lg">edit</span></a>
                    </div>
                </td>
            </tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// ==========================================
// 3. CÁLCULO DE ARMAZENAMENTO RECURSIVO
// ==========================================
async function calculateAllStorage(users) {
    let globalBytes = 0;

    for (const user of users) {
        const cell = document.getElementById(`disk-usage-${user.id}`);
        
        if (user.role === 'client') {
            // Chama o scanner recursivo
            const bytes = await getFolderSize(user.id, ""); 
            
            if(cell) {
                cell.innerText = formatBytes(bytes);
                cell.classList.remove('text-slate-400', 'animate-pulse');
                cell.classList.add('text-slate-700');
                
                // Fica vermelho se passar de 400MB
                if(bytes > 1024 * 1024 * 400) cell.classList.add('text-red-600', 'font-bold'); 
            }
            globalBytes += bytes;
        } else {
            if(cell) {
                cell.innerText = "-";
                cell.classList.remove('animate-pulse');
            }
        }
    }

    // Atualiza o card total no topo
    const totalMB = globalBytes / (1024 * 1024);
    const percent = (totalMB / STORAGE_LIMIT_MB) * 100;
    
    setText('storagePercent', percent.toFixed(1) + '%');
    setText('storageUsed', `${totalMB.toFixed(1)}MB / ${STORAGE_LIMIT_MB}MB`);
}

// Função Recursiva (Sem logs de detetive)
async function getFolderSize(rootId, currentPath) {
    const searchPath = currentPath ? `${rootId}/${currentPath}` : rootId;

    try {
        const { data: items, error } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .list(searchPath, { limit: 1000 });

        if (error || !items) return 0;

        let total = 0;

        for (const item of items) {
            const itemFullPath = currentPath ? `${currentPath}/${item.name}` : item.name;

            if (item.id) {
                // É ARQUIVO
                if (item.metadata && typeof item.metadata.size === 'number') {
                    total += item.metadata.size;
                }
            } else {
                // É PASTA -> Mergulha nela
                total += await getFolderSize(rootId, itemFullPath);
            }
        }
        return total;
    } catch (err) {
        console.error("Erro scanner:", err);
        return 0;
    }
}

// --- CORREÇÃO MATEMÁTICA APLICADA ---
function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    
    const k = 1024;
    // A lista agora começa com Bytes, então o índice 2 será MB corretamente
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']; 
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
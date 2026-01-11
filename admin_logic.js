// ==========================================
// ARQUIVO: admin_logic.js
// ==========================================

const BUCKET_NAME = 'arquivo_clientes';
const STORAGE_LIMIT_MB = 500; 

// Cache de usuários para filtro rápido
let allUsers = []; 

// 1. INICIALIZAÇÃO
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

    setupFilters();
    loadDashboardData();
}

function setupFilters() {
    const searchInput = document.getElementById('searchInput');
    const roleFilter = document.getElementById('roleFilter');

    if(searchInput) searchInput.addEventListener('input', filterUsers);
    if(roleFilter) roleFilter.addEventListener('change', filterUsers);
}

// 2. CARREGAMENTO DOS DADOS
async function loadDashboardData() {
    const tableBody = document.getElementById('usersTableBody');
    if(tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Carregando dados...</td></tr>`;

    try {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allUsers = users; // Salva para filtrar localmente
        updateStatsCards(users);
        filterUsers(); // Renderiza inicial
        calculateAllStorage(users);

    } catch (err) {
        console.error("Erro Fatal:", err);
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4">Erro de conexão.</td></tr>`;
    }
}

function filterUsers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const roleValue = document.getElementById('roleFilter').value;

    const filtered = allUsers.filter(user => {
        const name = (user.name || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const cpf = (user.cpf || '').toLowerCase();
        
        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm) || cpf.includes(searchTerm);

        let matchesRole = true;
        if (roleValue !== 'all') {
            if (roleValue === 'client') {
                matchesRole = (user.role === 'client' || (!user.role && user.email !== 'admin@admin.com'));
            } else {
                matchesRole = (user.role === roleValue);
            }
        }
        return matchesSearch && matchesRole;
    });

    renderTable(filtered);
}

function updateStatsCards(users) {
    const total = users.length;
    const admins = users.filter(u => u.role === 'admin').length;
    const employees = users.filter(u => u.role === 'funcionario').length;
    const clients = users.filter(u => u.role === 'client' || (!u.role && u.email !== 'admin@admin.com')).length;

    setText('totalCount', total);
    setText('adminCount', admins);
    setText('clientCount', clients);
    setText('employeeCount', employees);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if(el) el.innerText = value;
}

function renderTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    tableBody.innerHTML = '';

    if (users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 italic">Nenhum usuário encontrado.</td></tr>`;
        return;
    }

    users.forEach(user => {
        const initials = (user.email || 'U').substring(0, 2).toUpperCase();
        const name = user.name || user.email.split('@')[0];
        
        let roleName, badgeClass, avatarClass, folderBtn;

        if (user.role === 'admin') {
            roleName = "Admin";
            badgeClass = "bg-purple-100 text-purple-700 border-purple-200";
            avatarClass = "bg-purple-100 text-purple-600";
            folderBtn = `<span class="p-2 w-9"></span>`; 
        } else if (user.role === 'funcionario') {
            roleName = "Funcionário";
            badgeClass = "bg-green-100 text-green-700 border-green-200";
            avatarClass = "bg-green-100 text-green-600";
            folderBtn = `<span class="p-2 w-9"></span>`; 
        } else {
            roleName = "Cliente";
            badgeClass = "bg-blue-100 text-blue-700 border-blue-200";
            avatarClass = "bg-blue-100 text-blue-600";
            folderBtn = `<a href="repositorio_admin.html?id=${user.id}" class="p-2 text-slate-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors" title="Abrir Arquivos"><span class="material-symbols-outlined text-lg">folder_open</span></a>`;
        }

        const usageId = `disk-usage-${user.id}`;

        const row = `
            <tr class="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <td class="py-3 px-6 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full ${avatarClass} flex items-center justify-center text-sm font-bold shadow-sm">
                        ${initials}
                    </div>
                    <div>
                        <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">${name}</p>
                        ${user.cpf ? `<p class="text-[10px] text-slate-400">${user.cpf}</p>` : ''}
                    </div>
                </td>
                <td class="py-3 px-6 text-sm text-slate-500 hidden sm:table-cell">${user.email}</td>
                <td class="py-3 px-6 hidden md:table-cell">
                    <span class="px-2 py-1 rounded text-xs font-bold border ${badgeClass}">${roleName}</span>
                </td>
                <td class="py-3 px-6 text-sm font-medium text-slate-500">
                    <span id="${usageId}" class="text-xs text-slate-400 ${roleName==='Cliente'?'animate-pulse':''}">
                        ${roleName === 'Cliente' ? 'Calc...' : '-'}
                    </span>
                </td>
                <td class="py-3 px-6 text-right">
                    <div class="flex justify-end gap-1">
                        ${folderBtn}
                        <a href="edit_usuario.html?id=${user.id}" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar"><span class="material-symbols-outlined text-lg">edit</span></a>
                    </div>
                </td>
            </tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

async function calculateAllStorage(users) {
    let globalBytes = 0;
    const clients = users.filter(u => u.role === 'client' || (!u.role && u.email !== 'admin@admin.com'));

    for (const user of clients) {
        const cell = document.getElementById(`disk-usage-${user.id}`);
        const bytes = await getFolderSize(user.id, ""); 
        
        if(cell) {
            cell.innerText = formatBytes(bytes);
            cell.classList.remove('text-slate-400', 'animate-pulse');
            cell.classList.add('text-slate-700');
            if(bytes > 1024 * 1024 * 400) cell.classList.add('text-red-600', 'font-bold'); 
        }
        globalBytes += bytes;
    }

    const totalMB = globalBytes / (1024 * 1024);
    const percent = (totalMB / STORAGE_LIMIT_MB) * 100;
    
    setText('storagePercent', percent.toFixed(1) + '%');
    setText('storageUsed', `${totalMB.toFixed(1)}MB / ${STORAGE_LIMIT_MB}MB`);
}

async function getFolderSize(rootId, currentPath) {
    const searchPath = currentPath ? `${rootId}/${currentPath}` : rootId;
    try {
        const { data: items, error } = await supabaseClient.storage.from(BUCKET_NAME).list(searchPath, { limit: 1000 });
        if (error || !items) return 0;
        let total = 0;
        for (const item of items) {
            const itemFullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            if (item.id) {
                if (item.metadata && typeof item.metadata.size === 'number') total += item.metadata.size;
            } else {
                total += await getFolderSize(rootId, itemFullPath);
            }
        }
        return total;
    } catch (err) { return 0; }
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']; 
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
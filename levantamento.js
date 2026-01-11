// ==========================================
// ARQUIVO: levantamento.js
// ==========================================

// Configurações
const BUCKET_NAME = 'arquivo_clientes'; 
const TABLE_NAME = 'patrimonio_items';

// Pega o ID do cliente da URL
const urlParams = new URLSearchParams(window.location.search);
const targetClientId = urlParams.get('id');

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> LEVANTAMENTO INICIADO.");
    // Pequeno delay para garantir que config.js carregou a conexão
    setTimeout(initPage, 100);
});

async function initPage() {
    // 1. Verifica se a conexão global existe (do config.js)
    if (typeof supabaseClient === 'undefined') {
        alert("Erro Crítico: config.js não carregou.");
        return;
    }

    // 2. Verifica Sessão
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = "index.html"; return; }

    // 3. Verifica ID do Cliente
    if (!targetClientId) {
        showToast("Erro: ID do cliente não informado.", "error");
        setTimeout(() => window.location.href = "admin.html", 2000);
        return;
    }

    // 4. Configura Botão Voltar
    document.getElementById('btnVoltar').onclick = () => {
        window.location.href = `repositorio_admin.html?id=${targetClientId}`;
    };

    // 5. Carrega Dados
    await loadClientHeader();
    await loadInventory();
}

async function loadClientHeader() {
    try {
        const { data } = await supabaseClient
            .from('profiles')
            .select('name, email')
            .eq('id', targetClientId)
            .single();
            
        if (data) {
            const displayName = data.name || data.email;
            document.getElementById('clientNameDisplay').innerText = `Cliente: ${displayName}`;
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// 2. CARREGAR E RENDERIZAR TABELA
// ==========================================
async function loadInventory() {
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400"><span class="material-symbols-outlined animate-spin">sync</span> Carregando...</td></tr>`;

    try {
        const { data, error } = await supabaseClient
            .from(TABLE_NAME)
            .select('*')
            .eq('client_id', targetClientId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400 italic">Nenhum item cadastrado neste levantamento.</td></tr>`;
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 transition-colors";
            
            // Renderiza os links das fotos apenas se existirem
            const iconItem = renderFileLink(item.foto_item_url, 'image', 'text-blue-500', 'Ver Foto do Item');
            const iconNum = renderFileLink(item.foto_numero_url, 'tag', 'text-purple-500', 'Ver Nº de Série');
            const iconNF = renderFileLink(item.nota_fiscal_url, 'description', 'text-green-600', 'Ver Nota Fiscal');

            tr.innerHTML = `
                <td class="py-3 px-4">
                    <div class="font-bold text-slate-700 dark:text-slate-200 text-sm">${item.nome}</div>
                    <div class="text-xs text-slate-500 truncate max-w-[200px]" title="${item.descricao}">${item.descricao || '-'}</div>
                </td>
                <td class="py-3 px-4 text-sm text-slate-600 dark:text-slate-400 hidden md:table-cell">
                    ${item.marca || '-'}
                </td>
                <td class="py-3 px-4 text-sm font-mono font-bold text-slate-600 dark:text-slate-400">
                    ${item.numero_item || '<span class="text-slate-300">S/N</span>'}
                </td>
                <td class="py-3 px-4 text-center">
                    <div class="flex justify-center gap-2">
                        ${iconItem}
                        ${iconNum}
                    </div>
                </td>
                <td class="py-3 px-4 text-center">
                    ${iconNF}
                </td>
                <td class="py-3 px-4 text-right">
                    <button onclick="deleteInventoryItem('${item.id}')" class="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir Item">
                        <span class="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-red-500">Erro ao carregar dados.</td></tr>`;
    }
}

function renderFileLink(url, iconName, colorClass, title) {
    if (!url) return `<span class="material-symbols-outlined text-slate-200 text-[20px] cursor-not-allowed" title="Não anexado">block</span>`;
    
    return `
        <a href="${url}" target="_blank" class="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors ${colorClass}" title="${title}">
            <span class="material-symbols-outlined text-[22px]">${iconName}</span>
        </a>
    `;
}

// ==========================================
// 3. SALVAR ITEM (UPLOAD + INSERT)
// ==========================================
async function handleSaveItem(e) {
    e.preventDefault();
    
    const btn = document.getElementById('btnSave');
    const originalContent = btn.innerHTML;
    
    // Bloqueia botão
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">sync</span> Salvando...`;
    btn.disabled = true;

    try {
        // 1. Coleta dados do form
        const name = document.getElementById('itemName').value;
        const brand = document.getElementById('itemBrand').value;
        const number = document.getElementById('itemNumber').value;
        const desc = document.getElementById('itemDesc').value;

        // 2. Faz Upload das Imagens (se existirem)
        // Pasta: ID_CLIENTE / Levantamento / ...
        const photoItemUrl = await uploadInventoryFile(document.getElementById('filePhotoItem').files[0], 'FOTO_ITEM');
        const photoNumUrl = await uploadInventoryFile(document.getElementById('filePhotoNumber').files[0], 'FOTO_NUM');
        const invoiceUrl = await uploadInventoryFile(document.getElementById('fileInvoice').files[0], 'NF');

        // 3. Insere no Banco de Dados
        const { error } = await supabaseClient.from(TABLE_NAME).insert({
            client_id: targetClientId,
            nome: name,
            marca: brand,
            numero_item: number,
            descricao: desc,
            foto_item_url: photoItemUrl,
            foto_numero_url: photoNumUrl,
            nota_fiscal_url: invoiceUrl
        });

        if (error) throw error;

        showToast("Item registrado com sucesso!", "success");
        closeModal();
        document.getElementById('inventoryForm').reset();
        loadInventory();

    } catch (err) {
        console.error(err);
        showToast("Erro ao salvar: " + err.message, "error");
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

async function uploadInventoryFile(file, prefix) {
    if (!file) return null; // Se não selecionou arquivo, retorna null

    // Sanitiza nome do arquivo
    const cleanName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.]/g, '_');
    const fileName = `${Date.now()}_${prefix}_${cleanName}`;
    
    // Caminho no Storage
    const filePath = `${targetClientId}/Levantamento/${fileName}`;

    const { error } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;

    // Retorna URL Pública para salvar no banco
    const { data } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return data.publicUrl;
}

// ==========================================
// 4. DELETAR ITEM
// ==========================================
async function deleteInventoryItem(id) {
    if (!confirm("Tem certeza que deseja remover este item do patrimônio?")) return;

    try {
        const { error } = await supabaseClient
            .from(TABLE_NAME)
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast("Item excluído.", "success");
        loadInventory();

    } catch (err) {
        console.error(err);
        showToast("Erro ao excluir.", "error");
    }
}

// ==========================================
// 5. GERADOR DE EXCEL E UPLOAD AUTOMÁTICO
// ==========================================
async function generateAndUploadExcel() {
    const btn = document.getElementById('btnExcel');
    const originalText = btn.innerHTML;
    
    // Feedback visual
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">sync</span> Gerando...`;
    btn.disabled = true;

    try {
        // 1. Busca todos os itens do cliente
        const { data: items, error } = await supabaseClient
            .from(TABLE_NAME)
            .select('*')
            .eq('client_id', targetClientId)
            .order('nome', { ascending: true });

        if (error) throw error;
        if (!items || items.length === 0) throw new Error("Não há itens para gerar o relatório.");

        // 2. Formata os dados para o Excel (Colunas bonitas)
        const rows = items.map(item => ({
            "Nome do Item": item.nome,
            "Marca": item.marca || '-',
            "Número/Série": item.numero_item || '-',
            "Descrição": item.descricao || '-',
            "Data Cadastro": new Date(item.created_at).toLocaleDateString('pt-BR'),
            "Link Foto Item": item.foto_item_url || '',
            "Link Foto Etiqueta": item.foto_numero_url || '',
            "Link Nota Fiscal": item.nota_fiscal_url || ''
        }));

        // 3. Cria a Planilha (Workbook) usando SheetJS
        const worksheet = XLSX.utils.json_to_sheet(rows);
        
        // Ajusta largura das colunas
        const wscols = [
            {wch: 30}, // Nome
            {wch: 15}, // Marca
            {wch: 15}, // Numero
            {wch: 40}, // Descricao
            {wch: 12}, // Data
            {wch: 50}, // Links...
            {wch: 50}, 
            {wch: 50}
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Patrimônio");

        // 4. Converte para BLOB
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // 5. Define nome do arquivo com Data e Hora
        const date = new Date();
        const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `Relatorio_Patrimonial_${timestamp}.xlsx`;
        
        // Caminho: ID_CLIENTE / Levantamento / NomeArquivo.xlsx
        const uploadPath = `${targetClientId}/Levantamento/${fileName}`;

        // 6. Faz o Upload para o Supabase Storage
        const { error: uploadError } = await supabaseClient.storage
            .from(BUCKET_NAME)
            .upload(uploadPath, blob, {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                upsert: true
            });

        if (uploadError) throw uploadError;

        showToast("Relatório Excel criado e salvo na pasta!", "success");

    } catch (err) {
        console.error(err);
        showToast("Erro: " + err.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// UTILITÁRIOS VISUAIS (MODAL & TOAST)
// ==========================================
function openModal() {
    const modal = document.getElementById('itemModal');
    modal.classList.remove('hidden');
    const content = modal.querySelector('div[class*="transform"]');
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
}

function closeModal() {
    const modal = document.getElementById('itemModal');
    const content = modal.querySelector('div[class*="transform"]');
    modal.classList.add('hidden');
    document.getElementById('inventoryForm').reset();
}

function showToast(msg, type="info") {
    const bg = type === 'error' ? "#ef4444" : (type === 'success' ? "#10b981" : "#136dec");
    if (typeof Toastify !== 'undefined') {
        Toastify({ 
            text: msg, 
            duration: 3000, 
            gravity: "top", 
            position: "right", 
            style: { background: bg, borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" } 
        }).showToast();
    } else {
        alert(msg);
    }
}
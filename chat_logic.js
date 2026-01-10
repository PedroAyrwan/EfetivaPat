// ==========================================
// ARQUIVO: chat_logic.js
// Responsável por: Chatbot IA, Leitura de Arquivos e Auto-Configuração
// ==========================================

// ⚠️ COLE SUA NOVA CHAVE AQUI DENTRO DAS ASPAS:
const CHAT_GEMINI_KEY = "AIzaSyDYcyUBDDuljCbX7TTyFeM8LooITUaIdaA"; 

// Configurações do Supabase (Mantidas)
const CHAT_SUPABASE_URL = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const CHAT_SUPABASE_KEY = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const CHAT_BUCKET = 'arquivo_clientes';

// Cliente Supabase exclusivo do Chat
const chatSupabase = supabase.createClient(CHAT_SUPABASE_URL, CHAT_SUPABASE_KEY);

window.isChatOpen = false;
let CACHED_MODEL_NAME = null; 

// 2. INTERFACE
window.toggleChat = function() {
    const cw = document.getElementById('chat-window');
    const fab = document.getElementById('chat-fab');
    if(!cw) return;
    window.isChatOpen = !window.isChatOpen;
    if (window.isChatOpen) {
        cw.classList.remove('hidden');
        setTimeout(() => { cw.classList.remove('scale-90', 'opacity-0'); cw.classList.add('scale-100', 'opacity-100'); }, 10);
        fab.classList.add('scale-0', 'opacity-0'); 
    } else {
        cw.classList.remove('scale-100', 'opacity-100'); cw.classList.add('scale-90', 'opacity-0');
        setTimeout(() => { cw.classList.add('hidden'); fab.classList.remove('scale-0', 'opacity-0'); }, 300);
    }
}

// 3. ENVIAR MENSAGEM
window.handleChatSubmit = async function(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;

    addMessageToChat(message, 'user');
    input.value = '';
    const typingId = showTypingIndicator();

    try {
        const response = await processUserMessage(message);
        removeMessage(typingId);
        addMessageToChat(response, 'ai');
    } catch (error) {
        console.error("Erro Chat:", error);
        removeMessage(typingId);
        addMessageToChat(`❌ <b>Erro:</b> ${error.message}`, 'ai');
    }
}

// 4. AUTO-DESCOBERTA DE MODELO (Corrige erro de 'model not found')
async function getWorkingModel() {
    if (CACHED_MODEL_NAME) return CACHED_MODEL_NAME;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${CHAT_GEMINI_KEY}`;
        const req = await fetch(url);
        const data = await req.json();

        if (data.error) throw new Error(data.error.message);
        
        // Prioridade: Flash -> Pro -> Qualquer Gemini
        let chosen = data.models?.find(m => m.name.includes("gemini-1.5-flash"));
        if (!chosen) chosen = data.models?.find(m => m.name.includes("gemini-1.5-pro"));
        if (!chosen) chosen = data.models?.find(m => m.name.includes("gemini-pro"));
        
        if (!chosen) throw new Error("Nenhum modelo disponível. Verifique sua chave.");

        CACHED_MODEL_NAME = chosen.name.replace("models/", "");
        return CACHED_MODEL_NAME;
    } catch (e) {
        return "gemini-1.5-flash"; // Fallback
    }
}

// 5. PROCESSAMENTO CENTRAL
async function processUserMessage(question) {
    const filesOnScreen = getFilesFromDOM();
    const lowerQ = question.toLowerCase();
    let targetFile = null;

    targetFile = filesOnScreen.find(f => lowerQ.includes(f.name.toLowerCase()));
    
    if (!targetFile && (lowerQ.includes('pdf') || lowerQ.includes('documento'))) {
        const pdfs = filesOnScreen.filter(f => f.name.toLowerCase().endsWith('.pdf'));
        if (pdfs.length === 1) targetFile = pdfs[0];
    }
    if (!targetFile && (lowerQ.includes('imagem') || lowerQ.includes('foto'))) {
        const imgs = filesOnScreen.filter(f => f.name.match(/\.(jpg|png|jpeg|webp)$/i));
        if (imgs.length === 1) targetFile = imgs[0];
    }

    if (targetFile && !targetFile.isFolder) {
        return await analyzeFileContent(targetFile, question);
    } else {
        return await askGeminiTextOnly(filesOnScreen, question);
    }
}

// 6. LER ARQUIVO
async function analyzeFileContent(fileObj, question) {
    try {
        const { data: { session } } = await chatSupabase.auth.getSession();
        if (!session) return "Você precisa estar logado.";

        const breadcrumbText = document.getElementById('pathBreadcrumb')?.innerText || "";
        let pathParts = breadcrumbText.replace("Início", "").split(">").map(s => s.trim()).filter(s => s);
        let currentPath = pathParts.length > 0 ? pathParts.join("/") + "/" : "";
        
        const fullPath = `${session.user.id}/${currentPath}${fileObj.name}`;
        const { data: blob, error } = await chatSupabase.storage.from(CHAT_BUCKET).download(fullPath);
        if (error) throw new Error("Não consegui baixar o arquivo.");

        const base64 = await blobToBase64(blob);
        const parts = [
            { inlineData: { mimeType: blob.type, data: base64 } },
            { text: `Analise este arquivo (${fileObj.name}) e responda: "${question}"` }
        ];

        return await callGeminiAPI(parts);
    } catch (err) {
        return `Erro ao ler <b>${fileObj.name}</b>: ${err.message}`;
    }
}

// 7. TEXTO PURO
async function askGeminiTextOnly(files, question) {
    let contextText = files.length === 0 ? "Pasta vazia." : files.map(f => `- ${f.type} "${f.name}" (${f.date})`).join("\n");
    const prompt = `Você é a assistente do Repositório. CONTEXTO:\n${contextText}\nPERGUNTA: "${question}"\nResponda com base na lista.`;
    return await callGeminiAPI([{ text: prompt }]);
}

// 8. CHAMADA API
async function callGeminiAPI(contentsParts) {
    const modelName = await getWorkingModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${CHAT_GEMINI_KEY}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: contentsParts }] })
    });

    const data = await response.json();
    if (data.error) throw new Error(`Google API: ${data.error.message}`);
    
    if (data.candidates && data.candidates.length > 0) {
        return data.candidates[0].content.parts[0].text;
    }
    return "Sem resposta da IA.";
}

// 9. UTILITÁRIOS
function getFilesFromDOM() {
    const rows = document.querySelectorAll('#filesListBody tr');
    const files = [];
    rows.forEach(row => {
        if(row.innerText.includes('Pasta vazia') || row.innerText.includes('Voltar') || row.innerText.includes('Carregando')) return;
        const nameCell = row.querySelector('td:nth-child(1)');
        const dateCell = row.querySelector('td:nth-child(2)');
        if(nameCell) {
            let cleanName = nameCell.innerText.replace(/folder|insert_drive_file|image|picture_as_pdf|table_view|description|draft/g, '').trim();
            let isFolder = row.innerHTML.includes('text-yellow-500');
            let dateVal = dateCell ? dateCell.innerText.trim() : '-';
            if(cleanName) files.push({ name: cleanName, date: dateVal, type: isFolder ? '[PASTA]' : '[ARQ]', isFolder: isFolder });
        }
    });
    return files;
}
function blobToBase64(blob) { return new Promise((r, j) => { const reader = new FileReader(); reader.onloadend = () => r(reader.result.split(',')[1]); reader.onerror = j; reader.readAsDataURL(blob); }); }
function addMessageToChat(text, sender) {
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    const chatBox = document.getElementById('chat-messages');
    let html = sender === 'user' ? `<div class="flex gap-2 items-end justify-end animate-enter mb-3"><div class="bg-primary text-white p-3 rounded-2xl rounded-tr-none shadow-md text-sm max-w-[85%]">${formattedText}</div></div>` : `<div class="flex gap-2 items-start animate-enter mb-3"><div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-primary"><span class="material-symbols-outlined text-sm">smart_toy</span></div><div class="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 max-w-[90%] leading-relaxed">${formattedText}</div></div>`;
    chatBox.insertAdjacentHTML('beforeend', html); chatBox.scrollTop = chatBox.scrollHeight;
}
function showTypingIndicator() { const id = 'typing-' + Date.now(); document.getElementById('chat-messages').insertAdjacentHTML('beforeend', `<div id="${id}" class="flex gap-2 items-start animate-enter mb-3"><div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-sm text-gray-500">smart_toy</span></div><div class="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1 items-center h-10"><div class="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot"></div><div class="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot"></div><div class="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot"></div></div></div>`); return id; }
function removeMessage(id) { const el = document.getElementById(id); if(el) el.remove(); }
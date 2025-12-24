// ======================================================
// ARQUIVO: login.js (FINAL)
// ======================================================

const { createClient } = supabase;

// 🟢 CONEXÃO:
// Removemos as URLs fixas daqui. 
// O código agora usa as variáveis SUPABASE_URL e SUPABASE_KEY que vêm do arquivo 'config.js'
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ELEMENTOS DO DOM
const loginForm = document.getElementById('formLogin');
const loginInput = document.getElementById('loginInput'); 
const btnLogin = document.getElementById('btnLogin');

// ======================================================
// 1. MÁSCARA INTELIGENTE (CPF, CNPJ OU EMAIL)
// ======================================================
if (loginInput) {
    loginInput.addEventListener('input', function(e) {
        let valor = e.target.value;
        
        // REGRA DE PROTEÇÃO:
        // Se tiver qualquer letra (a-z) ou @, é E-mail.
        if (/[a-zA-Z@]/.test(valor)) {
            return; 
        }

        // --- SE CHEGOU AQUI, É NÚMERO (CPF ou CNPJ) ---
        
        // Remove tudo que não for número
        let apenasNumeros = valor.replace(/\D/g, "");

        // Limita tamanho (CNPJ são 14 dígitos)
        if (apenasNumeros.length > 14) apenasNumeros = apenasNumeros.slice(0, 14);

        // Aplica a máscara visual
        if (apenasNumeros.length <= 11) {
            // CPF
            apenasNumeros = apenasNumeros.replace(/(\d{3})(\d)/, "$1.$2");
            apenasNumeros = apenasNumeros.replace(/(\d{3})(\d)/, "$1.$2");
            apenasNumeros = apenasNumeros.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        } else {
            // CNPJ
            apenasNumeros = apenasNumeros.replace(/^(\d{2})(\d)/, "$1.$2");
            apenasNumeros = apenasNumeros.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
            apenasNumeros = apenasNumeros.replace(/\.(\d{3})(\d)/, ".$1/$2");
            apenasNumeros = apenasNumeros.replace(/(\d{4})(\d)/, "$1-$2");
        }

        e.target.value = apenasNumeros;
    });
}

// ======================================================
// 2. LÓGICA DE LOGIN
// ======================================================
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 

        const rawLoginValue = document.getElementById('loginInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        const btn = document.getElementById('btnLogin');
        const originalText = btn.innerHTML;
        
        let emailFinal = rawLoginValue;

        // Feedback Visual
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> Verificando...`;
        btn.classList.add('opacity-80', 'cursor-not-allowed');

        try {
            // --- DETECÇÃO: É DOCUMENTO? (Não tem @) ---
            if (!rawLoginValue.includes('@')) {
                const cleanDoc = rawLoginValue.replace(/\D/g, ''); 
                
                if (cleanDoc.length === 0) {
                    throw new Error("Por favor, digite um E-mail, CPF ou CNPJ válido.");
                }

                console.log("🔍 Buscando documento:", cleanDoc);

                // Busca o e-mail na tabela profiles
                const { data, error } = await supabaseClient
                    .from('profiles')
                    .select('email')
                    .or(`cpf.eq.${cleanDoc},cnpj.eq.${cleanDoc}`) 
                    .maybeSingle();

                if (error) {
                    console.error("Erro BD:", error);
                    throw new Error("Erro de conexão. Verifique se o RLS está desativado na tabela profiles.");
                }

                if (!data || !data.email) {
                    throw new Error("CPF/CNPJ não encontrado no sistema.");
                }

                emailFinal = data.email;
            }

            // --- LOGIN ---
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailFinal,
                password: password,
            });

            if (error) throw error;

            // --- REDIRECIONAMENTO ---
            const user = data.user;
            const { data: profile } = await supabaseClient
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .maybeSingle();

            showToast("Login realizado! Entrando...", "success");
            
            setTimeout(() => {
                if (profile && profile.role === "admin") {
                    window.location.href = "admin.html";
                } else {
                    window.location.href = "repositorio_cliente.html"; 
                }
            }, 1000);

        } catch (err) {
            console.error("Erro:", err);
            let msg = err.message;
            if (msg.includes("Invalid login")) msg = "Senha incorreta ou usuário inexistente.";
            
            showToast(msg, "error");
            
            // Restaura botão
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.classList.remove('opacity-80', 'cursor-not-allowed');
        }
    });
}

// ======================================================
// 3. RECUPERAÇÃO DE SENHA E TOAST
// ======================================================
window.openRecoverModal = function(e) { if(e) e.preventDefault(); document.getElementById('recoverModal').classList.remove('hidden'); setTimeout(()=>document.getElementById('recoverModal').classList.remove('opacity-0'),10); }
window.closeRecoverModal = function() { document.getElementById('recoverModal').classList.add('opacity-0'); setTimeout(()=>document.getElementById('recoverModal').classList.add('hidden'),300); }
window.handleRecover = async function(e) {
    e.preventDefault();
    const email = document.getElementById('recoverEmail').value;
    if(!email) return;
    try {
        await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/index.html" });
        showToast("Link enviado! Verifique seu e-mail.", "success");
        window.closeRecoverModal();
    } catch(err) { showToast("Erro ao enviar.", "error"); }
}

function showToast(msg, type="info") {
    let bg = type==="success" ? "#10b981" : type==="error" ? "#ef4444" : "#136dec";
    if (typeof Toastify !== 'undefined') {
        Toastify({ text: msg, duration: 3000, gravity: "top", position: "center", style: { background: bg, borderRadius: "8px" } }).showToast();
    } else { alert(msg); }
}
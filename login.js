// ARQUIVO: login.js
// ======================================================

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
        
        // Se tiver letra ou @, é E-mail -> não faz máscara
        if (/[a-zA-Z@]/.test(valor)) {
            return; 
        }

        // --- SE CHEGOU AQUI, É NÚMERO (CPF ou CNPJ) ---
        let apenasNumeros = valor.replace(/\D/g, "");

        if (apenasNumeros.length > 14) apenasNumeros = apenasNumeros.slice(0, 14);

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
// 2. LÓGICA DE LOGIN (Mantida a sua original)
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

                // Busca o e-mail na tabela profiles
                const { data, error } = await supabaseClient
                    .from('profiles')
                    .select('email')
                    .or(`cpf.eq.${cleanDoc},cnpj.eq.${cleanDoc}`) 
                    .maybeSingle();

                if (error) {
                    console.error("Erro BD:", error);
                    throw new Error("Erro de conexão.");
                }

                if (!data || !data.email) {
                    throw new Error("CPF/CNPJ não encontrado no sistema.");
                }

                emailFinal = data.email;
            }

            // --- LOGIN NO SUPABASE ---
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailFinal,
                password: password,
            });

            if (error) throw error;

            // --- REDIRECIONAMENTO COM BASE NA ROLE ---
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
// 3. RECUPERAÇÃO DE SENHA (ATUALIZADO)
// ======================================================
const recoverModal = document.getElementById('recoverModal');
const modalContent = recoverModal ? recoverModal.querySelector('div') : null;

// Função para abrir o modal com animação
window.openRecoverModal = function(e) {
    if(e) e.preventDefault();
    recoverModal.classList.remove('hidden');
    setTimeout(() => {
        recoverModal.classList.remove('opacity-0');
        if(modalContent) {
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
        }
    }, 10);
}

// Função para fechar o modal
window.closeRecoverModal = function() {
    recoverModal.classList.add('opacity-0');
    if(modalContent) {
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
    }
    setTimeout(() => {
        recoverModal.classList.add('hidden');
    }, 300);
}

// Lógica de Envio do E-mail
window.handleRecover = async function(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('recoverEmail');
    const email = emailInput.value;
    const btnRecover = document.getElementById('btnRecover');
    const originalContent = btnRecover.innerHTML;

    if(!email) return;

    // Loading no botão
    btnRecover.innerHTML = `<span class="material-symbols-outlined animate-spin">progress_activity</span> Enviando...`;
    btnRecover.disabled = true;

    try {
        // AQUI ESTÁ A CORREÇÃO IMPORTANTE:
        // Aponta para o arquivo atualizar_senha.html
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { 
            redirectTo: 'https://pedroayrwan.github.io/EfetivaPat/atualizar_senha.html' 
        });

        if (error) throw error;

        showToast("Link enviado! Verifique seu e-mail.", "success");
        emailInput.value = "";
        window.closeRecoverModal();

    } catch(err) { 
        console.error(err);
        if (err.status === 429) {
            showToast("Muitas tentativas. Aguarde um minuto.", "error");
        } else {
            showToast("Erro ao enviar: " + err.message, "error");
        }
    } finally {
        btnRecover.innerHTML = originalContent;
        btnRecover.disabled = false;
    }
}

// ======================================================
// 4. FUNÇÃO GLOBAL DE TOAST
// ======================================================
function showToast(msg, type="info") {
    let bg = type==="success" ? "#10b981" : type==="error" ? "#ef4444" : "#136dec";
    
    if (typeof Toastify !== 'undefined') {
        Toastify({ 
            text: msg, 
            duration: 3000, 
            gravity: "top", 
            position: "right", // Alterado para right para não cobrir o centro
            style: { background: bg, borderRadius: "8px", fontFamily: "'Inter', sans-serif" } 
        }).showToast();
    } else { 
        alert(msg); 
    }
}
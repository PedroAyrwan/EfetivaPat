// ======================================================
// ARQUIVO: login.js (Corrigido e Otimizado)
// ======================================================

const { createClient } = supabase;

// ⚠️ CONFIGURAÇÕES DO SUPABASE
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

// ELEMENTOS DO DOM
const loginForm = document.getElementById('formLogin');
const loginInput = document.getElementById('loginInput'); 
const btnLogin = document.getElementById('btnLogin');

// ======================================================
// 0. MÁSCARA INTELIGENTE (CPF, CNPJ OU EMAIL)
// ======================================================
if (loginInput) {
    loginInput.addEventListener('input', function(e) {
        let valor = e.target.value;
        
        // 1. REGRA DE PROTEÇÃO:
        // Se o usuário digitou alguma LETRA (a-z) ou @, assumimos que é E-mail.
        // Então paramos a função imediatamente para não apagar o texto.
        if (/[a-zA-Z@]/.test(valor)) {
            return; 
        }

        // --- Daqui para baixo só executa se NÃO tiver letras (ou seja, só números) ---

        // Remove tudo que não é número para formatar
        valor = valor.replace(/\D/g, "");

        // Limita tamanho (CNPJ são 14 dígitos)
        if (valor.length > 14) valor = valor.slice(0, 14);

        // Aplica a formatação visual (Pontos e traços)
        if (valor.length <= 11) {
            // CPF (000.000.000-00)
            valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
            valor = valor.replace(/(\d{3})(\d)/, "$1.$2");
            valor = valor.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        } else {
            // CNPJ (00.000.000/0000-00)
            valor = valor.replace(/^(\d{2})(\d)/, "$1.$2");
            valor = valor.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
            valor = valor.replace(/\.(\d{3})(\d)/, ".$1/$2");
            valor = valor.replace(/(\d{4})(\d)/, "$1-$2");
        }

        e.target.value = valor;
    });
}

// ======================================================
// 1. LÓGICA DE LOGIN INTELIGENTE
// ======================================================
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Impede o recarregamento da página

        // Pega os valores
        const rawLoginValue = document.getElementById('loginInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        
        // Variável que vai guardar o e-mail final para o login
        let emailFinal = rawLoginValue;

        // Feedback Visual (Botão Carregando)
        const originalText = btnLogin.innerHTML;
        btnLogin.disabled = true;
        btnLogin.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> Verificando...`;
        btnLogin.classList.add('opacity-80', 'cursor-not-allowed');

        try {
            // --- PASSO A: DETECÇÃO DE DOCUMENTO (CPF ou CNPJ) ---
            // Se não tiver '@', assumimos que é um documento
            if (!rawLoginValue.includes('@')) {
                const cleanDoc = rawLoginValue.replace(/\D/g, ''); // Limpa pontos e traços (fica só números)
                
                if (cleanDoc.length === 0) {
                    throw new Error("Por favor, digite um E-mail, CPF ou CNPJ válido.");
                }

                console.log("🔍 Buscando e-mail vinculado ao documento:", cleanDoc);

                // BUSCA DIRETA NO BANCO (Substituindo o RPC)
                // Procura na tabela profiles se existe esse CPF ou CNPJ
                const { data, error } = await supabaseClient
                    .from('profiles')
                    .select('email')
                    .or(`cpf.eq.${cleanDoc},cnpj.eq.${cleanDoc}`) // Procura nas duas colunas
                    .maybeSingle(); // Retorna null se não achar (não dá erro)

                if (error) {
                    console.error("Erro Supabase:", error);
                    throw new Error("Erro ao consultar banco de dados.");
                }

                if (!data || !data.email) {
                    throw new Error("CPF/CNPJ não encontrado no sistema. Verifique os números.");
                }

                // Se achou, usamos o e-mail encontrado
                console.log("✅ Documento reconhecido. E-mail associado:", data.email);
                emailFinal = data.email;
            }

            // --- PASSO B: LOGIN NO SUPABASE ---
            // O Supabase sempre exige email+senha no final
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailFinal,
                password: password,
            });

            if (error) throw error;

            // --- PASSO C: VERIFICAÇÃO DE PERFIL (ADMIN ou CLIENTE) ---
            showToast("Login validado! Verificando perfil...", "info");
            
            const user = data.user;

            // Busca o perfil para saber se é admin ou cliente
            const { data: profile, error: profileError } = await supabaseClient
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();

            if (profileError || !profile) {
                // Se der erro aqui, redireciona para o padrão
                console.warn("Perfil não encontrado, indo para repositório.");
                window.location.href = "repositorio_cliente.html";
                return;
            }

            // --- SUCESSO! REDIRECIONA ---
            showToast("Sucesso! Redirecionando...", "success");
            
            setTimeout(() => {
                if (profile.role === "admin") {
                    window.location.href = "admin.html";
                } else {
                    window.location.href = "repositorio_cliente.html"; // Corrigido para o nome do seu arquivo
                }
            }, 1000);

        } catch (err) {
            console.error("Erro Login:", err);
            
            let msg = err.message;
            if (msg.includes("Invalid login")) msg = "Senha incorreta ou usuário inexistente.";
            
            showToast(msg, "error");
            
            // Restaura o botão
            btnLogin.innerHTML = originalText;
            btnLogin.disabled = false;
            btnLogin.classList.remove('opacity-80', 'cursor-not-allowed');
        }
    });
}

// ======================================================
// 2. LÓGICA DE RECUPERAÇÃO DE SENHA
// ======================================================

window.openRecoverModal = function(e) {
    if(e) e.preventDefault();
    const modal = document.getElementById('recoverModal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
        modal.querySelector('div').classList.add('scale-100');
    }, 10);
}

window.closeRecoverModal = function() {
    const modal = document.getElementById('recoverModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.remove('scale-100');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        const inputEmail = document.getElementById('recoverEmail');
        if(inputEmail) inputEmail.value = '';
    }, 300);
}

// Fechar modal ao clicar fora
const recoverModal = document.getElementById('recoverModal');
if(recoverModal) {
    recoverModal.addEventListener('click', function(e) {
        if (e.target.id === 'recoverModal') window.closeRecoverModal();
    });
}

window.handleRecover = async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('recoverEmail').value;
    const btn = document.getElementById('btnRecover');
    const originalText = btn.innerHTML;

    if (!email) return;

    try {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-sm">progress_activity</span> Enviando...`;

        // URL para onde o usuário vai ao clicar no e-mail
        // Garanta que você tem o arquivo atualizar_senha.html ou mande para o index
        const redirectUrl = window.location.origin + "/index.html"; 

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
        });

        if (error) throw error;

        showToast("Link enviado! Verifique seu e-mail.", "success");
        setTimeout(window.closeRecoverModal, 2000);

    } catch (error) {
        console.error('Erro Recover:', error);
        let msg = error.status === 429 ? "Muitas tentativas. Aguarde 60s." : "Erro ao enviar email. Verifique o endereço.";
        showToast(msg, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ======================================================
// 3. UTILITÁRIO: TOASTIFY (Notificações)
// ======================================================
function showToast(msg, type="info") {
    let bg = type==="success" ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : 
             type==="error"   ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" : 
                                "linear-gradient(135deg, #136dec 0%, #0f5cbd 100%)";
    
    if (typeof Toastify !== 'undefined') {
        Toastify({
            text: msg,
            duration: 4000,
            gravity: "top",
            position: "center", // Mudei para center para ficar mais visível no mobile
            stopOnFocus: true,
            style: { background: bg, borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }
        }).showToast();
    } else {
        alert(msg);
    }
}
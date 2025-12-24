// ======================================================
// LÓGICA DE LOGIN (E-MAIL OU CPF) - REDIRECIONAMENTO CORRIGIDO
// ======================================================

const { createClient } = supabase;

// ⚠️ CONFIGURAÇÕES DO SUPABASE
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

// ELEMENTOS DO DOM
const loginForm = document.getElementById('formLogin');
const btnLogin = document.getElementById('btnLogin');

// ======================================================
// 1. LÓGICA DE LOGIN INTELIGENTE
// ======================================================
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Pega os valores
        const loginValue = document.getElementById('loginInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        
        let emailFinal = loginValue;

        // Feedback Visual (Botão Carregando)
        const originalText = btnLogin.innerHTML;
        btnLogin.disabled = true;
        btnLogin.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> Verificando...`;
        btnLogin.classList.add('opacity-80', 'cursor-not-allowed');

        try {
            // --- PASSO A: DETECÇÃO DE CPF ---
            // Se não tiver '@', assumimos que é CPF
            if (!loginValue.includes('@')) {
                const cleanCpf = loginValue.replace(/\D/g, ''); // Limpa pontos e traços
                
                if (cleanCpf.length === 0) {
                    throw new Error("Por favor, digite um E-mail ou CPF válido.");
                }

                // Busca o e-mail pelo CPF no banco
                const { data: foundEmail, error: rpcError } = await supabaseClient
                    .rpc('get_email_by_cpf', { target_cpf: cleanCpf });

                if (rpcError || !foundEmail) {
                    console.error("Erro RPC:", rpcError);
                    throw new Error("CPF não encontrado no sistema.");
                }

                console.log("CPF Reconhecido. Logando com:", foundEmail);
                emailFinal = foundEmail;
            }

            // --- PASSO B: LOGIN NO SUPABASE ---
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailFinal,
                password: password,
            });

            if (error) throw error;

            // --- PASSO C: VERIFICAÇÃO DE PERFIL (ADMIN ou CLIENTE) ---
            const { data: userData } = await supabaseClient.auth.getUser();
            const user = userData.user;

            // Busca o perfil para saber se é admin ou cliente
            const { data: profile, error: profileError } = await supabaseClient
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .maybeSingle();

            if (profileError) {
                throw new Error("Erro ao buscar perfil: " + profileError.message);
            } else if (!profile) {
                throw new Error("Perfil de usuário não encontrado.");
            } else {
                // SUCESSO!
                showToast("Login realizado! Redirecionando...", "success");
                
                setTimeout(() => {
                    // 👇 AQUI ESTÁ A MUDANÇA: Redireciona para repositorio_cliente.html 👇
                    if (profile.role === "admin") {
                        window.location.href = "admin.html";
                    } else {
                        window.location.href = "repositorio_cliente.html"; 
                    }
                }, 1000);
            }

        } catch (err) {
            console.error("Erro Login:", err);
            
            let msg = err.message;
            if (msg.includes("Invalid login")) msg = "Dados de acesso incorretos.";
            
            showToast(msg, "error");
            
            // Restaura o botão
            btnLogin.innerHTML = originalText;
            btnLogin.disabled = false;
            btnLogin.classList.remove('opacity-80', 'cursor-not-allowed');
        }
    });
}

// ======================================================
// 2. LÓGICA DE RECUPERAÇÃO DE SENHA (Mantida igual)
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
        document.getElementById('recoverEmail').value = '';
    }, 300);
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
        const redirectUrl = window.location.origin + "/atualizar_senha.html";

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
        });

        if (error) throw error;

        showToast("Link enviado! Verifique seu e-mail.", "success");
        window.closeRecoverModal();

    } catch (error) {
        console.error('Erro Recover:', error);
        let msg = error.status === 429 ? "Muitas tentativas. Aguarde 60s." : error.message;
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
            position: "right",
            stopOnFocus: true,
            style: { background: bg, borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }
        }).showToast();
    } else {
        alert(msg);
    }
}
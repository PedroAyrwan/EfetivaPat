// ==========================================
// ARQUIVO: novo_cadastro.js (CORRIGIDO)
// ==========================================

const { createClient } = supabase;

// ⚠️ SUAS CHAVES DO SUPABASE
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const form = document.getElementById('cadastroForm');
const btnSalvar = document.getElementById('btnSalvar');

console.log("--> JS novo_cadastro.js CARREGADO COM SUCESSO!");

// 1. MÁSCARA INTELIGENTE (CPF E CNPJ)
function mascaraDocumento(input) {
    let v = input.value.replace(/\D/g, ""); // Remove tudo que não é dígito

    if (v.length > 14) v = v.slice(0, 14); // Limita tamanho

    if (v.length <= 11) {
        // CPF (000.000.000-00)
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
        // CNPJ (00.000.000/0000-00)
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
    }

    input.value = v;
}

// 2. VERIFICA SE É ADMIN
async function checkAdmin() {
    console.log("Verificando Admin...");
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) { 
        window.location.href = "index.html"; 
        return; 
    }

    const { data: profile } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        alert("Acesso Negado.");
        window.location.href = "repositorio_cliente.html";
    } else {
        console.log("Admin confirmado.");
    }
}
checkAdmin();

// 3. ENVIO DO FORMULÁRIO
if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Botão Clicado. Iniciando cadastro...");

        // Pega valores do HTML
        const name = document.getElementById('full-name').value.trim();
        const docRaw = document.getElementById('documentoInput').value; 
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPass = document.getElementById('confirm-password').value;
        const role = document.getElementById('user-type').value;

        // Limpa formatação para validar
        const docClean = docRaw.replace(/\D/g, '');

        // Valida Tamanho
        if (docClean.length !== 11 && docClean.length !== 14) {
            alert("Documento inválido. Digite um CPF (11 números) ou CNPJ (14 números).");
            return;
        }

        if (password !== confirmPass) {
            alert("As senhas não conferem.");
            return;
        }

        // Feedback Visual
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Criando...";
        btnSalvar.disabled = true;

        try {
            console.log("1. Criando Auth...");
            // A. Cria Login no Auth
            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: { data: { name: name } } // Ajustado metadado também
            });

            if (error) throw error;

            if (data.user) {
                console.log("2. Salvando Perfil...");
                
                // Lógica CPF/CNPJ
                let cpfToSave = null;
                let cnpjToSave = null;

                if (docClean.length === 11) {
                    cpfToSave = docClean;
                } else {
                    cnpjToSave = docClean;
                }

                // B. Salva Perfil (CORRIGIDO AQUI: 'name' em vez de 'full_name')
                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .upsert({ 
                        id: data.user.id,
                        email: email,
                        name: name,     // <--- AQUI ESTAVA O ERRO (AGORA ESTÁ CERTO)
                        role: role,
                        cpf: cpfToSave, 
                        cnpj: cnpjToSave
                    });

                if (profileError) {
                    console.error("Erro Perfil:", profileError);
                    alert("Conta criada, mas erro ao salvar dados do perfil: " + profileError.message);
                } else {
                    console.log("SUCESSO TOTAL!");
                    alert(`Usuário "${name}" criado com sucesso!\nO sistema retornará para a lista.`);
                    window.location.href = "admin.html";
                }
            }

        } catch (err) {
            console.error("Erro:", err);
            let msg = err.message;
            if (msg.includes("already registered")) msg = "Este e-mail já está em uso.";
            alert("Erro: " + msg);
        } finally {
            btnSalvar.innerHTML = originalText;
            btnSalvar.disabled = false;
        }
    });
} else {
    console.error("ERRO CRÍTICO: Não achei o formulário com id='cadastroForm' no HTML.");
}

window.mascaraDocumento = mascaraDocumento;
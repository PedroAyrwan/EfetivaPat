// ==========================================
// ARQUIVO: novo_cadastro.js
// ==========================================

const { createClient } = supabase;
// CONFIGURAÇÕES
const supabaseUrl = "https://tsnryihpnjtlitipkyjr.supabase.co"; 
const supabaseKey = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50"; 
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const form = document.getElementById('cadastroForm');
const btnSalvar = document.getElementById('btnSalvar');

console.log("--> JS novo_cadastro.js CARREGADO COM SUCESSO!");

// 1. MÁSCARA CPF
function mascaraCPF(i){
    var v = i.value;
    if(isNaN(v[v.length-1])){ 
       i.value = v.substring(0, v.length-1);
       return;
    }
    i.setAttribute("maxlength", "14");
    if (v.length == 3 || v.length == 7) i.value += ".";
    if (v.length == 11) i.value += "-";
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
        window.location.href = "client.html";
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

        const name = document.getElementById('full-name').value;
        const cpfRaw = document.getElementById('cpf').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPass = document.getElementById('confirm-password').value;
        const role = document.getElementById('user-type').value;

        // Limpa CPF
        const cpfClean = cpfRaw.replace(/\D/g, '');

        if (cpfClean.length !== 11) {
            alert("CPF inválido (precisa de 11 números).");
            return;
        }
        if (password !== confirmPass) {
            alert("As senhas não conferem.");
            return;
        }

        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = "Criando...";
        btnSalvar.disabled = true;

        try {
            console.log("1. Criando Auth...");
            // A. Cria Login
            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: { data: { full_name: name } }
            });

            if (error) throw error;

            if (data.user) {
                console.log("2. Salvando Perfil...");
                // B. Salva Perfil (CPF e Cargo)
                // UPSERT = Atualiza se existir, Cria se não existir
                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .upsert({ 
                        id: data.user.id,
                        email: email,
                        name: name,
                        role: role,
                        cpf: cpfClean
                    });

                if (profileError) {
                    console.error("Erro Perfil:", profileError);
                    alert("Conta criada, mas erro ao salvar CPF: " + profileError.message);
                } else {
                    console.log("SUCESSO TOTAL!");
                    alert(`Usuário "${name}" criado!\nO sistema fará logoff do Admin.`);
                    await supabaseClient.auth.signOut();
                    window.location.href = "index.html";
                }
            }

        } catch (err) {
            console.error("Erro:", err);
            alert("Erro: " + err.message);
        } finally {
            btnSalvar.innerHTML = originalText;
            btnSalvar.disabled = false;
        }
    });
} else {
    console.error("ERRO CRÍTICO: Não achei o formulário com id='cadastroForm' no HTML.");
}

// Expõe a máscara para o HTML usar
window.mascaraCPF = mascaraCPF;
// ARQUIVO: config.js
// ======================================================

const SUPABASE_URL = "https://tsnryihpnjtlitipkyjr.supabase.co";
const SUPABASE_KEY = "sb_publishable_4_NjFd3BfYLP4GPmIJDkXA_xR7ZHp50";

// Inicializa o cliente Supabase e deixa ele global (acessível no login.js)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase inicializado via config.js");
const SUPABASE_URL = "SUA_URL_DO_SUPABASE";
const SUPABASE_ANON_KEY = "SUA_ANON_KEY_DO_SUPABASE";

const { createClient } = supabase;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

async function protegerPagina() {
  try {
    const {
      data: { session },
      error
    } = await db.auth.getSession();

    if (error || !session) {
      window.location.replace("index.html");
      return;
    }

    console.log("Usuário autenticado:", session.user.email);

  } catch (error) {
    console.error("Erro ao verificar autenticação:", error);
    window.location.replace("index.html");
  }
}

protegerPagina();
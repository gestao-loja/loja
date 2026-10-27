/* =========================================================
   CONFIGURAÇÃO DO SUPABASE
   Troque somente estes dois valores.
   Use a chave ANON/PUBLISHABLE, NUNCA service_role.
   ========================================================= */
const SUPABASE_URL = "https://tzolokxetilunyfzovav.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0HJWnbqDMg1LFwLuhaRLDg_FvEXwxZd";
/* =========================================================
   CREDENCIAIS DO SUPABASE (ÚNICO LUGAR)
   ⚠️ Substitua pelos valores reais do seu projeto.
   NÃO declare estas variáveis em outro arquivo (config.js),
   para evitar o erro "Identifier 'SUPABASE_URL' has already
   been declared".
   ========================================================= */

/* =========================================================
   CLIENT SUPABASE
   ========================================================= */
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.db = db;

let currentUser = null;
let currentStore = null;

/* =========================================================
   HELPER: loja matriz (id_loja = 1)
   ========================================================= */
function isLojaMatriz() {
  return currentStore && Number(currentStore.id_loja) === 1;
}

(function setFavicon() {
  const href = 'logo.png';

  document
    .querySelectorAll("link[rel*='icon']")
    .forEach(el => el.remove());

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = href;
  document.head.appendChild(link);

  const apple = document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = href;
  document.head.appendChild(apple);
})();

function $(id) {
  return document.getElementById(id);
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    function (match) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[match];
    }
  );
}

function showMessage(element, text, type = "error") {
  if (!element) {
    return;
  }

  element.innerHTML =
    '<div class="message ' + type + '">' + escapeHtml(text) + "</div>";
}

function go(page) {
  if (page === "catalogo") {
    if (currentStore && currentStore.id_loja) {
      window.location.href =
        "catalogo.html?loja=" + encodeURIComponent(currentStore.id_loja);
      return;
    }
    window.location.href = "catalogo.html";
    return;
  }
  window.location.href = page + ".html";
}

function openModal(title, html) {
  const modal = $("modal");
  if ($("modalTitle")) $("modalTitle").textContent = title;
  if ($("modalContent")) $("modalContent").innerHTML = html;
  if (modal) modal.classList.remove("hidden");
}

function closeModal() {
  const modal = $("modal");
  if (modal) modal.classList.add("hidden");
}

/* =========================================================
   LOGIN
   ========================================================= */
async function login() {
  const loginForm = $("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const emailElement = $("loginEmail");
    const passwordElement = $("loginPassword");
    const message = $("loginMessage");

    const email = emailElement ? emailElement.value.trim() : "";
    const password = passwordElement ? passwordElement.value : "";

    if (!email || !password) {
      showMessage(message, "Informe seu e-mail e sua senha.");
      return;
    }

    const button = loginForm.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = "Entrando...";
    }
    if (message) message.innerHTML = "";

    try {
      const result = await db.auth.signInWithPassword({ email, password });

      if (result.error) {
        console.error("Erro no login:", result.error);
        showMessage(message, result.error.message);
        return;
      }

      currentUser = result.data.user;
      window.location.href = "dashboard.html";

    } catch (error) {
      console.error("Erro inesperado no login:", error);
      showMessage(message, error.message || "Erro inesperado ao realizar login.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    }
  });
}

/* =========================================================
   AUTH
   ========================================================= */
async function requireAuth() {
  try {
    const result = await db.auth.getSession();

    if (result.error) {
      console.error("Erro ao verificar sessão:", result.error);
      // Preserva query string (importante para não perder ?token=)
      window.location.replace("index.html" + window.location.search);
      return false;
    }

    const session = result.data.session;
    if (!session) {
      // Preserva query string
      window.location.replace("index.html" + window.location.search);
      return false;
    }

    currentUser = session.user;
    return true;

  } catch (error) {
    console.error("Erro ao verificar autenticação:", error);
    // Preserva query string
    window.location.replace("index.html" + window.location.search);
    return false;
  }
}

async function logout() {
  try {
    await db.auth.signOut();
  } catch (error) {
    console.error("Erro ao sair:", error);
  }
  // Preserva query string
  window.location.replace("index.html" + window.location.search);
}

/* =========================================================
   CONTEXTO DO USUÁRIO / LOJA
   ========================================================= */
async function loadUserContext() {
  if (!currentUser) {
    console.error("loadUserContext: currentUser não existe.");
    return false;
  }

  try {
    console.log("Carregando usuário:", currentUser.id);

    const userResult = await db
      .from("gestao_loja_usuarios")
      .select("id,id_loja,nome,email,perfil,ativo")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (userResult.error) {
      console.error("Erro ao carregar usuário:", userResult.error);
      throw new Error("Erro ao carregar usuário: " + userResult.error.message);
    }

    const user = userResult.data;
    if (!user) {
      throw new Error("Usuário autenticado não foi encontrado na tabela gestao_loja_usuarios.");
    }

    if (!user.ativo) {
      alert("Seu usuário está inativo.");
      await logout();
      return false;
    }

    if (!user.id_loja) {
      throw new Error("O usuário não possui uma loja vinculada (id_loja).");
    }

    console.log("ID da loja:", user.id_loja);

    const storeResult = await db
      .from("gestao_loja_lojas")
      .select("*")
      .eq("id_loja", user.id_loja)
      .maybeSingle();

    if (storeResult.error) {
      console.error("Erro ao carregar loja:", storeResult.error);
      throw new Error("Erro ao carregar loja: " + storeResult.error.message);
    }

    const store = storeResult.data;
    if (!store) {
      throw new Error("A loja vinculada ao usuário não foi encontrada na tabela gestao_loja_lojas.");
    }
    if (!store.id_loja) {
      throw new Error("A loja foi encontrada, mas não possui id_loja.");
    }

    // --- VERIFICAÇÃO DE BLOQUEIO E TRIAL ---
    if (Number(store.id_loja) !== 1) { // A matriz (loja 1) tem passe livre
      const agora = new Date();
      const trialExpirado = store.trial_fim && new Date(store.trial_fim) <= agora;

      if (!store.ativo) {
        await db.auth.signOut();
        alert("O acesso desta loja foi bloqueado pela administração. Entre em contato com o suporte.");
        window.location.replace("index.html");
        return false;
      }

      if (trialExpirado) {
        await db.auth.signOut();
        alert("O período de teste desta loja expirou. Entre em contato para renovar o acesso.");
        window.location.replace("index.html");
        return false;
      }
    }
    // ---------------------------------------

    currentStore = store;
    window.currentStore = currentStore;
    console.log("Loja carregada:", currentStore);

    if ($("userName")) $("userName").textContent = user.nome || "Usuário";
    if ($("userEmail")) $("userEmail").textContent = currentStore.nome_fantasia || currentStore.nome || "Loja";
    if ($("storeName")) $("storeName").textContent = currentStore.nome_fantasia || currentStore.nome || "Loja";
    if ($("storeDisplayName")) $("storeDisplayName").textContent = currentStore.nome_fantasia || currentStore.nome || "Loja";

    if ($("storeDisplayInfo")) {
      const info = [];
      if (currentStore.cnpj) info.push("CNPJ: " + currentStore.cnpj);
      if (currentStore.telefone) info.push("Telefone: " + currentStore.telefone);
      if (currentStore.email) info.push("E-mail: " + currentStore.email);
      if (currentStore.cidade || currentStore.estado) {
        info.push([currentStore.cidade, currentStore.estado].filter(Boolean).join("/"));
      }
      $("storeDisplayInfo").textContent = info.length ? info.join(" • ") : "Dados da loja carregados.";
    }

    return true;

  } catch (error) {
    console.error("Erro ao carregar contexto:", error);
    const pageError = $("pageError");
    if (pageError) {
      showMessage(pageError, error.message || "Não foi possível carregar os dados da loja.");
    }
    return false;
  }
}

/* =========================================================
   MENU
   ========================================================= */
async function loadMenu() {
  const menu = $("menu");
  if (!menu) return;

  try {
    const response = await fetch("menu.html", { cache: "no-cache" });
    if (!response.ok) throw new Error("Não foi possível carregar o menu.");
    menu.innerHTML = await response.text();

    if (currentStore && $("storeName")) {
      $("storeName").textContent = currentStore.nome_fantasia || currentStore.nome || "Loja";
    }

    // Itens visíveis apenas para a loja matriz (loja 1)
    const convitesNav = menu.querySelector('[data-page="convites"]');
    if (convitesNav) {
      convitesNav.style.display = isLojaMatriz() ? "" : "none";
    }

    const lojasNav = menu.querySelector('[data-page="lojas"]');
    if (lojasNav) {
      lojasNav.style.display = isLojaMatriz() ? "" : "none";
    }

    setActiveNav();
  } catch (error) {
    console.error("Erro ao carregar menu:", error);
  }
}

function setActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".nav button").forEach(function (button) {
    button.classList.toggle("active", button.dataset.page === page);
  });
}

/* =========================================================
   DASHBOARD
   ========================================================= */
async function initDashboard() {
  const authenticated = await requireAuth();
  if (!authenticated) return;

  const contextLoaded = await loadUserContext();
  if (!contextLoaded) return;

  await loadMenu();
  setActiveNav();

  if ($("pageSubtitle")) $("pageSubtitle").textContent = "Visão geral da loja";

  try {
    const storeId = currentStore.id_loja;

    const [products, variations, clients] = await Promise.all([
      db.from("gestao_loja_produtos").select("id", { count: "exact", head: true }).eq("id_loja", storeId),
      db.from("gestao_loja_produtos_variacoes").select("id", { count: "exact", head: true }).eq("id_loja", storeId),
      db.from("gestao_loja_clientes").select("id", { count: "exact", head: true }).eq("id_loja", storeId)
    ]);

    if (products.error) throw products.error;
    if (variations.error) throw variations.error;
    if (clients.error) throw clients.error;

    const stock = await db.from("gestao_loja_produtos_variacoes").select("estoque").eq("id_loja", storeId);
    if (stock.error) throw stock.error;

    if ($("countProducts")) $("countProducts").textContent = products.count || 0;
    if ($("countVariations")) $("countVariations").textContent = variations.count || 0;
    if ($("countClients")) $("countClients").textContent = clients.count || 0;

    if ($("totalStock")) {
      $("totalStock").textContent = (stock.data || []).reduce(function (total, item) {
        return total + Number(item.estoque || 0);
      }, 0);
    }
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);
    const content = $("content");
    if (content) {
      content.insertAdjacentHTML("afterbegin",
        '<div class="message error">' + escapeHtml(error.message || "Erro desconhecido.") + "</div>");
    }
  }
}

/* =========================================================
   PÁGINAS PÚBLICAS
   "cadastro" também é pública: NÃO exige auth (é para quem
   ainda não tem conta). Só mostra o menu SE houver sessão.
   ========================================================= */
const PUBLIC_PAGES = [
  "catalogo",
  "cadastro"
];

function isPublicPage() {
  const page = document.body.dataset.page;
  if (PUBLIC_PAGES.includes(page)) return true;
  if (document.getElementById("catalogProducts")) return true;
  return false;
}

function aplicarEstadoMenu(logado) {
  const body = document.body;
  const menu = document.getElementById("menu");
  if (logado) {
    body.classList.add("has-menu");
    if (menu) menu.style.display = "";
  } else {
    body.classList.remove("has-menu");
    if (menu) menu.style.display = "none";
  }
}

async function initPublicPage() {
  const menu = document.getElementById("menu");
  if (!menu) {
    aplicarEstadoMenu(false);
    return;
  }

  try {
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
      aplicarEstadoMenu(false);
      return;
    }

    currentUser = session.user;
    aplicarEstadoMenu(true);

    const contextLoaded = await loadUserContext();
    if (!contextLoaded) {
      aplicarEstadoMenu(false);
      return;
    }

    await loadMenu();
    setActiveNav();
  } catch (error) {
    console.error("Erro ao inicializar página pública com menu:", error);
    aplicarEstadoMenu(false);
  }
}

/* =========================================================
   INICIALIZAÇÃO POR PÁGINA
   Ordem de decisão:
   1) index.html (login) → só login, sem auth
   2) cadastro.html → NÃO exige auth (página pública)
   3) catálogo → auth opcional (só carrega menu se logado)
   4) dashboard → auth obrigatório
   5) demais → auth obrigatório
   ========================================================= */
document.addEventListener("DOMContentLoaded", async function () {

  // 1) Página de login
  const loginForm = $("loginForm");
  if (!!loginForm) {
    login();
    return;
  }

  // 2) Página de cadastro → NUNCA exige auth
  if (
    document.body.dataset.page === "cadastro" ||
    window.location.pathname.endsWith("/cadastro.html")
  ) {
    console.log("[app] Página de cadastro — não exige auth.");
    return;
  }

  // 3) Páginas públicas (catálogo) → auth opcional
  if (isPublicPage()) {
    await initPublicPage();
    return;
  }

  // 4) Dashboard → auth obrigatório
  if (document.body.dataset.page === "dashboard") {
    await initDashboard();
    return;
  }

  // 5) Demais páginas protegidas → auth obrigatório
  const authenticated = await requireAuth();
  if (!authenticated) return;

  const contextLoaded = await loadUserContext();
  if (!contextLoaded) return;

  await loadMenu();
  setActiveNav();
});
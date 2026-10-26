/* ============================================================
   CONFIGURAÇÕES DA LOJA
   ============================================================ */

(function () {
  "use strict";

  let logoAtual = null;
  let logoNova = null; // File escolhido, ainda não enviado
  let removendoLogo = false;

  const msgEl = document.getElementById("cfgMessage");
  const btnSalvar = document.getElementById("btnSalvar");
  const logoPreview = document.getElementById("logoPreview");
  const logoStatus = document.getElementById("logoStatus");
  const logoInput = document.getElementById("logoInput");
  const btnRemoverLogo = document.getElementById("btnRemoverLogo");

  function msg(text, type) {
    msgEl.textContent = text || "";
    msgEl.className = "msg " + (type || "");
  }

  function setLogoPreview(url) {
    if (url) {
      logoPreview.innerHTML = `<img src="${url}" alt="Logo da loja">`;
      btnRemoverLogo.style.display = "";
    } else {
      logoPreview.innerHTML = "<span>Sem logo</span>";
      btnRemoverLogo.style.display = "none";
    }
  }

  async function carregarLoja() {
    // app.js já carregou currentStore
    if (!window.currentStore) {
      return setTimeout(carregarLoja, 300);
    }

    const store = window.currentStore;

    document.getElementById("c_nome").value = store.nome || "";
    document.getElementById("c_nome_fantasia").value = store.nome_fantasia || "";
    document.getElementById("c_razao_social").value = store.razao_social || "";
    document.getElementById("c_cnpj").value = store.cnpj || "";
    document.getElementById("c_email").value = store.email || "";
    document.getElementById("c_telefone").value = store.telefone || "";
    document.getElementById("c_whatsapp").value = store.whatsapp || "";
    document.getElementById("c_site").value = store.site || "";

    document.getElementById("c_cep").value = store.cep || "";
    document.getElementById("c_endereco").value = store.endereco || "";
    document.getElementById("c_numero").value = store.numero || "";
    document.getElementById("c_complemento").value = store.complemento || "";
    document.getElementById("c_bairro").value = store.bairro || "";
    document.getElementById("c_estado").value = store.estado || "";
    document.getElementById("c_cidade").value = store.cidade || "";

    document.getElementById("c_moeda").value = store.moeda || "BRL";
    document.getElementById("c_validade_orcamento").value =
      store.validade_orcamento_padrao ?? 7;

    document.getElementById("c_permitir_estoque_negativo").checked =
      store.permitir_estoque_negativo === true;
    document.getElementById("c_exibir_preco_catalogo").checked =
      store.exibir_preco_catalogo !== false;
    document.getElementById("c_ativo").checked =
      store.ativo !== false;

    logoAtual = store.logo || null;
    setLogoPreview(logoAtual);

    const subtitle = document.getElementById("pageSubtitle");
    if (subtitle) {
      subtitle.textContent =
        "Edite as informações da sua loja";
    }
  }

  /* ---------- Upload de logo ---------- */

  function gerarNomeArquivo(file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const rand = Math.random().toString(36).substring(2, 10);
    return `logo_${Date.now()}_${rand}.${ext}`;
  }

  async function uploadLogo(file) {
    if (!window.currentStore) {
      throw new Error("Loja não carregada.");
    }

    logoStatus.textContent = "Enviando logo...";

    const nome = gerarNomeArquivo(file);
    const caminho = `${currentStore.id_loja}/${nome}`;

    const { error } = await db.storage
      .from("logos")
      .upload(caminho, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (error) {
      logoStatus.textContent = "";
      throw error;
    }

    const { data } = db.storage
      .from("logos")
      .getPublicUrl(caminho);

    logoStatus.textContent = "Logo enviada.";

    return data.publicUrl;
  }

  logoInput.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validação
    if (!file.type.startsWith("image/")) {
      alert("Selecione um arquivo de imagem.");
      logoInput.value = "";
      return;
    }

    const maxMB = 2;
    if (file.size > maxMB * 1024 * 1024) {
      alert(`A imagem deve ter no máximo ${maxMB} MB.`);
      logoInput.value = "";
      return;
    }

    // Preview local imediato
    const reader = new FileReader();
    reader.onload = function (ev) {
      logoPreview.innerHTML = `<img src="${ev.target.result}" alt="Prévia">`;
      btnRemoverLogo.style.display = "";
    };
    reader.readAsDataURL(file);

    logoNova = file;
    removendoLogo = false;
  });

  /* ============================================================
     REMOVER LOGO
     ============================================================
     Opção 1: confirma a intenção e só marca para remoção.
     A exclusão real (banco + bucket) acontece ao clicar em
     "Salvar alterações" (ver btnSalvar abaixo).
     ============================================================ */
  btnRemoverLogo.addEventListener("click", function () {

    const confirmado = confirm(
      "Remover o logo da loja?\n\n" +
      "O logo será apagado do banco e do armazenamento ao salvar as alterações."
    );

    if (!confirmado) return;

    logoNova = null;
    removendoLogo = true;
    logoInput.value = "";
    setLogoPreview(null);
    logoStatus.textContent = "Logo será removida ao salvar.";

  });

  /* ---------- Salvar ---------- */

  btnSalvar.addEventListener("click", async function () {
    if (!window.currentStore) return;

    const nome = document.getElementById("c_nome").value.trim();

    if (!nome) {
      msg("O nome da loja é obrigatório.", "error");
      return;
    }

    const validade = Number(
      document.getElementById("c_validade_orcamento").value
    );

    if (isNaN(validade) || validade < 1 || validade > 365) {
      msg("Validade do orçamento deve ser entre 1 e 365 dias.", "error");
      return;
    }

    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
    msg("");

    try {
      let logoUrl = logoAtual;

      // Upload (se escolheu novo)
      if (logoNova) {
        logoUrl = await uploadLogo(logoNova);
      }

      // Remoção
      if (removendoLogo) {
        logoUrl = null;
      }

      const payload = {
        nome: nome,
        nome_fantasia:
          document.getElementById("c_nome_fantasia").value.trim() || null,
        razao_social:
          document.getElementById("c_razao_social").value.trim() || null,
        cnpj: document.getElementById("c_cnpj").value.trim() || null,
        email: document.getElementById("c_email").value.trim() || null,
        telefone: document.getElementById("c_telefone").value.trim() || null,
        whatsapp: document.getElementById("c_whatsapp").value.trim() || null,
        site: document.getElementById("c_site").value.trim() || null,

        cep: document.getElementById("c_cep").value.trim() || null,
        endereco: document.getElementById("c_endereco").value.trim() || null,
        numero: document.getElementById("c_numero").value.trim() || null,
        complemento:
          document.getElementById("c_complemento").value.trim() || null,
        bairro: document.getElementById("c_bairro").value.trim() || null,
        estado:
          document.getElementById("c_estado").value.trim().toUpperCase() || null,
        cidade: document.getElementById("c_cidade").value.trim() || null,

        moeda: document.getElementById("c_moeda").value,
        validade_orcamento_padrao: validade,
        permitir_estoque_negativo:
          document.getElementById("c_permitir_estoque_negativo").checked,
        exibir_preco_catalogo:
          document.getElementById("c_exibir_preco_catalogo").checked,
        ativo: document.getElementById("c_ativo").checked,

        logo: logoUrl
      };

      const { error } = await db
        .from("gestao_loja_lojas")
        .update(payload)
        .eq("id_loja", currentStore.id_loja);

      if (error) throw error;

      // Atualiza currentStore local
      Object.assign(currentStore, payload);
      window.currentStore = currentStore;

      // Atualiza nome no menu
      if (document.getElementById("storeName")) {
        document.getElementById("storeName").textContent =
          currentStore.nome_fantasia ||
          currentStore.nome ||
          "Loja";
      }

      // Se subiu logo, ela já está no Storage; descarta a referência local
      if (logoNova) {
        logoAtual = logoUrl;
        logoNova = null;
      }
      if (removendoLogo) {
        logoAtual = null;
        removendoLogo = false;
      }

      setLogoPreview(logoAtual);

      msg("Configurações salvas com sucesso!", "success");

    } catch (e) {
      console.error("Erro ao salvar configurações:", e);
      msg(e.message || "Erro ao salvar configurações.", "error");
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar alterações";
    }
  });

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    carregarLoja();
  });
})();
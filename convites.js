(function () {
  let userCtx = null;
  let linkGerado = "";

  const msgEl = document.getElementById("convMsg");
  const btnGerar = document.getElementById("btnGerar");
  const linkBox = document.getElementById("linkBox");
  const linkUrl = document.getElementById("linkUrl");
  const lista = document.getElementById("convLista");
  const btnCopiarRecente = document.getElementById("btnCopiarRecente");

  function msg(text, type) {
    msgEl.textContent = text || "";
    msgEl.className = "msg " + (type || "");
  }

  function gerarToken() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  function montarUrlCadastro(token) {
    return (
      window.location.origin +
      window.location.pathname.replace(/[^/]*$/, "") +
      "index.html?token=" +
      encodeURIComponent(token)
    );
  }

  async function copiarTexto(texto) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (e) {
      console.warn("Clipboard API falhou, usando fallback:", e);
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e) {
      console.error("Fallback de cópia falhou:", e);
      return false;
    }
  }

  async function init() {
    if (!window.db || !window.currentStore) {
      return setTimeout(init, 300);
    }

    const { data: { user } } = await db.auth.getUser();

    if (!user) {
      document.body.innerHTML =
        "<div style='padding:40px;text-align:center;'>Faça login primeiro.</div>";
      return;
    }

    const { data: vinculos, error } = await db
      .from("gestao_loja_usuarios")
      .select("id_loja")
      .eq("id", user.id)
      .limit(1);

    if (error || !vinculos || !vinculos.length) {
      document.body.innerHTML =
        "<div style='padding:40px;text-align:center;'>Sem vínculo com loja.</div>";
      return;
    }

    if (Number(vinculos[0].id_loja) !== 1) {
      document.body.innerHTML =
        "<div style='padding:40px;text-align:center;'>Acesso restrito à loja matriz.</div>";
      return;
    }

    userCtx = { id: user.id, id_loja: vinculos[0].id_loja };

    const subtitle = document.getElementById("pageSubtitle");
    if (subtitle) {
      subtitle.textContent = "Links de cadastro de uso único, válidos por 24h";
    }

    carregarLista();
  }

  async function carregarLista() {
    const { data, error } = await db
      .from("gestao_loja_convites")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(30);

    if (error) {
      lista.innerHTML =
        "<div class='msg error'>Erro: " + error.message + "</div>";
      return;
    }

    if (!data || !data.length) {
      lista.innerHTML =
        "<div style='color:#888;padding:20px;text-align:center;'>Nenhum convite gerado.</div>";
      return;
    }

    const agora = new Date();
    const rows = [];

    for (const c of data) {
      const expirado = new Date(c.expira_em) <= agora;
      const usado = !!c.usado_em;
      const revogado = c.ativo === false && !usado;
      const ativo = !usado && !expirado && !revogado;

      let status = "<span class='badge badge-ativo'>Ativo</span>";
      if (usado) {
        status = "<span class='badge badge-usado'>Usado</span>";
      } else if (expirado) {
        status = "<span class='badge badge-expirado'>Expirado</span>";
      } else if (revogado) {
        status = "<span class='badge badge-revogado'>Revogado</span>";
      }

      const acoes = [];
      if (ativo) {
        const bCopiar = document.createElement("button");
        bCopiar.className = "conv-btn conv-btn-small conv-btn-copy";
        bCopiar.textContent = "📋 Copiar";
        bCopiar.title = "Copiar link de cadastro";
        bCopiar.dataset.token = c.token;
        acoes.push(bCopiar);

        const bRevogar = document.createElement("button");
        bRevogar.className = "conv-btn conv-btn-small conv-btn-danger";
        bRevogar.textContent = "Revogar";
        bRevogar.title = "Revogar este convite";
        bRevogar.dataset.id = String(c.id);
        acoes.push(bRevogar);
      }

      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td class='token-cell'>" +
          c.token.substring(0, 16) + "…" +
        "</td>" +
        "<td>" + new Date(c.criado_em).toLocaleString("pt-BR") + "</td>" +
        "<td>" + new Date(c.expira_em).toLocaleString("pt-BR") + "</td>" +
        "<td>" + status + "</td>";

      const tdAcoes = document.createElement("td");
      tdAcoes.className = "action-cell";
      if (acoes.length) {
        acoes.forEach(function (b) {
          tdAcoes.appendChild(b);
          tdAcoes.appendChild(document.createTextNode(" "));
        });
      } else {
        tdAcoes.innerHTML = "<span style='color:#cbd5e1;'>—</span>";
      }
      tr.appendChild(tdAcoes);
      rows.push(tr);
    }

    const table = document.createElement("table");
    table.className = "conv-table";
    table.innerHTML =
      "<thead><tr>" +
        "<th>Token</th><th>Criado em</th><th>Expira em</th><th>Status</th><th>Ações</th>" +
      "</tr></thead>";
    const tbody = document.createElement("tbody");
    rows.forEach(function (tr) { tbody.appendChild(tr); });
    table.appendChild(tbody);

    lista.innerHTML = "";
    lista.appendChild(table);

    lista.querySelectorAll(".conv-btn-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copiarConvite(btn.dataset.token);
      });
    });
    lista.querySelectorAll(".conv-btn-danger").forEach(function (btn) {
      btn.addEventListener("click", function () {
        revogarConvite(Number(btn.dataset.id));
      });
    });
  }

  btnGerar.addEventListener("click", async function () {
    if (!userCtx) return;

    btnGerar.disabled = true;
    btnGerar.textContent = "Gerando...";
    msg("");

    try {
      const token = gerarToken();
      const expira = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const { error } = await db
        .from("gestao_loja_convites")
        .insert({
          token: token,
          criado_por: userCtx.id,
          expira_em: expira.toISOString(),
          ativo: true
        });

      if (error) throw error;

      linkGerado = montarUrlCadastro(token);
      linkUrl.textContent = linkGerado;
      linkBox.classList.add("visible");

      msg("Convite gerado com sucesso!", "success");
      carregarLista();
    } catch (e) {
      console.error(e);
      msg(e.message || "Erro ao gerar convite.", "error");
    } finally {
      btnGerar.disabled = false;
      btnGerar.textContent = "+ Gerar novo convite";
    }
  });

  btnCopiarRecente.addEventListener("click", async function () {
    if (!linkGerado) return;
    const ok = await copiarTexto(linkGerado);
    msg(
      ok ? "Link copiado para a área de transferência!"
         : "Não foi possível copiar. Copie manualmente.",
      ok ? "success" : "error"
    );
  });

  async function copiarConvite(token) {
    if (!token) return;
    const url = montarUrlCadastro(token);
    const ok = await copiarTexto(url);
    msg(
      ok ? "Link copiado para a área de transferência!"
         : "Não foi possível copiar. Copie manualmente.",
      ok ? "success" : "error"
    );
  }

  async function revogarConvite(id) {
    const confirmado = confirm(
      "Revogar este convite?\n\nO link deixará de funcionar imediatamente."
    );
    if (!confirmado) return;

    try {
      const { error } = await db
        .from("gestao_loja_convites")
        .update({ ativo: false })
        .eq("id", id);

      if (error) throw error;
      msg("Convite revogado com sucesso.", "success");
      carregarLista();
    } catch (e) {
      console.error(e);
      msg(e.message || "Erro ao revogar convite.", "error");
    }
  }

  init();
})();
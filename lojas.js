(function () {
  const TABELA_LOJAS = "gestao_loja_lojas";

  let userCtx = null;
  let cacheLojas = [];

  const msgEl = document.getElementById("lojasMsg");
  const lista = document.getElementById("lojasLista");
  const filtro = document.getElementById("filtroLojas");
  const btnRecarregar = document.getElementById("btnRecarregar");

  function msg(text, type) {
    msgEl.textContent = text || "";
    msgEl.className = "msg " + (type || "");
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
    if (subtitle) subtitle.textContent = "Gestão de lojas, bloqueio e período de teste";

    filtro.addEventListener("input", renderizar);
    btnRecarregar.addEventListener("click", carregarLojas);

    carregarLojas();
  }

  async function carregarLojas() {
    lista.innerHTML = "Carregando...";
    msg("");

    const { data, error } = await db
      .from(TABELA_LOJAS)
      .select(
        "id_loja, nome, razao_social, nome_fantasia, cnpj, email, " +
        "created_at, ativo, trial_dias, trial_fim, plano_nome"
      )
      .order("id_loja", { ascending: true });

    if (error) {
      lista.innerHTML = "<div class='msg error'>Erro: " + error.message + "</div>";
      return;
    }

    cacheLojas = data || [];
    renderizar();
  }

  function statusDaLoja(loja) {
    const agora = new Date();

    if (!loja.ativo) {
      return { label: "Bloqueada", cls: "badge-bloqueado" };
    }

    if (loja.trial_fim) {
      const fim = new Date(loja.trial_fim);
      if (fim <= agora) {
        return { label: "Vencido", cls: "badge-trial-expirado" };
      }
      return { label: "Ativa", cls: "badge-ativa" };
    }

    return { label: "Sem Vencimento", cls: "badge-trial" };
  }

  function formatarData(v) {
    if (!v) return "—";
    try { return new Date(v).toLocaleString("pt-BR"); }
    catch { return String(v); }
  }

  function renderizar() {
    const termo = (filtro.value || "").trim().toLowerCase();

    const filtradas = cacheLojas.filter(function (l) {
      if (!termo) return true;
      const blob = [l.id_loja, l.nome, l.razao_social, l.nome_fantasia, l.cnpj, l.email]
        .filter(Boolean).join(" ").toLowerCase();
      return blob.includes(termo);
    });

    if (!filtradas.length) {
      lista.innerHTML = "<div class='empty-state'>Nenhuma loja encontrada com esse filtro.</div>";
      return;
    }

    const table = document.createElement("table");
    table.className = "conv-table";
    table.innerHTML =
      "<thead><tr>" +
        "<th>ID</th>" +
        "<th>Loja</th>" +
        "<th>Vencimento</th>" +
        "<th>Trial (dias)</th>" +
        "<th>Plano</th>" +
        "<th>Status</th>" +
        "<th style='text-align:right;'>Ações</th>" +
      "</tr></thead>";

    const tbody = document.createElement("tbody");

    filtradas.forEach(function (l) {
      const st = statusDaLoja(l);
      const ehMatriz = Number(l.id_loja) === 1;

      const tr = document.createElement("tr");
      
      const dataTrial = l.trial_fim ? new Date(l.trial_fim).toLocaleDateString('pt-BR') : '—';
      const nomePlano = l.plano_nome || "Teste";

      tr.innerHTML =
        "<td class='cell-id' data-label='ID'>#" + l.id_loja + "</td>" +
        "<td class='cell-loja' data-label='Loja'>" +
          "<div class='loja-nome'>" + (l.nome_fantasia || l.nome || "Loja " + l.id_loja) + "</div>" +
          "<div class='loja-meta'>" + (l.email ? "<span>" + l.email + "</span>" : "") + "</div>" +
        "</td>" +
        "<td data-label='Vencimento'>" + dataTrial + "</td>" +
        "<td data-label='Trial (dias)'>" +
          "<select class='trial-select' data-id='" + l.id_loja + "' " + (ehMatriz ? "disabled" : "") + ">" +
            "<option value='7'"  + (Number(l.trial_dias) === 7  ? " selected" : "") + ">7 dias</option>" +
            "<option value='30'" + (Number(l.trial_dias) === 30 ? " selected" : "") + ">30 dias</option>" +
          "</select>" +
        "</td>" +
        "<td data-label='Plano'><span style='font-weight:600; color:#475569;'>" + nomePlano + "</span></td>" +
        "<td data-label='Status'><span class='badge " + st.cls + "'>" + st.label + "</span></td>";

      const tdAcoes = document.createElement("td");
      tdAcoes.className = "cell-actions";
      tdAcoes.setAttribute("data-label", "Ações");

      if (ehMatriz) {
        tdAcoes.innerHTML = "<span style='color:#cbd5e1; font-size:12px; font-style:italic;'>Matriz</span>";
      } else {
        // Botão de Renovar Plano
        const btnRenovar = document.createElement("button");
        btnRenovar.className = "btn-action btn-renew";
        btnRenovar.textContent = "Renovar";
        btnRenovar.addEventListener("click", function () {
          abrirModalRenovacao(l);
        });

        // Botão de Bloquear
        const btnBloq = document.createElement("button");
        btnBloq.className = "btn-action " + (l.ativo ? "btn-block" : "btn-unblock");
        btnBloq.textContent = l.ativo ? "Bloquear" : "Desbloquear";
        btnBloq.addEventListener("click", function () {
          alternarBloqueio(l);
        });

        tdAcoes.appendChild(btnRenovar);
        tdAcoes.appendChild(btnBloq);
      }

      tr.appendChild(tdAcoes);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    lista.innerHTML = "";
    lista.appendChild(table);

    lista.querySelectorAll(".trial-select").forEach(function (sel) {
      sel.addEventListener("change", function () {
        alterarTrialDias(Number(sel.dataset.id), Number(sel.value));
      });
    });
  }

  // --- MODAL DE RENOVAÇÃO ---
  function abrirModalRenovacao(loja) {
    const hoje = new Date();
    const vencimentoAtual = loja.trial_fim ? new Date(loja.trial_fim) : hoje;
    
    // Se o vencimento já passou, a base é hoje. Se não, a base é o vencimento atual.
    const dataBase = vencimentoAtual > hoje ? vencimentoAtual : hoje;
    const dataBaseStr = dataBase.toLocaleDateString('pt-BR');

    // Monta o HTML que será inserido dentro da div "modalContent" do seu app.js
    const html = `
      <div style="margin-bottom: 20px;">
        <p style="font-size: 14px; color: #64748b; margin-bottom: 8px;">
          Selecione o novo plano para a loja <strong>${escapeHtml(loja.nome_fantasia || loja.nome)}</strong>.
        </p>
        <p style="font-size: 13px; color: #94a3b8;">
          A contagem começará a partir de: <strong>${dataBaseStr}</strong>.
        </p>
      </div>
      
      <div class="plan-options">
        <button class="plan-btn" onclick="window.aplicarPlano(${loja.id_loja}, 90, '3 Meses', '${dataBase.toISOString()}')">
          Plano Trimestral <span>3 Meses</span>
        </button>
        <button class="plan-btn" onclick="window.aplicarPlano(${loja.id_loja}, 180, '6 Meses', '${dataBase.toISOString()}')">
          Plano Semestral <span>6 Meses</span>
        </button>
        <button class="plan-btn" onclick="window.aplicarPlano(${loja.id_loja}, 365, '1 Ano', '${dataBase.toISOString()}')">
          Plano Anual <span>1 Ano</span>
        </button>
      </div>
    `;

    // Chama a função do app.js
    openModal("Renovar Assinatura", html);
  }

  // --- APLICAR PLANO ---
  window.aplicarPlano = async function(id, dias, nomePlano, dataBaseStr) {
    try {
      const base = new Date(dataBaseStr);
      const novaData = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
      
      const { error } = await db
        .from(TABELA_LOJAS)
        .update({ 
          trial_fim: novaData.toISOString(),
          trial_dias: dias,
          plano_nome: nomePlano,
          ativo: true
        })
        .eq("id_loja", id);

      if (error) throw error;
      
      closeModal(); // Função do app.js para fechar
      msg("Assinatura renovada com sucesso até " + novaData.toLocaleDateString('pt-BR'), "success");
      carregarLojas();
    } catch (e) {
      console.error(e);
      msg(e.message || "Erro ao renovar assinatura.", "error");
    }
  };

  // --- OUTRAS FUNÇÕES ---
  async function alternarBloqueio(loja) {
    const acao = loja.ativo ? "bloquear" : "desbloquear";
    if (!confirm("Deseja " + acao + " a loja \"" + (loja.nome || loja.id_loja) + "\"?")) return;

    try {
      const { error } = await db
        .from(TABELA_LOJAS)
        .update({ ativo: !loja.ativo })
        .eq("id_loja", loja.id_loja);

      if (error) throw error;
      msg("Loja " + acao + "da com sucesso.", "success");
      carregarLojas();
    } catch (e) {
      console.error(e);
      msg(e.message || "Erro ao atualizar loja.", "error");
    }
  }

  async function alterarTrialDias(id, dias) {
    try {
      const { data: loja, error: erroBusca } = await db
        .from(TABELA_LOJAS)
        .select("created_at")
        .eq("id_loja", id)
        .single();

      if (erroBusca) throw erroBusca;

      const base = loja.created_at ? new Date(loja.created_at) : new Date();
      const fim = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);

      const { error } = await db
        .from(TABELA_LOJAS)
        .update({ trial_dias: dias, trial_fim: fim.toISOString() })
        .eq("id_loja", id);

      if (error) throw error;
      msg("Trial ajustado para " + dias + " dias (até " + fim.toLocaleDateString("pt-BR") + ").", "success");
      carregarLojas();
    } catch (e) {
      console.error(e);
      msg(e.message || "Erro ao atualizar trial.", "error");
    }
  }

  init();
})();
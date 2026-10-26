(() => {
  "use strict";

  const TABLE = "gestao_loja_movimentos_financeiros";
  let movements = [], filteredMovements = [];

  const $ = id => document.getElementById(id),
    money = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    pad = n => String(n).padStart(2, "0"),
    iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    toDate = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d };

  function db() {
    return window.db
      || (typeof window.supabaseClient !== "undefined" ? window.supabaseClient : null)
      || (typeof globalThis.db !== "undefined" ? globalThis.db : null);
  }
  function store() { return window.currentStore || null; }

  function error(s) {
    $("reportMessage").textContent = s;
    $("reportMessage").className = "message error";
  }
  function success(s) {
    $("reportMessage").textContent = s;
    $("reportMessage").className = "message success";
  }
  function clearMessage() {
    $("reportMessage").textContent = "";
    $("reportMessage").className = "message";
  }

  /* ---------------------------------------------------------------
     NUMERAÇÃO SEQUENCIAL POR LOJA (calculada na exibição)
     ---------------------------------------------------------------
     - Ordena as movimentações da loja atual por `id` (ordem de criação)
     - Atribui 1, 2, 3... na ordem
     - Guarda num Map: id_real → numero_amigavel
     - O `id` real continua sendo usado para editar/estornar
     --------------------------------------------------------------- */
  let numeroPorId = new Map();

  function calcularNumeracaoSequencial() {
    numeroPorId = new Map();

    // Ordena por id crescente (ordem de criação)
    const ordenadas = [...movements].sort((a, b) => {
      return Number(a.id) - Number(b.id);
    });

    let seq = 0;

    ordenadas.forEach(m => {
      seq++;
      numeroPorId.set(String(m.id), seq);
    });
  }

  function getNumero(m) {
    return numeroPorId.get(String(m.id)) || "?";
  }

  /* ---------------------------------------------------------------
     REGIME DE CAIXA POR EVENTO
     --------------------------------------------------------------- */
  function signed(m) {
    const v = +m.valor || 0;
    if (m.tipo === "Estorno") {
      return m.estorno_de_tipo === "Saída" ? v : -v;
    }
    return m.tipo === "Saída" ? -v : v;
  }

  function displayInfo(m) {
    const v = +m.valor || 0;
    if (m.tipo === "Estorno") {
      return m.estorno_de_tipo === "Saída"
        ? { neg: false, value: v }
        : { neg: true,  value: v };
    }
    return m.tipo === "Saída"
      ? { neg: true,  value: v }
      : { neg: false, value: v };
  }

  /* ---------- Filtros ---------- */
  function preset(v) {
    const n = new Date();
    let a = "", b = "";
    if (v === "today") a = b = iso(n);
    if (v === "week") {
      let d = new Date(n);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      a = iso(d); b = iso(n);
    }
    if (v === "month") { a = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-01`; b = iso(n); }
    if (v === "year") { a = `${n.getFullYear()}-01-01`; b = iso(n); }
    if (v === "all") { a = ""; b = ""; }
    $("dateStart").value = a;
    $("dateEnd").value = b;
    $("monthFilter").value = "";
    $("yearFilter").value = v === "year" ? String(n.getFullYear()) : "";
  }

  function years() {
    let s = $("yearFilter"), old = s.value,
      set = new Set([new Date().getFullYear()]);
    movements.forEach(m => {
      let d = toDate(m.data_movimento);
      if (d) set.add(d.getFullYear());
    });
    s.innerHTML = '<option value="">Todos os anos</option>' +
      [...set].sort((a, b) => b - a)
        .map(y => `<option value="${y}">${y}</option>`).join("");
    if ([...set].some(y => String(y) === old)) s.value = old;
  }

  function matches(m) {
    let d = toDate(m.data_movimento);
    if (!d) return false;
    let day = iso(d), a = $("dateStart").value, b = $("dateEnd").value;
    if (a && day < a || b && day > b) return false;
    if ($("monthFilter").value && d.getMonth() + 1 !== +$("monthFilter").value) return false;
    if ($("yearFilter").value && d.getFullYear() !== +$("yearFilter").value) return false;
    if ($("typeFilter").value !== "all" && m.tipo !== $("typeFilter").value) return false;
    if ($("statusFilter").value !== "all" && m.status !== $("statusFilter").value) return false;
    return true;
  }

  /* ---------- Render ---------- */
  function render() {
    // Recalcula a numeração sequencial por loja ANTES de filtrar
    calcularNumeracaoSequencial();

    filteredMovements = movements.filter(matches);

    /* --- Métricas do topo --- */
    let t = {
      entries: 0,
      expenses: 0,
      reversals: 0,
      balance: 0,
      count: 0,
      expenseCount: 0,
      reversalCount: 0
    };

    filteredMovements.forEach(m => {
      const v = +m.valor || 0;

      if (m.tipo === "Estorno") {
        t.reversals += v;
        t.reversalCount++;
      } else if (m.tipo === "Entrada") {
        t.entries += v;

        if (m.status !== "Estornado") {
          t.count++;
        }
      } else if (m.tipo === "Saída") {
        t.expenses += v;

        if (m.status !== "Estornado") {
          t.expenseCount++;
        }
      }

      t.balance += signed(m);
    });

    $("grossRevenue").textContent = money(t.entries - t.reversals);
    $("totalEntries").textContent = money(t.entries);
    $("entryCount").textContent = `${t.count} movimento(s)`;

    $("totalExpenses").textContent = money(t.expenses);
    $("expenseCount").textContent = `${t.expenseCount} movimento(s)`;

    $("totalReversals").textContent = money(t.reversals);
    $("reversalCount").textContent = `${t.reversalCount} estorno(s)`;

    $("netBalance").textContent = money(t.balance);

    /* --- Resumo por período --- */
    let g = $("groupBy").value, groups = new Map();
    filteredMovements.forEach(m => {
      let d = toDate(m.data_movimento);
      if (!d) return;
      let k = g === "year" ? String(d.getFullYear())
        : g === "month" ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
        : iso(d);
      if (!groups.has(k)) groups.set(k, { e: 0, s: 0, r: 0, b: 0 });
      let x = groups.get(k), v = +m.valor || 0;

      if (m.tipo === "Estorno") {
        x.r += v;
      } else if (m.tipo === "Entrada") {
        x.e += v;
      } else if (m.tipo === "Saída") {
        x.s += v;
      }
      x.b += signed(m);
    });

    $("breakdownDescription").textContent =
      `Totais agrupados por ${g === "day" ? "dia" : g === "month" ? "mês" : "ano"}.`;

    let rows = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    $("summaryRows").innerHTML = rows.length
      ? rows.map(([k, x]) => {
          let label = k;
          if (g === "month") {
            let [y, m] = k.split("-");
            label = new Date(+y, +m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
          } else if (g === "day") {
            let [y, m, d] = k.split("-");
            label = `${d}/${m}/${y}`;
          }
          return `<tr>
            <td>${esc(label)}</td>
            <td class="money positive">${money(x.e)}</td>
            <td class="money negative">${money(x.s)}</td>
            <td class="money reversal">${money(x.r)}</td>
            <td class="money ${x.b >= 0 ? "positive" : "negative"}">${money(x.b)}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="5" class="empty">Nenhum movimento neste período.</td></tr>';

    /* --- Lista de movimentações --- */
    let sorted = [...filteredMovements].sort(
      (a, b) => new Date(b.data_movimento) - new Date(a.data_movimento)
    );
    $("movementCount").textContent = `${sorted.length} movimentação(ões) encontrada(s).`;

    $("movementRows").innerHTML = sorted.length
      ? sorted.map(m => {
          let d = toDate(m.data_movimento),
            podeEditar = m.status !== "Estornado" && m.tipo !== "Estorno",
            podeEstornar = m.status !== "Estornado" && m.tipo !== "Estorno";

          // =========================================================
          // Número amigável sequencial por loja
          // =========================================================
          const numeroAmigavel = getNumero(m);

          let badge = "";
          if (m.tipo === "Estorno") {
            // Para estorno, mostra o número amigável do movimento original
            const originalId = String(m.movimento_original_id);
            const numeroOriginal = numeroPorId.get(originalId);

            badge = numeroOriginal
              ? ` <small class="badge-estorno">estorno de #${numeroOriginal}</small>`
              : ` <small class="badge-estorno">estorno</small>`;
          } else if (m.status === "Estornado") {
            badge = ` <small class="badge-estornado">estornado</small>`;
          }

          const info = displayInfo(m);
          const sinal = info.neg ? "−" : "+";
          const cor   = info.neg ? "negative" : "positive";

          let acoes = "";
          if (podeEditar)   acoes += `<button class="btn-icon" data-action="edit"    data-id="${m.id}" title="Editar">✏️</button>`;
          if (podeEstornar) acoes += `<button class="btn-icon" data-action="reverse" data-id="${m.id}" title="Estornar">↩️</button>`;
          if (!acoes)       acoes = '<span class="muted">—</span>';

          return `<tr>
            <td class="id-cell">#${numeroAmigavel}</td>
            <td>${d ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-"}</td>
            <td>${esc(m.descricao)}${badge}</td>
            <td>${esc(m.categoria)}</td>
            <td>${m.pedido_id ? "#" + esc(m.pedido_id) : "-"}</td>
            <td>${esc(m.forma_pagamento || "Não informado")}</td>
            <td>${esc(m.status || "Registrado")}</td>
            <td class="text-right money ${cor}">${sinal}${money(info.value)}</td>
            <td class="text-right actions-cell">${acoes}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="9" class="empty">Nenhuma movimentação encontrada.</td></tr>';

    $("periodCaption").textContent =
      `Período: ${$("dateStart").value || "início"} até ${$("dateEnd").value || "hoje"}.`;
    clearMessage();
  }

  /* ---------- Carregar ---------- */
  async function load() {
    let client = db(), s = store();
    if (!client || !s?.id_loja) {
      error("Conexão ou loja ainda não carregada. Confira app.js.");
      return;
    }
    try {
      let { data, error: e } = await client
        .from(TABLE)
        .select("id,id_loja,pedido_id,tipo,categoria,descricao,valor,forma_pagamento,status,data_movimento,criado_em,movimento_original_id,estorno_de_tipo")
        .eq("id_loja", s.id_loja)
        .order("data_movimento", { ascending: false });
      if (e) throw e;
      movements = (data || []).filter(m => {
          const descricao = String(m.descricao || "")
              .trim()
              .toLowerCase();

          return descricao !== "cartão de crédito";
      });
      years();
      render();
    } catch (e) {
      console.error(e);
      error("Erro ao carregar movimentações: " + e.message);
    }
  }

  /* ---------- Nova movimentação ---------- */
  function openModal() {
    $("movementForm").reset();
    $("movementFormMessage").textContent = "";
    $("movementFormMessage").className = "form-message";
    let d = new Date();
    $("newDate").value = `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $("movementModal").classList.remove("hidden");
  }
  function closeModal() { $("movementModal").classList.add("hidden"); }

  async function save(e) {
    e.preventDefault();
    let client = db(), s = store(),
      msg = $("movementFormMessage"), btn = $("saveMovement");
    if (!client || !s?.id_loja) { msg.textContent = "Loja não identificada."; return; }

    let payload = {
      id_loja: s.id_loja,
      tipo: $("newType").value,
      categoria: $("newCategory").value,
      descricao: $("newDescription").value.trim(),
      valor: Number($("newAmount").value),
      forma_pagamento: $("newPayment").value || null,
      status: "Registrado",
      data_movimento: new Date($("newDate").value).toISOString()
    };
    if (!payload.descricao || payload.valor <= 0) {
      msg.textContent = "Preencha a descrição e um valor maior que zero.";
      return;
    }
    btn.disabled = true;
    try {
      let { error: e } = await client.from(TABLE).insert(payload);
      if (e) throw e;
      msg.className = "form-message success";
      msg.textContent = "Movimentação salva!";
      await load();
      setTimeout(closeModal, 500);
    } catch (e) {
      console.error(e);
      msg.textContent = e.message.includes("pedido_id") || e.message.includes("null value")
        ? "O banco exige pedido_id. Execute o ajuste SQL do pacote para permitir movimentações sem pedido."
        : "Não foi possível salvar: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Editar ---------- */
  function findMovement(id) {
    return movements.find(m => String(m.id) === String(id));
  }

  function openEditModal(id) {
    const m = findMovement(id);
    if (!m) return;
    if (m.tipo === "Estorno" || m.status === "Estornado") {
      error("Movimentações estornadas ou de estorno não podem ser editadas.");
      return;
    }

    // =========================================================
    // Mostra o número amigável no título do modal de edição
    // =========================================================
    const numeroAmigavel = getNumero(m);
    const titulo = document.querySelector("#editMovementModal h2, #editMovementModal .modal-title, #editMovementModal h3");

    if (titulo) {
      titulo.textContent = `Editar movimentação #${numeroAmigavel}`;
    }

    $("editId").value = m.id;
    $("editType").value = m.tipo;
    $("editCategory").value = m.categoria || "Outros";
    $("editDescription").value = m.descricao || "";
    $("editAmount").value = m.valor || "";
    $("editPayment").value = m.forma_pagamento || "";
    const d = toDate(m.data_movimento) || new Date();
    $("editDate").value = `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $("editMovementFormMessage").textContent = "";
    $("editMovementFormMessage").className = "form-message";
    $("editMovementModal").classList.remove("hidden");
  }

  function closeEditModal() { $("editMovementModal").classList.add("hidden"); }

  async function saveEdit(e) {
    e.preventDefault();
    const client = db(), s = store(),
      msg = $("editMovementFormMessage"), btn = $("saveEdit");
    if (!client || !s?.id_loja) { msg.textContent = "Loja não identificada."; return; }

    const id = $("editId").value;
    const original = findMovement(id);
    if (!original) { msg.textContent = "Movimentação não encontrada."; return; }
    if (original.status === "Estornado" || original.tipo === "Estorno") {
      msg.textContent = "Esta movimentação não pode ser editada.";
      return;
    }

    const valor = Number($("editAmount").value);
    const descricao = $("editDescription").value.trim();
    if (!descricao || valor <= 0) {
      msg.textContent = "Preencha a descrição e um valor maior que zero.";
      return;
    }

    const payload = {
      categoria: $("editCategory").value,
      descricao,
      valor,
      forma_pagamento: $("editPayment").value || null,
      data_movimento: new Date($("editDate").value).toISOString()
    };

    btn.disabled = true;
    try {
      const { error: e } = await client
        .from(TABLE)
        .update(payload)
        .eq("id", id)
        .eq("id_loja", s.id_loja);
      if (e) throw e;
      msg.className = "form-message success";
      msg.textContent = "Movimentação atualizada!";
      await load();
      setTimeout(closeEditModal, 500);
    } catch (e) {
      console.error(e);
      msg.textContent = "Não foi possível salvar: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Estornar ---------- */
  async function reverseMovement(id) {
    const m = findMovement(id);
    if (!m) return;
    if (m.tipo === "Estorno" || m.status === "Estornado") {
      error("Esta movimentação não pode ser estornada.");
      return;
    }

    // =========================================================
    // Usa o número amigável na confirmação
    // =========================================================
    const numeroAmigavel = getNumero(m);

    const ok = confirm(
      `Estornar a movimentação #${numeroAmigavel} "${m.descricao}" de ${money(m.valor)}?\n\n` +
      `Um novo registro de estorno será criado.`
    );
    if (!ok) return;

    const client = db();
    if (!client) { error("Sem conexão com o banco."); return; }

    try {
      const { data, error: e } = await client.rpc("estornar_movimento_financeiro", { p_movimento_id: m.id });
      if (e) throw e;
      await load();
      success(`Estorno registrado com sucesso${data?.estorno_id ? " (#" + data.estorno_id + ")" : ""}.`);
    } catch (e) {
      console.error(e);
      error("Não foi possível estornar: " + e.message);
    }
  }

  /* ---------- Export CSV ---------- */
  function csv() {
    if (!filteredMovements.length) {
      error("Não há movimentações para exportar.");
      return;
    }

    // Formata valores no padrão brasileiro: 1234,56
    function formatDecimal(value) {
      return Number(value || 0).toFixed(2).replace(".", ",");
    }

    // =========================================================
    // Exporta o número amigável (não o id global)
    // =========================================================
    const data = [
      ["Nº", "Data", "Descrição", "Categoria", "Pedido", "Tipo", "Pagamento", "Status", "Valor"],

      ...filteredMovements.map(m => [
        getNumero(m),
        m.data_movimento,
        m.descricao,
        m.categoria,
        m.pedido_id,
        m.tipo,
        m.forma_pagamento,
        m.status,
        formatDecimal(m.valor)
      ])
    ];

    const c = data
      .map(row =>
        row.map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(";")
      )
      .join("\r\n");

    const u = URL.createObjectURL(
      new Blob(["\ufeff" + c], {
        type: "text/csv;charset=utf-8"
      })
    );

    const a = document.createElement("a");
    a.href = u;
    a.download = `financeiro-${iso(new Date())}.csv`;
    a.click();

    URL.revokeObjectURL(u);
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    preset("month");

    $("periodPreset").addEventListener("change", () => {
      if ($("periodPreset").value !== "custom") {
        preset($("periodPreset").value);
        render();
      }
    });

    $("applyFilters").addEventListener("click", () => {
      if ($("dateStart").value && $("dateEnd").value && $("dateStart").value > $("dateEnd").value) {
        error("Data inicial posterior à data final.");
        return;
      }
      render();
    });

    $("clearFilters").addEventListener("click", () => {
      $("periodPreset").value = "all";
      $("typeFilter").value = $("statusFilter").value = "all";
      preset("all");
      render();
    });

    $("refreshReport").addEventListener("click", load);
    $("groupBy").addEventListener("change", render);
    $("exportCsv").addEventListener("click", csv);

    $("newMovement").addEventListener("click", openModal);
    $("closeMovementModal").addEventListener("click", closeModal);
    $("cancelMovement").addEventListener("click", closeModal);
    $("movementForm").addEventListener("submit", save);
    $("movementModal").addEventListener("click", e => {
      if (e.target === $("movementModal")) closeModal();
    });

    $("closeEditModal").addEventListener("click", closeEditModal);
    $("cancelEdit").addEventListener("click", closeEditModal);
    $("editMovementForm").addEventListener("submit", saveEdit);
    $("editMovementModal").addEventListener("click", e => {
      if (e.target === $("editMovementModal")) closeEditModal();
    });

    $("movementRows").addEventListener("click", e => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit")    openEditModal(id);
      if (btn.dataset.action === "reverse") reverseMovement(id);
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeModal(); closeEditModal(); }
    });

    ["monthFilter", "yearFilter", "typeFilter", "statusFilter"].forEach(id => {
      $(id).addEventListener("change", () => { $("periodPreset").value = "custom"; });
    });

    let n = 0, t = setInterval(() => {
      n++;
      if (db() && store()?.id_loja) { clearInterval(t); load(); }
      else if (n > 60) {
        clearInterval(t);
        error("Não foi possível carregar a loja. Confira app.js.");
      }
    }, 250);
  });
})();
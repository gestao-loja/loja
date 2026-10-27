let insumos = [];
let categoriasInsumos = [];
let fornecedoresCache = null;

/*
 * Carrega as categorias específicas de insumos da loja
 */
async function loadCategoriasInsumos() {
  if (!currentStore || !currentStore.id_loja) return;

  const result = await db
    .from("gestao_loja_categorias_insumos")
    .select("id, nome")
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (result.error) throw result.error;
  categoriasInsumos = result.data || [];
}

/*
 * Carrega a lista de insumos
 */
async function loadInsumos() {
  if (!currentStore || !currentStore.id_loja) return;

  const result = await db
    .from("gestao_loja_insumos")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (result.error) throw result.error;
  insumos = result.data || [];
}

/*
 * Renderiza a tabela de insumos
 */
async function renderInsumos() {
  try {
    await loadInsumos();
    await loadCategoriasInsumos();
  } catch (e) {
    $("productsTable").innerHTML = `<div class="message error">${escapeHtml(e.message)}</div>`;
    return;
  }

  if (!insumos.length) {
    $("productsTable").innerHTML = '<div class="empty">Nenhum insumo cadastrado.</div>';
    return;
  }

  $("productsTable").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Insumo</th>
            <th>SKU</th>
            <th>Categoria</th>
            <th>Unidade</th>
            <th>Custo (R$)</th>
            <th>Estoque Atual</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${insumos.map(function(i) {
            const categoria = categoriasInsumos.find(c => String(c.id) === String(i.categoria_id));
            const badgeClass = i.ativo ? "badge-green" : "badge-red";
            const estoqueFormatado = Number(i.estoque_atual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

            return `
              <tr>
                <td><strong>${escapeHtml(i.nome)}</strong></td>
                <td><strong>${escapeHtml(i.sku || "-")}</strong></td>
                <td>${categoria ? escapeHtml(categoria.nome) : "-"}</td>
                <td>${escapeHtml(i.unidade_medida || "UN")}</td>
                <td>${money(i.preco_custo)}</td>
                <td>
                ${estoqueFormatado}
                ${Number(i.estoque_atual) <= Number(i.estoque_minimo) 
                    ? '<span style="color: #ef4444; font-size: 11px; margin-left: 4px;" title="Estoque abaixo do mínimo!">⚠️ Baixo</span>' 
                    : ''}
                </td>
                <td>
                  <span class="badge ${badgeClass}">
                    ${i.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-secondary" onclick="editInsumo('${i.id}')">Editar</button>
                    <button class="btn btn-primary" onclick="openMovimentarInsumo('${i.id}')">Movimentar</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/*
 * Formulário de cadastro/edição de Insumo
 */
function insumoForm(i = {}) {
  const categoryOptions = categoriasInsumos.map(function(c) {
    return `<option value="${c.id}" ${String(i.categoria_id || "") === String(c.id) ? "selected" : ""}>${escapeHtml(c.nome)}</option>`;
  }).join("");

  return `
    <form onsubmit="saveInsumo(event, ${i.id ? `'${i.id}'` : "null"})">
      
      <div class="grid2">
        <div>
          <label>Nome do insumo *</label>
          <input id="i_nome" required value="${escapeHtml(i.nome || "")}">
        </div>
        <div>
          <label>Categoria (Insumos)</label>
          <select id="i_categoria">
            <option value="">Sem categoria</option>
            ${categoryOptions}
          </select>
        </div>
      </div>

      <div class="grid2">
        <div>
          <label>SKU (Opcional)</label>
          <input id="i_sku" value="${escapeHtml(i.sku || "")}">
        </div>
        <div>
          <label>Unidade de Medida</label>
          <select id="i_unidade">
            <option value="UN" ${i.unidade_medida === 'UN' ? 'selected' : ''}>UN - Unidade</option>
            <option value="KG" ${i.unidade_medida === 'KG' ? 'selected' : ''}>KG - Quilograma</option>
            <option value="G" ${i.unidade_medida === 'G' ? 'selected' : ''}>G - Grama</option>
            <option value="M" ${i.unidade_medida === 'M' ? 'selected' : ''}>M - Metro</option>
            <option value="M2" ${i.unidade_medida === 'M2' ? 'selected' : ''}>M² - Metro Quadrado</option>
            <option value="L" ${i.unidade_medida === 'L' ? 'selected' : ''}>L - Litro</option>
            <option value="ML" ${i.unidade_medida === 'ML' ? 'selected' : ''}>ML - Mililitro</option>
            <option value="CX" ${i.unidade_medida === 'CX' ? 'selected' : ''}>CX - Caixa</option>
          </select>
        </div>
      </div>

      <div class="grid2">
        <div>
          <label>Preço de Custo (R$)</label>
          <input id="i_custo" type="number" step="0.01" min="0" value="${i.preco_custo ?? 0}">
        </div>
        <div>
          <label>Estoque Mínimo (Alerta)</label>
          <input id="i_minimo" type="number" step="0.001" min="0" value="${i.estoque_minimo ?? 0}">
        </div>
      </div>

      <div class="grid2">
        <div>
          <label>Estoque Atual</label>
          <input id="i_estoque" type="number" step="0.001" min="0" value="${i.estoque_atual ?? 0}">
        </div>
        <div>
          <label style="margin-top: 28px; display: flex; align-items: center; gap: 8px;">
            <input id="i_ativo" type="checkbox" style="width:auto" ${i.ativo !== false ? "checked" : ""}>
            Insumo Ativo
          </label>
        </div>
      </div>

      <div>
        <label>Observações</label>
        <textarea id="i_obs" rows="3">${escapeHtml(i.observacoes || "")}</textarea>
      </div>

      <button class="btn btn-primary full" type="submit" style="margin-top:16px;">
        Salvar insumo
      </button>

    </form>
  `;
}

/*
 * Abrir modal de NOVO insumo
 */
function newInsumo() {
  openModal("Novo insumo", insumoForm({ ativo: true }));
}

/*
 * Abrir modal de EDIÇÃO de insumo
 */
function editInsumo(id) {
  const insumo = insumos.find(i => String(i.id) === String(id));
  if (!insumo) {
    alert("Insumo não encontrado.");
    return;
  }
  openModal("Editar insumo", insumoForm(insumo));
}

/*
 * Salvar Insumo no Banco
 */
async function saveInsumo(ev, id) {
  ev.preventDefault();
  if (!currentStore) return;

  const botao = ev.submitter;
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Salvando...";
  }

  const payload = {
    id_loja: currentStore.id_loja,
    nome: $("i_nome").value.trim(),
    categoria_id: $("i_categoria").value ? Number($("i_categoria").value) : null,
    sku: $("i_sku").value.trim() || null,
    unidade_medida: $("i_unidade").value,
    preco_custo: Number($("i_custo").value) || 0,
    estoque_minimo: Number($("i_minimo").value) || 0,
    estoque_atual: Number($("i_estoque").value) || 0,
    ativo: $("i_ativo").checked,
    observacoes: $("i_obs").value.trim() || null
  };

  try {
    let result;
    if (id) {
      result = await db.from("gestao_loja_insumos").update(payload).eq("id", id).eq("id_loja", currentStore.id_loja);
    } else {
      result = await db.from("gestao_loja_insumos").insert(payload);
    }

    if (result.error) throw result.error;

    closeModal();
    await renderInsumos();
  } catch (e) {
    console.error(e);
    alert("Erro ao salvar insumo: " + (e.message || "Erro desconhecido."));
  } finally {
    if (botao && botao.isConnected) {
      botao.disabled = false;
      botao.textContent = "Salvar insumo";
    }
  }
}

/* ======================================================
   MOVIMENTAÇÃO DE ESTOQUE (ENTRADA / SAÍDA / AJUSTE)
   + Movimentação financeira automática em compras
   ====================================================== */

/*
 * Carrega fornecedores cadastrados na loja (se existir tabela).
 * Retorna [] se a tabela não existir ou se der timeout.
 * Cacheado — só consulta uma vez por sessão.
 */
async function loadFornecedoresInsumo() {
  if (fornecedoresCache !== null) return fornecedoresCache;
  if (!currentStore || !currentStore.id_loja) return [];

  try {
    const query = db
      .from("gestao_loja_fornecedores")
      .select("id, razao_social, nome_fantasia, ativo")
      .eq("id_loja", currentStore.id_loja)
      .order("razao_social");

    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("timeout ao consultar fornecedores")), 2500)
    );

    const result = await Promise.race([query, timeout]);

    if (result.error) {
      console.error("[fornecedores] erro Supabase:", result.error);
      fornecedoresCache = [];
      return [];
    }

    // Normaliza para { id, nome } — usa nome_fantasia se existir
    fornecedoresCache = (result.data || [])
      .filter(f => f.ativo !== false) // só ativos
      .map(f => {
        const fantasia = (f.nome_fantasia || "").trim();
        const razao = (f.razao_social || "").trim();
        let label;
        if (fantasia && razao && fantasia.toLowerCase() !== razao.toLowerCase()) {
          label = `${fantasia} (${razao})`;
        } else {
          label = fantasia || razao || `Fornecedor #${f.id}`;
        }
        return { id: f.id, nome: label };
      });

    if (fornecedoresCache.length === 0) {
      console.warn(
        "[fornecedores] 0 registros retornados. " +
        "Verifique: (1) RLS de SELECT, (2) se há fornecedores com ativo=true."
      );
    }

    return fornecedoresCache;
  } catch (e) {
    console.error("[fornecedores] falha:", e);
    fornecedoresCache = [];
    return [];
  }
}

/*
 * Abre o modal de movimentação de um insumo
 */
async function openMovimentarInsumo(id) {
  const insumo = insumos.find(i => String(i.id) === String(id));
  if (!insumo) {
    alert("Insumo não encontrado.");
    return;
  }

  // Carrega fornecedores com timeout embutido — nunca trava o modal
  let fornecedores = [];
  try {
    fornecedores = await loadFornecedoresInsumo();
  } catch (e) {
    fornecedores = [];
  }

  const unidade = insumo.unidade_medida || "UN";
  const estoqueAtual = Number(insumo.estoque_atual || 0);
  const custoPadrao = Number(insumo.preco_custo || 0);

  const fornecedorOptions = fornecedores.length
    ? `<option value="">— Selecione —</option>` +
      fornecedores.map(f =>
        `<option value="${escapeHtml(f.id)}" data-nome="${escapeHtml(f.nome)}">${escapeHtml(f.nome)}</option>`
      ).join("") +
      `<option value="__manual__">✏️ Digitar manualmente…</option>`
    : `<option value="__manual__">✏️ Digitar manualmente…</option>`;

  openModal(
    `Movimentar estoque — ${escapeHtml(insumo.nome)}`,
    `
    <form onsubmit="saveMovimentacaoInsumo(event, '${insumo.id}')">

      <div style="
        background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:16px;
        display:flex;justify-content:space-between;align-items:center;
      ">
        <span style="font-size:13px;color:#6b7280;">Estoque atual</span>
        <strong style="font-size:18px;">
          ${estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${escapeHtml(unidade)}
        </strong>
      </div>

      <div class="grid2">
        <div>
          <label>Tipo de movimentação *</label>
          <select id="m_tipo" required onchange="onTipoMovimentacaoChange('${insumo.id}')">
            <option value="entrada">Entrada (+)</option>
            <option value="saida">Saída (−)</option>
            <option value="ajuste_mais">Ajuste para mais (+)</option>
            <option value="ajuste_menos">Ajuste para menos (−)</option>
          </select>
        </div>
        <div>
          <label>Quantidade *</label>
          <input id="m_quantidade" type="number" step="0.001" min="0" required value="0"
                 oninput="updateMovimentacaoPreview('${insumo.id}')">
        </div>
      </div>

      <div id="m_preview" style="
        margin:12px 0 16px;padding:10px 12px;border-radius:8px;
        background:#eff6ff;border:1px solid #bfdbfe;font-size:14px;color:#1e3a8a;
      ">
        Novo estoque: <strong>${estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${escapeHtml(unidade)}</strong>
      </div>

      <div>
        <label>Preço de custo unitário (R$)</label>
        <input id="m_custo" type="number" step="0.01" min="0" value="${custoPadrao}"
               oninput="updateMovimentacaoPreview('${insumo.id}')">
        <small style="color:#6b7280;font-size:12px;">
          Se informado em entradas, atualiza o custo do insumo.
        </small>
      </div>

      <div style="margin-top:12px;">
        <label>Observação do estoque</label>
        <textarea id="m_obs" rows="2" placeholder="Ex.: Compra fornecedor XYZ, perda, inventário..."></textarea>
      </div>

      <!-- ============================================================
           BLOCO FINANCEIRO (exibido só quando tipo = entrada)
           ============================================================ -->
      <div id="m_financeiro_bloco" style="
        margin-top:20px;padding:14px;border-radius:10px;
        background:#fefce8;border:1px solid #fde68a;display:none;
      ">
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:12px;">
          <input id="m_fin_ativo" type="checkbox" checked style="width:auto"
                 onchange="toggleFinanceiroBloco()">
          Registrar movimentação financeira (compra)
        </label>

        <div id="m_fin_fields">
          <div class="grid2">
            <div>
              <label>Fornecedor</label>
              <select id="m_fornecedor_select" onchange="onFornecedorChange()">
                ${fornecedorOptions}
              </select>
              <input id="m_fornecedor_manual" type="text" placeholder="Digite o nome do fornecedor"
                     style="display:none;margin-top:6px;" maxlength="120">
            </div>
            <div>
              <label>Forma de pagamento</label>
              <select id="m_forma_pagamento">
                <option value="">— Selecione —</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="Cartão de Débito">Cartão de Débito</option>
                <option value="Cartão de Crédito">Cartão de Crédito</option>
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>

          <div class="grid2" style="margin-top:10px;">
            <div>
              <label>Valor total (R$)</label>
              <input id="m_fin_valor" type="number" step="0.01" min="0" value="0">
              <small style="color:#6b7280;font-size:12px;">
                Calculado como quantidade × custo unitário. Pode ajustar (frete, desconto...).
              </small>
            </div>
            <div>
              <label>Data do movimento financeiro</label>
              <input id="m_fin_data" type="datetime-local">
            </div>
          </div>

          <div style="margin-top:10px;">
            <label>Descrição financeira</label>
            <input id="m_fin_descricao" type="text" maxlength="200">
          </div>
        </div>
      </div>

      <button class="btn btn-primary full" type="submit" style="margin-top:16px;">
        Confirmar movimentação
      </button>

    </form>
    `
  );

  // Data/hora padrão = agora
  const now = new Date();
  const pad2 = n => String(n).padStart(2, "0");
  const isoLocal = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  const finData = $("m_fin_data");
  if (finData) finData.value = isoLocal;

  const finDesc = $("m_fin_descricao");
  if (finDesc) finDesc.value = `Compra de insumo: ${insumo.nome}`;

  // Marca edição manual no valor financeiro (para não sobrescrever)
  const finValor = $("m_fin_valor");
  if (finValor) {
    finValor.addEventListener("input", () => {
      finValor.dataset.touched = "1";
    });
  }

  // Ajusta visibilidade inicial do bloco financeiro
  onTipoMovimentacaoChange(insumo.id);
  onFornecedorChange();
}

/*
 * Mostra/esconde bloco financeiro conforme tipo
 */
function onTipoMovimentacaoChange(insumoId) {
  const tipo = $("m_tipo")?.value;
  const bloco = $("m_financeiro_bloco");
  if (!bloco) return;

  bloco.style.display = (tipo === "entrada") ? "block" : "none";

  updateMovimentacaoPreview(insumoId);
}

/*
 * Alterna campos financeiros conforme checkbox
 */
function toggleFinanceiroBloco() {
  const ativo = $("m_fin_ativo")?.checked;
  const fields = $("m_fin_fields");
  if (fields) fields.style.display = ativo ? "block" : "none";
}

/*
 * Mostra/esconde input manual de fornecedor
 */
function onFornecedorChange() {
  const sel = $("m_fornecedor_select");
  const manual = $("m_fornecedor_manual");
  if (!sel || !manual) return;

  const isManual = sel.value === "__manual__";
  manual.style.display = isManual ? "block" : "none";
  if (isManual) manual.focus();
}

/*
 * Calcula preview do novo estoque + valor financeiro
 */
function updateMovimentacaoPreview(insumoId) {
  const insumo = insumos.find(i => String(i.id) === String(insumoId));
  if (!insumo) return;

  const tipo = $("m_tipo")?.value || "entrada";
  const qtd = Number($("m_quantidade")?.value) || 0;
  const atual = Number(insumo.estoque_atual || 0);
  const unidade = insumo.unidade_medida || "UN";

  let novo = atual;
  if (tipo === "entrada" || tipo === "ajuste_mais") novo = atual + qtd;
  else if (tipo === "saida" || tipo === "ajuste_menos") novo = atual - qtd;

  const cor = novo < 0 ? "#ef4444" : "#1e3a8a";
  const preview = $("m_preview");
  if (preview) {
    preview.style.color = cor;
    preview.innerHTML = `Novo estoque: <strong style="color:${cor};">${novo.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${escapeHtml(unidade)}</strong>`;
    if (novo < 0) preview.innerHTML += ` <span style="font-size:12px;">(ficará negativo!)</span>`;
  }

  updateFinanceiroPreview();
}

/*
 * Atualiza o campo valor financeiro com base em quantidade × custo
 * (somente se o usuário ainda não tiver editado manualmente)
 */
function updateFinanceiroPreview() {
  const valorInput = $("m_fin_valor");
  if (!valorInput) return;

  if (valorInput.dataset.touched === "1") return;

  const qtd = Number($("m_quantidade")?.value) || 0;
  const custo = Number($("m_custo")?.value) || 0;
  valorInput.value = (qtd * custo).toFixed(2);
}

/*
 * Salva movimentação de estoque + financeira (se aplicável)
 */
async function saveMovimentacaoInsumo(ev, insumoId) {
  ev.preventDefault();
  if (!currentStore) return;

  const insumo = insumos.find(i => String(i.id) === String(insumoId));
  if (!insumo) { alert("Insumo não encontrado."); return; }

  const tipo = $("m_tipo").value;
  const quantidade = Number($("m_quantidade").value) || 0;
  const custoUnitario = Number($("m_custo").value) || 0;
  const observacao = $("m_obs").value.trim() || null;

  if (quantidade <= 0) {
    alert("Informe uma quantidade maior que zero.");
    return;
  }

  const estoqueAtual = Number(insumo.estoque_atual || 0);
  let novoEstoque = estoqueAtual;
  if (tipo === "entrada" || tipo === "ajuste_mais") novoEstoque = estoqueAtual + quantidade;
  else if (tipo === "saida" || tipo === "ajuste_menos") novoEstoque = estoqueAtual - quantidade;

  if (novoEstoque < 0) {
    if (!confirm(`Atenção: o estoque ficará negativo (${novoEstoque}). Deseja continuar?`)) return;
  }

  // ---------- Dados financeiros ----------
  let financeiroPayload = null;

  if (tipo === "entrada" && $("m_fin_ativo")?.checked) {
    let fornecedorNome = null;
    const sel = $("m_fornecedor_select");
    const manual = $("m_fornecedor_manual");

    if (sel && sel.value === "__manual__") {
      fornecedorNome = (manual?.value || "").trim() || null;
    } else if (sel && sel.value) {
      const opt = sel.options[sel.selectedIndex];
      fornecedorNome = opt?.dataset?.nome || opt?.textContent?.trim() || null;
    }

    const valorFin = Number($("m_fin_valor").value) || 0;
    const formaPagamento = $("m_forma_pagamento").value || null;
    const dataFinStr = $("m_fin_data").value;
    const descricaoFin = $("m_fin_descricao").value.trim() || `Compra de insumo: ${insumo.nome}`;

    if (valorFin > 0) {
      financeiroPayload = {
        id_loja: currentStore.id_loja,
        pedido_id: null,
        tipo: "Saída",
        categoria: "Compra de insumo",
        descricao: fornecedorNome
          ? `${descricaoFin} — ${fornecedorNome}`
          : descricaoFin,
        valor: valorFin,
        forma_pagamento: formaPagamento,
        status: "Registrado",
        data_movimento: dataFinStr
          ? new Date(dataFinStr).toISOString()
          : new Date().toISOString()
      };
    }
  }

  // ---------- Execução ----------
  const botao = ev.submitter;
  if (botao) { botao.disabled = true; botao.textContent = "Salvando..."; }

  try {
    // 1) Movimentação de estoque (histórico)
    const movPayload = {
      id_loja: currentStore.id_loja,
      insumo_id: insumo.id,
      tipo: tipo,
      quantidade: quantidade,
      estoque_anterior: estoqueAtual,
      estoque_novo: novoEstoque,
      custo_unitario: custoUnitario,
      observacao: observacao
    };

    const movResult = await db.from("gestao_loja_insumos_movimentacoes").insert(movPayload);
    if (movResult.error) {
      console.warn("Aviso ao gravar movimentação de estoque:", movResult.error.message);
    }

    // 2) Atualiza insumo (estoque + custo)
    const updatePayload = { estoque_atual: novoEstoque };
    if ((tipo === "entrada" || tipo === "ajuste_mais") && custoUnitario > 0) {
      updatePayload.preco_custo = custoUnitario;
    }

    const updResult = await db
      .from("gestao_loja_insumos")
      .update(updatePayload)
      .eq("id", insumo.id)
      .eq("id_loja", currentStore.id_loja);

    if (updResult.error) throw updResult.error;

    // 3) Movimentação financeira (se aplicável)
    let msgExtra = "";
    if (financeiroPayload) {
      const finResult = await db
        .from("gestao_loja_movimentos_financeiros")
        .insert(financeiroPayload);

      if (finResult.error) {
        msgExtra = `\n⚠️ Estoque atualizado, mas a movimentação financeira falhou: ${finResult.error.message}`;
      } else {
        msgExtra = `\n💸 Saída financeira de ${financeiroPayload.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrada.`;
      }
    }

    closeModal();
    await renderInsumos();
    alert("Movimentação registrada com sucesso!" + msgExtra);
  } catch (e) {
    console.error(e);
    alert("Erro ao movimentar estoque: " + (e.message || "Erro desconhecido."));
  } finally {
    if (botao && botao.isConnected) {
      botao.disabled = false;
      botao.textContent = "Confirmar movimentação";
    }
  }
}

/* ======================================================
   CATEGORIA DE INSUMOS
   ====================================================== */

/*
 * Formulário de cadastro de Categoria de Insumo
 */
function newCategoryInsumo() {
  openModal(
    "Nova categoria de insumo",
    `
    <form onsubmit="saveCategoryInsumo(event)">
      <div>
        <label for="ci_nome">Nome da categoria *</label>
        <input id="ci_nome" type="text" required maxlength="100" placeholder="Ex.: Embalagens, Tecidos, Metais" autocomplete="off">
      </div>
      <button class="btn btn-primary full" type="submit" style="margin-top:16px;">
        Salvar categoria
      </button>
    </form>
    `
  );
}

/*
 * Salvar Categoria de Insumo no Banco
 */
async function saveCategoryInsumo(ev) {
  ev.preventDefault();
  if (!currentStore) return;

  const nome = $("ci_nome").value.trim();
  if (!nome) return;

  const botao = ev.submitter;
  if (botao) { botao.disabled = true; botao.textContent = "Salvando..."; }

  try {
    // Verifica duplicidade
    const consulta = await db
      .from("gestao_loja_categorias_insumos")
      .select("id")
      .eq("id_loja", currentStore.id_loja)
      .ilike("nome", nome);

    if (consulta.data && consulta.data.length > 0) {
      alert("Esta categoria de insumo já existe.");
      return;
    }

    const resultado = await db.from("gestao_loja_categorias_insumos").insert({
      id_loja: currentStore.id_loja,
      nome: nome
    });

    if (resultado.error) throw resultado.error;

    closeModal();
    await renderInsumos();
    alert("Categoria cadastrada com sucesso!");
  } catch (e) {
    console.error(e);
    alert("Erro ao cadastrar categoria: " + e.message);
  } finally {
    if (botao && botao.isConnected) {
      botao.disabled = false;
      botao.textContent = "Salvar categoria";
    }
  }
}

/* ======================================================
   BOOT DA PÁGINA
   ====================================================== */
document.addEventListener("DOMContentLoaded", async function() {
  const authenticated = await requireAuth();
  if (!authenticated) return;

  const contextLoaded = await loadUserContext();
  if (!contextLoaded) return;

  setActiveNav();
  $("pageSubtitle").textContent = "Cadastre e gerencie a matéria-prima da sua loja";

  await renderInsumos();
});
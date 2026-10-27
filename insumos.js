let insumos = [];
let categoriasInsumos = [];

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
                  <button class="btn btn-secondary" onclick="editInsumo('${i.id}')">Editar</button>
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
    await renderInsumos(); // Recarrega a tabela
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
let variations = [];
let products = [];
let editingVariationId = null;
let currentImageUrl = null;

// Variáveis da Galeria de Fotos
let galeriaUrlsAtuais = [];
let galeriaNovosFiles = [];

// Variáveis de Filtro
let filterSearch = "";
let filterStatus = "";

/*
 * ==========================================================
 * SKU — geração sequencial POR LOJA
 * ==========================================================
 */
async function proximaSequenciaSkuVariacao() {
  const result = await db
    .from("gestao_loja_produtos_variacoes")
    .select("sku")
    .eq("id_loja", currentStore.id_loja)
    .not("sku", "is", null);

  if (result.error) throw result.error;

  let maiorSequencia = 0;

  if (result.data && result.data.length > 0) {
    result.data.forEach(function(item) {
      if (item.sku) {
        const partes = item.sku.split("-");
        const ultimaParte = partes[partes.length - 1];
        const numero = parseInt(ultimaParte, 10);
        if (!isNaN(numero) && numero > maiorSequencia) {
          maiorSequencia = numero;
        }
      }
    });
  }
  return maiorSequencia + 1;
}

function generateSkuVariacao(produtoSku, sequencia) {
  const base = String(produtoSku || "VAR").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const numero = String(sequencia).padStart(5, "0");
  return `${base}-${numero}`;
}

/*
 * ==========================================================
 * PRECIFICAÇÃO
 * ==========================================================
 */
function calcularPrecificacao(dados) {
  const materiais = Number(dados.materiais) || 0;
  const embalagem = Number(dados.embalagem) || 0;
  const maoObra   = Number(dados.maoObra)   || 0;
  const outros    = Number(dados.outros)    || 0;
  const taxas    = Number(dados.taxas)    || 0;
  const impostos = Number(dados.impostos) || 0;
  const despesas = Number(dados.despesas) || 0;
  const margem   = Number(dados.margem)   || 0;

  const custoTotal = materiais + embalagem + maoObra + outros;
  const percentualTotal = taxas + impostos + despesas + margem;

  if (percentualTotal >= 100) {
    return {
      custoTotal: Number(custoTotal.toFixed(2)),
      precoSugerido: 0,
      divisor: 0,
      erro: "A soma de taxas, impostos, despesas e margem deve ser menor que 100%. Atualmente: " + percentualTotal.toFixed(2) + "%."
    };
  }

  const divisor = 1 - (percentualTotal / 100);
  const precoSugerido = divisor > 0 ? custoTotal / divisor : 0;

  return {
    custoTotal: Number(custoTotal.toFixed(2)),
    precoSugerido: Number(precoSugerido.toFixed(2)),
    divisor: Number(divisor.toFixed(4)),
    erro: null
  };
}

function atualizarPrecificacao() {
  const getNum = (id) => {
    const el = $(id);
    return el ? Number(el.value) || 0 : 0;
  };

  const resultado = calcularPrecificacao({
    materiais: getNum("prec_materiais"),
    embalagem: getNum("prec_embalagem"),
    maoObra:   getNum("prec_mao_obra"),
    outros:    getNum("prec_outros"),
    taxas:     getNum("prec_taxas"),
    impostos:  getNum("prec_impostos"),
    despesas:  getNum("prec_despesas"),
    margem:    getNum("prec_margem")
  });

  const custoEl = $("prec_custo_total");
  const precoEl = $("prec_preco_sugerido");
  const avisoEl = $("prec_aviso");

  if (custoEl) custoEl.value = resultado.custoTotal.toFixed(2);
  if (precoEl) precoEl.value = resultado.precoSugerido.toFixed(2);

  if (avisoEl) {
    if (resultado.erro) {
      avisoEl.textContent = "⚠ " + resultado.erro;
      avisoEl.style.color = "#c0392b";
    } else {
      avisoEl.textContent = "Divisor aplicado: " + resultado.divisor + "  •  PV = C / (1 − (D + L) / 100)";
      avisoEl.style.color = "#666";
    }
  }

  const btn = $("prec_aplicar");
  if (btn) btn.disabled = !!resultado.erro || resultado.precoSugerido <= 0;
}

function aplicarPrecoSugerido() {
  const sugerido = $("prec_preco_sugerido");
  const preco    = $("v_preco");
  if (!sugerido || !preco) return;

  const valor = Number(sugerido.value) || 0;
  if (valor <= 0) {
    alert("Calcule a precificação antes de aplicar.");
    return;
  }
  preco.value = valor.toFixed(2);
}

/*
 * ==========================================================
 * CARREGAMENTO DE DADOS E FILTROS
 * ==========================================================
 */

async function loadProducts() {
  const result = await db
    .from("gestao_loja_produtos")
    .select(`
      id, id_loja, nome, sku, descricao, imagem_principal, preco_custo, preco_venda, estoque_minimo, ativo, exibir_catalogo, exibir_preco_catalogo, observacoes, ncm, cfop, cest, unidade, origem_mercadoria, precificacao_materiais, precificacao_embalagem, precificacao_mao_obra, precificacao_outros, precificacao_taxas_percentual, precificacao_impostos_percentual, precificacao_despesas_percentual, precificacao_margem_percentual, precificacao_custo_total, precificacao_preco_sugerido
    `)
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (result.error) throw result.error;
  products = result.data || [];
}

async function loadVariations() {
  const result = await db
    .from("gestao_loja_produtos_variacoes")
    .select(`
      id, id_loja, produto_id, nome, sku, descricao, imagem, galeria_imagens, preco_custo, preco_venda, estoque, estoque_minimo, ativo, exibir_catalogo, observacoes, ncm, cfop, cest, unidade, origem_mercadoria, created_at, atualizado_em, precificacao_materiais, precificacao_embalagem, precificacao_mao_obra, precificacao_outros, precificacao_taxas_percentual, precificacao_impostos_percentual, precificacao_despesas_percentual, precificacao_margem_percentual, precificacao_custo_total, precificacao_preco_sugerido
    `)
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (result.error) throw result.error;
  variations = result.data || [];
}

function applyFilters() {
  filterSearch = $("filterSearch") ? $("filterSearch").value.toLowerCase().trim() : "";
  filterStatus = $("filterStatus") ? $("filterStatus").value : "";
  renderVariationsTable();
}

async function renderVariations() {
  try {
    await Promise.all([loadProducts(), loadVariations()]);
  } catch (e) {
    console.error(e);
    $("variationsTable").innerHTML = '<div class="message error">' + escapeHtml(e.message) + '</div>';
    return;
  }
  renderVariationsTable();
}

// FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO E ORDENAÇÃO
function renderVariationsTable() {
  const container = $("variationsTable");

  if (!variations.length) {
    container.innerHTML = '<div class="empty">Nenhuma variação cadastrada.</div>';
    return;
  }

  // 1. Prepara os dados com o nome do produto para ordenar
  let items = variations.map(v => {
    const p = products.find(prod => String(prod.id) === String(v.produto_id)) || {};
    return {
      ...v,
      produto_nome: p.nome || "Produto Excluído",
      produto_sku: p.sku || ""
    };
  });

  // 2. ORDENAÇÃO ALFABÉTICA: Primeiro pelo nome do produto, depois pelo nome da variação
  items.sort((a, b) => {
    const compProduto = a.produto_nome.localeCompare(b.produto_nome, 'pt-BR');
    if (compProduto !== 0) return compProduto;
    return (a.nome || "").localeCompare(b.nome || "", 'pt-BR');
  });

  // 3. APLICA FILTROS
  if (filterSearch) {
    items = items.filter(item => {
      const searchStr = `${item.produto_nome} ${item.nome} ${item.sku} ${item.produto_sku}`.toLowerCase();
      return searchStr.includes(filterSearch);
    });
  }

  if (filterStatus) {
    items = items.filter(item => {
      const stock = Number(item.estoque || 0);
      const min = Number(item.estoque_minimo || 0);
      
      if (filterStatus === "ativo") return item.ativo === true;
      if (filterStatus === "inativo") return item.ativo === false;
      if (filterStatus === "baixo") return stock <= min;
      return true;
    });
  }

  // 4. RENDERIZA A TABELA
  if (!items.length) {
    container.innerHTML = '<div class="empty">Nenhum item encontrado com esses filtros.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Imagem</th>
            <th>Produto</th>
            <th>Variação</th>
            <th>SKU</th>
            <th>Preço</th>
            <th>Estoque</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items.map(v => {
            const stock = Number(v.estoque || 0);
            const minimum = Number(v.estoque_minimo || 0);
            const stockLow = stock <= minimum;

            const imageHtml = v.imagem 
              ? `<img src="${escapeHtml(v.imagem)}" alt="${escapeHtml(v.nome || "")}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;border:1px solid #ddd;">`
              : `<span class="muted">Sem imagem</span>`;

            return `
              <tr>
                <td>${imageHtml}</td>
                <td>
                  <strong>${escapeHtml(v.produto_nome)}</strong>
                  ${v.produto_sku ? `<br><span class="muted">${escapeHtml(v.produto_sku)}</span>` : ""}
                </td>
                <td><strong>${escapeHtml(v.nome || "")}</strong></td>
                <td><strong>${escapeHtml(v.sku || "Gerando...")}</strong></td>
                <td>${money(v.preco_venda)}</td>
                <td>
                  <span class="badge ${stockLow ? "badge-red" : "badge-green"}">
                    ${stock} ${stockLow ? " - Baixo" : " - Normal"}
                  </span>
                </td>
                <td>
                  <span class="badge ${v.ativo ? "badge-green" : "badge-red"}">
                    ${v.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>
                  <button class="btn btn-secondary" onclick="editVariation('${v.id}')">Editar</button>
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
 * ==========================================================
 * FORMULÁRIO
 * ==========================================================
 */
function variationForm(v = {}) {
  const productOptions = products.map(function(p) {
    return `
      <option value="${p.id}" ${String(v.produto_id || "") === String(p.id) ? "selected" : ""}>
        ${escapeHtml(p.nome)} ${p.sku ? " - " + escapeHtml(p.sku) : ""}
      </option>
    `;
  }).join("");

  const prec = {
    materiais: v.precificacao_materiais ?? 0,
    embalagem: v.precificacao_embalagem ?? 0,
    maoObra:   v.precificacao_mao_obra   ?? 0,
    outros:    v.precificacao_outros     ?? 0,
    taxas:     v.precificacao_taxas_percentual    ?? 0,
    impostos:  v.precificacao_impostos_percentual ?? 0,
    despesas:  v.precificacao_despesas_percentual ?? 0,
    margem:    v.precificacao_margem_percentual   ?? 30,
    custoTotal: v.precificacao_custo_total    ?? 0,
    precoSugerido: v.precificacao_preco_sugerido ?? 0
  };

  const imagePreview = v.imagem
      ? `<div id="imagePreviewContainer" style="margin-top:15px;text-align:center;">
          <img id="imagePreview" src="${escapeHtml(v.imagem)}" alt="Imagem da variação" style="width:180px;height:180px;object-fit:cover;border-radius:10px;border:1px solid #ddd;">
          <br>
          <button type="button" class="btn btn-secondary" style="margin-top:10px;" onclick="removeImage()">Remover imagem</button>
        </div>`
      : `<div id="imagePreviewContainer" style="display:none;margin-top:15px;text-align:center;">
          <img id="imagePreview" src="" alt="Pré-visualização" style="width:180px;height:180px;object-fit:cover;border-radius:10px;border:1px solid #ddd;">
          <br>
          <button type="button" class="btn btn-secondary" style="margin-top:10px;" onclick="removeImage()">Remover imagem</button>
        </div>`;

  return `
    <form onsubmit="saveVariation(event, ${v.id ? `'${v.id}'` : "null"})">
      <div>
        <label>Produto *</label>
        <select id="v_produto" required onchange="onProductChange(this.value)">
          <option value="">Selecione o produto</option>
          ${productOptions}
        </select>
        <small class="muted" id="productHint" style="display:none;margin-top:6px;"></small>
      </div>

      <div style="margin-top:15px;">
        <label>Imagem Principal da variação</label>
        <div style="border:2px dashed #d1d5db;border-radius:10px;padding:20px;text-align:center;margin-top:5px;">
          <label for="v_imagem" class="btn btn-primary" style="display:inline-block;cursor:pointer;">Selecionar imagem</label>
          <input type="file" id="v_imagem" accept="image/*" style="display:none;" onchange="previewImage(event)">
          <div id="imageFileName" class="muted" style="margin-top:10px;">${v.imagem ? "Imagem atual" : "Nenhuma imagem selecionada"}</div>
          ${imagePreview}
          <div id="uploadStatus" class="muted" style="display:none;margin-top:10px;">Enviando imagem...</div>
        </div>
      </div>

      <div style="margin-top:20px;">
        <label style="font-weight:bold;">Galeria de Fotos Extras</label>
        <div class="muted" style="font-size:12px; margin-bottom:10px;">Você pode selecionar várias fotos para esta variação.</div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom:10px;" id="galeriaPreview"></div>
        <label for="v_galeria" class="btn btn-secondary" style="display:inline-block; cursor:pointer;">
          + Adicionar Fotos Extras
        </label>
        <input type="file" id="v_galeria" accept="image/*" multiple style="display:none;" onchange="previewGaleria(event)">
      </div>

      <div class="grid2" style="margin-top:20px;">
        <div>
          <label>SKU</label>
          <input id="v_sku" value="${v.sku ? escapeHtml(v.sku) : "Gerado automaticamente"}" readonly>
          <small class="muted">O SKU é gerado automaticamente pelo sistema.</small>
        </div>
        <div>
          <label>Nome da variação *</label>
          <input id="v_nome" required value="${escapeHtml(v.nome || "")}" placeholder="Ex.: Azul - M">
        </div>
      </div>

      <div>
        <label>Descrição</label>
        <textarea id="v_descricao" rows="3" placeholder="Descrição da variação">${escapeHtml(v.descricao || "")}</textarea>
      </div>

      <div class="grid2">
        <div>
          <label>Preço de venda</label>
          <input id="v_preco" type="number" step="0.01" min="0" value="${v.preco_venda ?? 0}">
        </div>
        <div>
          <label>Preço de custo</label>
          <input id="v_custo" type="number" step="0.01" min="0" value="${v.preco_custo ?? 0}">
          <small class="muted">Se ficar em 0, será herdado do produto ao salvar.</small>
        </div>
      </div>

      <div style="margin-top:20px; padding-top:15px; border-top:1px solid #ddd;">
        <strong>Precificação da variação</strong>
        <div class="muted" style="font-size:12px; margin-top:4px; margin-bottom:12px;">Fórmula aplicada: <code>PV = C / (1 − (D + L) / 100)</code></div>

        <div class="grid2">
          <div><label>Materiais (R$)</label><input id="prec_materiais" type="number" step="0.01" min="0" value="${prec.materiais}" oninput="atualizarPrecificacao()"></div>
          <div><label>Embalagem (R$)</label><input id="prec_embalagem" type="number" step="0.01" min="0" value="${prec.embalagem}" oninput="atualizarPrecificacao()"></div>
        </div>

        <div class="grid2">
          <div><label>Mão de obra (R$)</label><input id="prec_mao_obra" type="number" step="0.01" min="0" value="${prec.maoObra}" oninput="atualizarPrecificacao()"></div>
          <div><label>Outros custos (R$)</label><input id="prec_outros" type="number" step="0.01" min="0" value="${prec.outros}" oninput="atualizarPrecificacao()"></div>
        </div>

        <div class="grid2">
          <div><label>Taxas (%)</label><input id="prec_taxas" type="number" step="0.001" min="0" max="100" value="${prec.taxas}" oninput="atualizarPrecificacao()"></div>
          <div><label>Impostos (%)</label><input id="prec_impostos" type="number" step="0.001" min="0" max="100" value="${prec.impostos}" oninput="atualizarPrecificacao()"></div>
        </div>

        <div class="grid2">
          <div><label>Despesas fixas rateadas (%)</label><input id="prec_despesas" type="number" step="0.001" min="0" max="100" value="${prec.despesas}" oninput="atualizarPrecificacao()"></div>
          <div><label>Margem de lucro desejada (%)</label><input id="prec_margem" type="number" step="0.001" min="0" max="100" value="${prec.margem}" oninput="atualizarPrecificacao()"></div>
        </div>

        <div id="prec_aviso" class="muted" style="font-size:12px; margin:8px 0 12px;"></div>

        <div class="grid2">
          <div><label>Custo total (R$)</label><input id="prec_custo_total" type="number" step="0.01" readonly value="${Number(prec.custoTotal).toFixed(2)}"></div>
          <div><label>Preço de venda sugerido (R$)</label><input id="prec_preco_sugerido" type="number" step="0.01" readonly value="${Number(prec.precoSugerido).toFixed(2)}"></div>
        </div>

        <button id="prec_aplicar" type="button" class="btn btn-secondary" onclick="aplicarPrecoSugerido()" style="margin-top:8px;">Aplicar preço sugerido</button>
      </div>

      <div style="margin-top:20px; padding-top:15px; border-top:1px solid #ddd;">
        <strong>Dados fiscais (NF-e)</strong>
        <div class="grid2" style="margin-top:10px;">
          <div><label>NCM</label><input id="v_ncm" maxlength="8" placeholder="00000000" value="${escapeHtml(v.ncm || "")}" oninput="this.value = this.value.replace(/\\D/g, '').slice(0,8)"></div>
          <div><label>CFOP</label><input id="v_cfop" maxlength="4" placeholder="5102" value="${escapeHtml(v.cfop || "5102")}" oninput="this.value = this.value.replace(/\\D/g, '').slice(0,4)"></div>
        </div>
        <div class="grid2">
          <div><label>CEST</label><input id="v_cest" maxlength="7" placeholder="0000000" value="${escapeHtml(v.cest || "")}" oninput="this.value = this.value.replace(/\\D/g, '').slice(0,7)"></div>
          <div>
            <label>Unidade fiscal</label>
            <select id="v_unidade_fiscal">
              <option value="UN" ${(v.unidade || "UN") === "UN" ? "selected" : ""}>UN - Unidade</option>
              <option value="PC" ${v.unidade === "PC" ? "selected" : ""}>PC - Peça</option>
              <option value="CX" ${v.unidade === "CX" ? "selected" : ""}>CX - Caixa</option>
              <option value="KG" ${v.unidade === "KG" ? "selected" : ""}>KG - Quilograma</option>
              <option value="G" ${v.unidade === "G" ? "selected" : ""}>G - Grama</option>
              <option value="L" ${v.unidade === "L" ? "selected" : ""}>L - Litro</option>
              <option value="ML" ${v.unidade === "ML" ? "selected" : ""}>ML - Mililitro</option>
              <option value="M" ${v.unidade === "M" ? "selected" : ""}>M - Metro</option>
              <option value="M2" ${v.unidade === "M2" ? "selected" : ""}>M2 - Metro quadrado</option>
              <option value="M3" ${v.unidade === "M3" ? "selected" : ""}>M3 - Metro cúbico</option>
              <option value="PAR" ${v.unidade === "PAR" ? "selected" : ""}>PAR - Par</option>
              <option value="DZ" ${v.unidade === "DZ" ? "selected" : ""}>DZ - Dúzia</option>
            </select>
          </div>
        </div>
        <div>
          <label>Origem da mercadoria</label>
          <select id="v_origem_mercadoria">
            <option value="0" ${(v.origem_mercadoria || "0") === "0" ? "selected" : ""}>0 - Nacional</option>
            <option value="1" ${v.origem_mercadoria === "1" ? "selected" : ""}>1 - Estrangeira (importação direta)</option>
            <option value="2" ${v.origem_mercadoria === "2" ? "selected" : ""}>2 - Estrangeira (mercado interno)</option>
            <option value="3" ${v.origem_mercadoria === "3" ? "selected" : ""}>3 - Nacional c/ importação 40%–70%</option>
            <option value="4" ${v.origem_mercadoria === "4" ? "selected" : ""}>4 - Nacional (processos produtivos básicos)</option>
            <option value="5" ${v.origem_mercadoria === "5" ? "selected" : ""}>5 - Nacional c/ importação ≤ 40%</option>
            <option value="6" ${v.origem_mercadoria === "6" ? "selected" : ""}>6 - Estrangeira (sem similar nacional)</option>
            <option value="7" ${v.origem_mercadoria === "7" ? "selected" : ""}>7 - Estrangeira (mercado interno, sem similar)</option>
            <option value="8" ${v.origem_mercadoria === "8" ? "selected" : ""}>8 - Nacional c/ importação > 70%</option>
          </select>
        </div>
      </div>

      <div class="grid2" style="margin-top:15px;">
        <div>
          <label>Estoque inicial</label>
          <input id="v_estoque" type="number" step="0.001" min="0" value="${v.estoque ?? 0}" ${v.id ? "disabled" : ""}>
        </div>
        <div>
          <label>Estoque mínimo</label>
          <input id="v_minimo" type="number" step="0.001" min="0" value="${v.estoque_minimo ?? 0}">
        </div>
      </div>

      <label style="margin-top:10px; display:block;"><input id="v_ativo" type="checkbox" style="width:auto" ${v.ativo !== false ? "checked" : ""}> Variação ativa</label>
      <label style="display:block;"><input id="v_catalogo" type="checkbox" style="width:auto" ${v.exibir_catalogo !== false ? "checked" : ""}> Exibir no catálogo</label>

      <div>
        <label>Observações</label>
        <textarea id="v_observacoes" rows="3" placeholder="Observações internas">${escapeHtml(v.observacoes || "")}</textarea>
      </div>

      <button class="btn btn-primary full" type="submit" id="saveVariationButton" style="margin-top:20px;">Salvar variação</button>
    </form>
  `;
}

function onProductChange(productId) {
  const hint = $("productHint");
  if (!productId) {
    if (hint) hint.style.display = "none";
    return;
  }

  const product = products.find(p => String(p.id) === String(productId));
  if (!product) {
    if (hint) hint.style.display = "none";
    return;
  }

  const jaTemVariacoes = variations.some(v => String(v.produto_id) === String(productId) && String(v.id) !== String(editingVariationId || ""));

  const nomeInput = $("v_nome");
  if (nomeInput && !nomeInput.value.trim()) nomeInput.value = product.nome || "";
  
  const descInput = $("v_descricao");
  if (descInput && !descInput.value.trim()) descInput.value = product.descricao || "";

  const catInput = $("v_catalogo");
  if (catInput) catInput.checked = product.exibir_catalogo !== false;

  const ativoInput = $("v_ativo");
  if (ativoInput) ativoInput.checked = product.ativo !== false;

  const preencherSeVazio = function(id, valor) {
    const el = $(id);
    if (!el || valor === null || valor === undefined) return;
    if (!el.value || Number(el.value) === 0) el.value = Number(valor) || 0;
  };

  preencherSeVazio("v_custo",           product.preco_custo);
  preencherSeVazio("v_minimo",          product.estoque_minimo);
  preencherSeVazio("prec_materiais",    product.precificacao_materiais);
  preencherSeVazio("prec_embalagem",    product.precificacao_embalagem);
  preencherSeVazio("prec_mao_obra",     product.precificacao_mao_obra);
  preencherSeVazio("prec_outros",       product.precificacao_outros);
  preencherSeVazio("prec_taxas",        product.precificacao_taxas_percentual);
  preencherSeVazio("prec_impostos",     product.precificacao_impostos_percentual);
  preencherSeVazio("prec_despesas",     product.precificacao_despesas_percentual);

  const margemEl = $("prec_margem");
  if (margemEl) {
    const margemAtual = Number(margemEl.value);
    const margemProduto = Number(product.precificacao_margem_percentual) || 30;
    if (!margemEl.value || margemAtual === 30) {
      if (margemProduto !== 30) margemEl.value = margemProduto;
    }
  }

  const preencherTexto = function(id, valor) {
    const el = $(id);
    if (!el || valor === null || valor === undefined) return;
    if (!el.value || !String(el.value).trim()) el.value = valor;
  };

  preencherTexto("v_ncm",  product.ncm);
  preencherTexto("v_cfop", product.cfop);
  preencherTexto("v_cest", product.cest);

  const unidEl = $("v_unidade_fiscal");
  if (unidEl && (!unidEl.value || unidEl.value === "UN")) {
    if (product.unidade) unidEl.value = product.unidade;
  }

  const origEl = $("v_origem_mercadoria");
  if (origEl && (!origEl.value || origEl.value === "0")) {
    if (product.origem_mercadoria) origEl.value = product.origem_mercadoria;
  }

  const estaCriandoNova = !editingVariationId;
  if (estaCriandoNova && product.imagem_principal) {
    const semArquivoNovo = !$("v_imagem")?.files?.[0];
    if (semArquivoNovo) {
      const preview = $("imagePreview");
      const container = $("imagePreviewContainer");
      const fileNameEl = $("imageFileName");
      if (preview) preview.src = product.imagem_principal;
      if (container) container.style.display = "block";
      if (fileNameEl) fileNameEl.textContent = "Imagem herdada do produto";
      currentImageUrl = product.imagem_principal;
    }
  }

  atualizarPrecificacao();

  if (hint) {
    if (jaTemVariacoes) {
      hint.textContent = "⚠ Este produto já possui variações cadastradas. Confira se não está duplicando.";
      hint.style.color = "#b45309";
    } else {
      hint.textContent = "✓ Campos vazios serão herdados automaticamente do produto.";
      hint.style.color = "#0a7d28";
    }
    hint.style.display = "block";
  }
}

function newVariation() {
  if (!products.length) {
    alert("Cadastre pelo menos um produto antes de criar uma variação.");
    return;
  }

  editingVariationId = null;
  currentImageUrl = null;
  galeriaUrlsAtuais = [];
  galeriaNovosFiles = [];

  openModal("Nova variação", variationForm({
    ativo: true,
    exibir_catalogo: true,
    precificacao_margem_percentual: 30
  }));

  atualizarPrecificacao();
  renderGaleriaPreview();
}

function editVariation(id) {
  const variation = variations.find(v => String(v.id) === String(id));
  if (!variation) {
    alert("Variação não encontrada.");
    return;
  }

  editingVariationId = id;
  currentImageUrl = variation.imagem || null;
  galeriaUrlsAtuais = variation.galeria_imagens || [];
  galeriaNovosFiles = [];

  openModal("Editar variação", variationForm(variation));
  atualizarPrecificacao();
  renderGaleriaPreview();
}

function previewImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Selecione um arquivo de imagem.");
    event.target.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("A imagem deve ter no máximo 5 MB.");
    event.target.value = "";
    return;
  }

  $("imageFileName").textContent = file.name;
  const reader = new FileReader();
  reader.onload = function(e) {
    $("imagePreview").src = e.target.result;
    $("imagePreviewContainer").style.display = "block";
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  const input = $("v_imagem");
  if (input) input.value = "";
  if ($("imageFileName")) $("imageFileName").textContent = "Nenhuma imagem selecionada";
  if ($("imagePreview")) $("imagePreview").src = "";
  if ($("imagePreviewContainer")) $("imagePreviewContainer").style.display = "none";
  currentImageUrl = null;
}

function previewGaleria(event) {
  const files = Array.from(event.target.files);
  files.forEach(file => {
    if (file.type.startsWith('image/')) {
      galeriaNovosFiles.push(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const container = document.getElementById('galeriaPreview');
        if (container) {
          container.innerHTML += `
            <div style="position: relative;">
              <img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #ddd;">
            </div>
          `;
        }
      };
      reader.readAsDataURL(file);
    }
  });
  event.target.value = '';
}

function removerFotoGaleria(url) {
  galeriaUrlsAtuais = galeriaUrlsAtuais.filter(u => u !== url);
  renderGaleriaPreview();
}

function renderGaleriaPreview() {
  const container = document.getElementById('galeriaPreview');
  if (!container) return;
  
  container.innerHTML = galeriaUrlsAtuais.map(url => `
    <div style="position: relative;">
      <img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #ddd;">
      <button type="button" onclick="removerFotoGaleria('${url}')" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; cursor:pointer; width:20px; height:20px; font-size:10px;">×</button>
    </div>
  `).join('');
}

async function uploadImage(file) {
  if (!file) return currentImageUrl;

  $("uploadStatus").style.display = "block";
  $("uploadStatus").textContent = "Enviando imagem...";

  const extension = file.name.split(".").pop().toLowerCase();
  const uniqueName = Date.now() + "_" + Math.random().toString(36).substring(2, 10) + "." + extension;
  const filePath = currentStore.id_loja + "/variacoes/" + uniqueName;

  const upload = await db.storage.from("produtos").upload(filePath, file, { cacheControl: "3600", upsert: false });

  if (upload.error) {
    $("uploadStatus").style.display = "none";
    throw upload.error;
  }

  const publicUrl = db.storage.from("produtos").getPublicUrl(filePath);
  $("uploadStatus").textContent = "Imagem enviada.";

  return publicUrl.data.publicUrl;
}

async function saveVariation(ev, id) {
  ev.preventDefault();

  if (!currentStore) {
    alert("Não foi possível identificar a loja.");
    return;
  }

  const produtoId = Number($("v_produto").value);
  const produto = products.find(p => Number(p.id) === produtoId);

  if (!produto) {
    alert("Selecione um produto válido.");
    return;
  }

  const nome = $("v_nome").value.trim();
  if (!nome) {
    alert("Informe o nome da variação.");
    return;
  }

  const precoVenda = Number($("v_preco").value || 0);
  const precoCusto = Number($("v_custo").value || 0);
  const estoqueMinimo = Number($("v_minimo").value || 0);

  if (precoVenda < 0 || precoCusto < 0 || estoqueMinimo < 0) {
    alert("Os valores não podem ser negativos.");
    return;
  }

  const ncmValue = $("v_ncm").value.replace(/\D/g, "");
  if (ncmValue && ncmValue.length !== 8) {
    alert("O NCM deve ter exatamente 8 dígitos.\n\nValor informado: " + ncmValue);
    return;
  }

  atualizarPrecificacao();

  const precResultado = calcularPrecificacao({
    materiais: Number($("prec_materiais").value) || 0,
    embalagem: Number($("prec_embalagem").value) || 0,
    maoObra:   Number($("prec_mao_obra").value)   || 0,
    outros:    Number($("prec_outros").value)     || 0,
    taxas:     Number($("prec_taxas").value)      || 0,
    impostos:  Number($("prec_impostos").value)   || 0,
    despesas:  Number($("prec_despesas").value)   || 0,
    margem:    Number($("prec_margem").value)     || 0
  });

  if (precResultado.erro) {
    alert("Não foi possível calcular a precificação:\n\n" + precResultado.erro);
    return;
  }

  const saveButton = $("saveVariationButton");
  saveButton.disabled = true;
  saveButton.textContent = "Salvando...";

  try {
    const selectedFile = $("v_imagem").files[0];
    let imageUrl = currentImageUrl;
    if (selectedFile) imageUrl = await uploadImage(selectedFile);

    const novasUrlsGaleria = [];
    for (const file of galeriaNovosFiles) {
      const url = await uploadImage(file);
      novasUrlsGaleria.push(url);
    }
    const galeriaFinal = [...galeriaUrlsAtuais, ...novasUrlsGaleria];

    const payload = {
      id_loja: currentStore.id_loja,
      produto_id: produtoId,
      nome: nome,
      descricao: $("v_descricao").value.trim() || null,
      imagem: imageUrl || null,
      galeria_imagens: galeriaFinal,
      preco_venda: precoVenda,
      preco_custo: precoCusto,
      estoque_minimo: estoqueMinimo,
      ativo: $("v_ativo").checked,
      exibir_catalogo: $("v_catalogo").checked,
      observacoes: $("v_observacoes").value.trim() || null,

      precificacao_materiais:           Number($("prec_materiais").value) || 0,
      precificacao_embalagem:           Number($("prec_embalagem").value) || 0,
      precificacao_mao_obra:            Number($("prec_mao_obra").value)   || 0,
      precificacao_outros:              Number($("prec_outros").value)     || 0,
      precificacao_taxas_percentual:    Number($("prec_taxas").value)      || 0,
      precificacao_impostos_percentual: Number($("prec_impostos").value)   || 0,
      precificacao_despesas_percentual: Number($("prec_despesas").value)   || 0,
      precificacao_margem_percentual:   Number($("prec_margem").value)     || 0,
      precificacao_custo_total:         precResultado.custoTotal,
      precificacao_preco_sugerido:      precResultado.precoSugerido,

      ncm:               ncmValue || null,
      cfop:              $("v_cfop").value.replace(/\D/g, "") || "5102",
      cest:              $("v_cest").value.replace(/\D/g, "") || null,
      unidade:           $("v_unidade_fiscal").value || "UN",
      origem_mercadoria: $("v_origem_mercadoria").value || "0"
    };

    let result;

    if (id) {
      result = await db.from("gestao_loja_produtos_variacoes").update(payload).eq("id", id).eq("id_loja", currentStore.id_loja);
    } else {
      const sequencia = await proximaSequenciaSkuVariacao();
      const skuVariacao = generateSkuVariacao(produto.sku, sequencia);
      payload.sku = skuVariacao;
      payload.estoque = Number($("v_estoque").value || 0);
      result = await db.from("gestao_loja_produtos_variacoes").insert(payload);
    }

    if (result.error) throw result.error;

    closeModal();
    currentImageUrl = null;
    galeriaUrlsAtuais = [];
    galeriaNovosFiles = [];
    
    await renderVariations();

  } catch (error) {
    console.error("Erro ao salvar variação:", error);
    alert("Erro ao salvar variação:\n" + error.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Salvar variação";
    if ($("uploadStatus")) $("uploadStatus").style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", async function() {
  const authenticated = await requireAuth();
  if (!authenticated) return;

  const contextLoaded = await loadUserContext();
  if (!contextLoaded) return;

  setActiveNav();

  $("pageSubtitle").textContent = "Cadastre e gerencie as variações dos seus produtos";

  try {
    await renderVariations();
  } catch (e) {
    console.error(e);
    $("variationsTable").innerHTML = '<div class="message error">' + escapeHtml(e.message) + '</div>';
  }
});
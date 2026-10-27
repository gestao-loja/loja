let variations = [];

let products = [];

let editingVariationId = null;

let currentImageUrl = null;

/*
 * ==========================================================
 * SKU — geração sequencial POR LOJA
 * ==========================================================
 */

/*
 * Retorna a próxima sequência de SKU de VARIAÇÃO para a loja atual.
 * Conta quantas variações a loja já tem e soma 1.
 *
 * Como não há exclusão de variações, a sequência nunca
 * volta e nunca colide.
 */
/*
 * Retorna a próxima sequência de SKU de VARIAÇÃO para a loja atual.
 * Busca o MAIOR número de sequência já gerado para a loja e soma 1.
 * Isso evita colisões mesmo se variações forem excluídas no futuro.
 */
async function proximaSequenciaSkuVariacao() {
  const result = await db
    .from("gestao_loja_produtos_variacoes")
    .select("sku")
    .eq("id_loja", currentStore.id_loja)
    .not("sku", "is", null);

  if (result.error) {
    throw result.error;
  }

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

/*
 * Gera o SKU de uma variação no formato:
 *   SKU_DO_PRODUTO-NNNNN
 * Ex.: CAM-00001-00001
 *
 * O número é a sequência da VARIAÇÃO dentro da loja,
 * começando em 1 para cada loja.
 */
function generateSkuVariacao(produtoSku, sequencia) {

  const base =
    String(produtoSku || "VAR")
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");

  const numero =
    String(sequencia).padStart(5, "0");

  return `${base}-${numero}`;

}

/*
 * ==========================================================
 * PRECIFICAÇÃO — Fórmula
 *   PV = C / (1 - (D + L) / 100)
 *
 * Observação:
 *   Este cálculo é apenas FEEDBACK VISUAL no formulário.
 *   A herança de custos/precificação/fiscais do produto
 *   é feita pelos triggers SQL (BEFORE INSERT / UPDATE)
 *   quando o campo chega vazio/zerado no banco.
 * ==========================================================
 */

/**
 * Calcula custo total e preço de venda sugerido.
 *
 * @param {Object} dados
 * @returns {{ custoTotal: number, precoSugerido: number, divisor: number, erro: string|null }}
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

  const custoTotal =
    materiais + embalagem + maoObra + outros;

  const percentualTotal =
    taxas + impostos + despesas + margem;

  if (percentualTotal >= 100) {
    return {
      custoTotal: Number(custoTotal.toFixed(2)),
      precoSugerido: 0,
      divisor: 0,
      erro:
        "A soma de taxas, impostos, despesas e margem " +
        "deve ser menor que 100%. Atualmente: " +
        percentualTotal.toFixed(2) + "%."
    };
  }

  const divisor = 1 - (percentualTotal / 100);

  const precoSugerido =
    divisor > 0
      ? custoTotal / divisor
      : 0;

  return {
    custoTotal: Number(custoTotal.toFixed(2)),
    precoSugerido: Number(precoSugerido.toFixed(2)),
    divisor: Number(divisor.toFixed(4)),
    erro: null
  };

}

/**
 * Lê os campos de precificação e atualiza
 * custo total e preço sugerido em tempo real.
 */
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

  if (custoEl) {
    custoEl.value = resultado.custoTotal.toFixed(2);
  }

  if (precoEl) {
    precoEl.value = resultado.precoSugerido.toFixed(2);
  }

  if (avisoEl) {

    if (resultado.erro) {
      avisoEl.textContent = "⚠ " + resultado.erro;
      avisoEl.style.color = "#c0392b";
    } else {
      avisoEl.textContent =
        "Divisor aplicado: " +
        resultado.divisor +
        "  •  PV = C / (1 − (D + L) / 100)";
      avisoEl.style.color = "#666";
    }

  }

  const btn = $("prec_aplicar");
  if (btn) {
    btn.disabled = !!resultado.erro ||
      resultado.precoSugerido <= 0;
  }

}

/**
 * Copia o preço sugerido para o campo "Preço de venda".
 */
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
 * CARREGAMENTO DE DADOS
 * ==========================================================
 */

async function loadProducts() {

  const result = await db
    .from("gestao_loja_produtos")
    .select(`
      id,
      id_loja,
      nome,
      sku,
      descricao,
      imagem_principal,
      preco_custo,
      preco_venda,
      estoque_minimo,
      ativo,
      exibir_catalogo,
      exibir_preco_catalogo,
      observacoes,
      ncm,
      cfop,
      cest,
      unidade,
      origem_mercadoria,
      precificacao_materiais,
      precificacao_embalagem,
      precificacao_mao_obra,
      precificacao_outros,
      precificacao_taxas_percentual,
      precificacao_impostos_percentual,
      precificacao_despesas_percentual,
      precificacao_margem_percentual,
      precificacao_custo_total,
      precificacao_preco_sugerido
    `)
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (result.error) {
    throw result.error;
  }

  products = result.data || [];

}

async function loadVariations() {

  const result = await db
    .from("gestao_loja_produtos_variacoes")
    .select(`
      id,
      id_loja,
      produto_id,
      nome,
      sku,
      descricao,
      imagem,
      preco_custo,
      preco_venda,
      estoque,
      estoque_minimo,
      ativo,
      exibir_catalogo,
      observacoes,
      ncm,
      cfop,
      cest,
      unidade,
      origem_mercadoria,
      created_at,
      atualizado_em,
      precificacao_materiais,
      precificacao_embalagem,
      precificacao_mao_obra,
      precificacao_outros,
      precificacao_taxas_percentual,
      precificacao_impostos_percentual,
      precificacao_despesas_percentual,
      precificacao_margem_percentual,
      precificacao_custo_total,
      precificacao_preco_sugerido
    `)
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (result.error) {
    throw result.error;
  }

  variations = result.data || [];

}

async function renderVariations() {

  try {

    await Promise.all([
      loadProducts(),
      loadVariations()
    ]);

  } catch (e) {

    console.error(e);

    $("variationsTable").innerHTML =
      '<div class="message error">' +
      escapeHtml(e.message) +
      '</div>';

    return;

  }

  if (!variations.length) {

    $("variationsTable").innerHTML =
      '<div class="empty">' +
      'Nenhuma variação cadastrada.' +
      '</div>';

    return;

  }

  $("variationsTable").innerHTML = `

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

          ${variations.map(function(v) {

            const product =
              products.find(function(p) {

                return String(p.id) ===
                  String(v.produto_id);

              });

            const productName =
              product
                ? product.nome
                : "Produto não encontrado";

            const productSku =
              product && product.sku
                ? product.sku
                : "";

            const stock =
              Number(v.estoque || 0);

            const minimum =
              Number(v.estoque_minimo || 0);

            const stockLow =
              stock <= minimum;

            const imageHtml =
              v.imagem

                ? `
                  <img
                    src="${escapeHtml(v.imagem)}"
                    alt="${escapeHtml(v.nome || "")}"
                    style="
                      width:50px;
                      height:50px;
                      object-fit:cover;
                      border-radius:8px;
                      border:1px solid #ddd;
                    ">
                `

                : `
                  <span class="muted">
                    Sem imagem
                  </span>
                `;

            return `

              <tr>

                <td>

                  ${imageHtml}

                </td>

                <td>

                  <strong>
                    ${escapeHtml(productName)}
                  </strong>

                  ${
                    productSku
                      ? `
                        <br>
                        <span class="muted">
                          ${escapeHtml(productSku)}
                        </span>
                      `
                      : ""
                  }

                </td>

                <td>

                  <strong>
                    ${escapeHtml(v.nome || "")}
                  </strong>

                </td>

                <td>

                  <strong>
                    ${escapeHtml(
                      v.sku || "Gerando..."
                    )}
                  </strong>

                </td>

                <td>

                  ${money(v.preco_venda)}

                </td>

                <td>

                  <span
                    class="badge ${
                      stockLow
                        ? "badge-red"
                        : "badge-green"
                    }">

                    ${stock}

                    ${
                      stockLow
                        ? " - Baixo"
                        : " - Normal"
                    }

                  </span>

                </td>

                <td>

                  <span
                    class="badge ${
                      v.ativo
                        ? "badge-green"
                        : "badge-red"
                    }">

                    ${
                      v.ativo
                        ? "Ativo"
                        : "Inativo"
                    }

                  </span>

                </td>

                <td>

                  <button
                    class="btn btn-secondary"
                    onclick="editVariation('${v.id}')">

                    Editar

                  </button>

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

  const productOptions =
    products.map(function(p) {

      return `

        <option
          value="${p.id}"
          ${
            String(
              v.produto_id || ""
            ) === String(p.id)
              ? "selected"
              : ""
          }>

          ${escapeHtml(p.nome)}
          ${
            p.sku
              ? " - " +
                escapeHtml(p.sku)
              : ""
          }

        </option>

      `;

    }).join("");

  // Valores de precificação (defaults vindos do banco / novos)
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

  const imagePreview =
    v.imagem
      ? `
        <div
          id="imagePreviewContainer"
          style="
            margin-top:15px;
            text-align:center;
          ">

          <img
            id="imagePreview"
            src="${escapeHtml(v.imagem)}"
            alt="Imagem da variação"
            style="
              width:180px;
              height:180px;
              object-fit:cover;
              border-radius:10px;
              border:1px solid #ddd;
            ">

          <br>

          <button
            type="button"
            class="btn btn-secondary"
            style="margin-top:10px;"
            onclick="removeImage()">

            Remover imagem

          </button>

        </div>
      `
      : `
        <div
          id="imagePreviewContainer"
          style="
            display:none;
            margin-top:15px;
            text-align:center;
          ">

          <img
            id="imagePreview"
            src=""
            alt="Pré-visualização"
            style="
              width:180px;
              height:180px;
              object-fit:cover;
              border-radius:10px;
              border:1px solid #ddd;
            ">

          <br>

          <button
            type="button"
            class="btn btn-secondary"
            style="margin-top:10px;"
            onclick="removeImage()">

            Remover imagem

          </button>

        </div>
      `;

  return `

    <form
      onsubmit="
        saveVariation(
          event,
          ${
            v.id
              ? `'${v.id}'`
              : "null"
          }
        )
      ">

      <div>

        <label>
          Produto *
        </label>

        <select
          id="v_produto"
          required
          onchange="onProductChange(this.value)">

          <option value="">
            Selecione o produto
          </option>

          ${productOptions}

        </select>

        <small
          class="muted"
          id="productHint"
          style="display:none;margin-top:6px;">

        </small>

      </div>

      <div>

        <label>
          Imagem da variação
        </label>

        <div
          style="
            border:2px dashed #d1d5db;
            border-radius:10px;
            padding:20px;
            text-align:center;
            margin-top:5px;
          ">

          <label
            for="v_imagem"
            class="btn btn-primary"
            style="
              display:inline-block;
              cursor:pointer;
            ">

            Selecionar imagem

          </label>

          <input
            type="file"
            id="v_imagem"
            accept="image/*"
            style="display:none;"
            onchange="previewImage(event)">

          <div
            id="imageFileName"
            class="muted"
            style="margin-top:10px;">

            ${
              v.imagem
                ? "Imagem atual"
                : "Nenhuma imagem selecionada"
            }

          </div>

          ${imagePreview}

          <div
            id="uploadStatus"
            class="muted"
            style="
              display:none;
              margin-top:10px;
            ">

            Enviando imagem...

          </div>

        </div>

      </div>

      <div class="grid2">

        <div>

          <label>
            SKU
          </label>

          <input
            id="v_sku"
            value="${
              v.sku
                ? escapeHtml(v.sku)
                : "Gerado automaticamente"
            }"
            readonly>

          <small class="muted">

            O SKU é gerado automaticamente
            pelo sistema, com sequência
            própria por loja.

          </small>

        </div>

        <div>

          <label>
            Nome da variação *
          </label>

          <input
            id="v_nome"
            required
            value="${escapeHtml(v.nome || "")}"
            placeholder="Ex.: Azul - M">

        </div>

      </div>

      <div>

        <label>
          Descrição
        </label>

        <textarea
          id="v_descricao"
          rows="3"
          placeholder="Descrição da variação"
        >${escapeHtml(v.descricao || "")}</textarea>

      </div>

      <div class="grid2">

        <div>

          <label>
            Preço de venda
          </label>

          <input
            id="v_preco"
            type="number"
            step="0.01"
            min="0"
            value="${v.preco_venda ?? 0}">

        </div>

        <div>

          <label>
            Preço de custo
          </label>

          <input
            id="v_custo"
            type="number"
            step="0.01"
            min="0"
            value="${v.preco_custo ?? 0}">

          <small class="muted">
            Se ficar em 0, será herdado do produto ao salvar.
          </small>

        </div>

      </div>

      <!-- ===== PRECIFICAÇÃO ===== -->

      <div
        style="
          margin-top:20px;
          padding-top:15px;
          border-top:1px solid #ddd;
        "
      >

        <strong>
          Precificação da variação
        </strong>

        <div
          class="muted"
          style="
            font-size:12px;
            margin-top:4px;
            margin-bottom:12px;
          "
        >
          Fórmula aplicada:
          <code>PV = C / (1 − (D + L) / 100)</code>
          — campos zerados serão herdados do produto ao salvar.
        </div>

        <div class="grid2">

          <div>
            <label>Materiais (R$)</label>
            <input
              id="prec_materiais"
              type="number"
              step="0.01"
              min="0"
              value="${prec.materiais}"
              oninput="atualizarPrecificacao()">
          </div>

          <div>
            <label>Embalagem (R$)</label>
            <input
              id="prec_embalagem"
              type="number"
              step="0.01"
              min="0"
              value="${prec.embalagem}"
              oninput="atualizarPrecificacao()">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>Mão de obra (R$)</label>
            <input
              id="prec_mao_obra"
              type="number"
              step="0.01"
              min="0"
              value="${prec.maoObra}"
              oninput="atualizarPrecificacao()">
          </div>

          <div>
            <label>Outros custos (R$)</label>
            <input
              id="prec_outros"
              type="number"
              step="0.01"
              min="0"
              value="${prec.outros}"
              oninput="atualizarPrecificacao()">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>Taxas (%)</label>
            <input
              id="prec_taxas"
              type="number"
              step="0.001"
              min="0"
              max="100"
              value="${prec.taxas}"
              oninput="atualizarPrecificacao()">
            <small class="muted">
              Ex.: maquininha, gateway, comissão.
            </small>
          </div>

          <div>
            <label>Impostos (%)</label>
            <input
              id="prec_impostos"
              type="number"
              step="0.001"
              min="0"
              max="100"
              value="${prec.impostos}"
              oninput="atualizarPrecificacao()">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>Despesas fixas rateadas (%)</label>
            <input
              id="prec_despesas"
              type="number"
              step="0.001"
              min="0"
              max="100"
              value="${prec.despesas}"
              oninput="atualizarPrecificacao()">
            <small class="muted">
              Aluguel, salários etc. rateados.
            </small>
          </div>

          <div>
            <label>Margem de lucro desejada (%)</label>
            <input
              id="prec_margem"
              type="number"
              step="0.001"
              min="0"
              max="100"
              value="${prec.margem}"
              oninput="atualizarPrecificacao()">
          </div>

        </div>

        <div
          id="prec_aviso"
          class="muted"
          style="
            font-size:12px;
            margin:8px 0 12px;
          "
        ></div>

        <div class="grid2">

          <div>
            <label>Custo total (R$)</label>
            <input
              id="prec_custo_total"
              type="number"
              step="0.01"
              readonly
              value="${Number(prec.custoTotal).toFixed(2)}">
          </div>

          <div>
            <label>Preço de venda sugerido (R$)</label>
            <input
              id="prec_preco_sugerido"
              type="number"
              step="0.01"
              readonly
              value="${Number(prec.precoSugerido).toFixed(2)}">
          </div>

        </div>

        <button
          id="prec_aplicar"
          type="button"
          class="btn btn-secondary"
          onclick="aplicarPrecoSugerido()"
          style="margin-top:8px;">

          Aplicar preço sugerido em "Preço de venda"

        </button>

      </div>

      <!-- ===== FIM PRECIFICAÇÃO ===== -->

      <!-- ===== DADOS FISCAIS (NF-e) ===== -->

      <div
        style="
          margin-top:20px;
          padding-top:15px;
          border-top:1px solid #ddd;
        "
      >

        <strong>
          Dados fiscais (NF-e)
        </strong>

        <div
          class="muted"
          style="
            font-size:12px;
            margin-top:4px;
            margin-bottom:12px;
          "
        >
          Campos vazios serão herdados do produto ao salvar.
          NCM é obrigatório para PJ.
        </div>

        <div class="grid2">

          <div>

            <label>NCM</label>

            <input
              id="v_ncm"
              maxlength="8"
              placeholder="00000000"
              value="${escapeHtml(v.ncm || "")}"
              oninput="this.value = this.value.replace(/\\D/g, '').slice(0,8)">

            <small class="muted">
              8 dígitos, sem pontos
            </small>

          </div>

          <div>

            <label>CFOP</label>

            <input
              id="v_cfop"
              maxlength="4"
              placeholder="5102"
              value="${escapeHtml(v.cfop || "5102")}"
              oninput="this.value = this.value.replace(/\\D/g, '').slice(0,4)">

          </div>

        </div>

        <div class="grid2">

          <div>

            <label>CEST</label>

            <input
              id="v_cest"
              maxlength="7"
              placeholder="0000000"
              value="${escapeHtml(v.cest || "")}"
              oninput="this.value = this.value.replace(/\\D/g, '').slice(0,7)">

            <small class="muted">
              Opcional (substituição tributária)
            </small>

          </div>

          <div>

            <label>Unidade fiscal</label>

            <select id="v_unidade_fiscal">

              <option value="UN" ${
                (v.unidade || "UN") === "UN" ? "selected" : ""
              }>UN - Unidade</option>

              <option value="PC" ${
                v.unidade === "PC" ? "selected" : ""
              }>PC - Peça</option>

              <option value="CX" ${
                v.unidade === "CX" ? "selected" : ""
              }>CX - Caixa</option>

              <option value="KG" ${
                v.unidade === "KG" ? "selected" : ""
              }>KG - Quilograma</option>

              <option value="G" ${
                v.unidade === "G" ? "selected" : ""
              }>G - Grama</option>

              <option value="L" ${
                v.unidade === "L" ? "selected" : ""
              }>L - Litro</option>

              <option value="ML" ${
                v.unidade === "ML" ? "selected" : ""
              }>ML - Mililitro</option>

              <option value="M" ${
                v.unidade === "M" ? "selected" : ""
              }>M - Metro</option>

              <option value="M2" ${
                v.unidade === "M2" ? "selected" : ""
              }>M2 - Metro quadrado</option>

              <option value="M3" ${
                v.unidade === "M3" ? "selected" : ""
              }>M3 - Metro cúbico</option>

              <option value="PAR" ${
                v.unidade === "PAR" ? "selected" : ""
              }>PAR - Par</option>

              <option value="DZ" ${
                v.unidade === "DZ" ? "selected" : ""
              }>DZ - Dúzia</option>

            </select>

          </div>

        </div>

        <div>

          <label>Origem da mercadoria</label>

          <select id="v_origem_mercadoria">

            <option value="0" ${
              (v.origem_mercadoria || "0") === "0" ? "selected" : ""
            }>0 - Nacional</option>

            <option value="1" ${
              v.origem_mercadoria === "1" ? "selected" : ""
            }>1 - Estrangeira (importação direta)</option>

            <option value="2" ${
              v.origem_mercadoria === "2" ? "selected" : ""
            }>2 - Estrangeira (mercado interno)</option>

            <option value="3" ${
              v.origem_mercadoria === "3" ? "selected" : ""
            }>3 - Nacional c/ importação 40%–70%</option>

            <option value="4" ${
              v.origem_mercadoria === "4" ? "selected" : ""
            }>4 - Nacional (processos produtivos básicos)</option>

            <option value="5" ${
              v.origem_mercadoria === "5" ? "selected" : ""
            }>5 - Nacional c/ importação ≤ 40%</option>

            <option value="6" ${
              v.origem_mercadoria === "6" ? "selected" : ""
            }>6 - Estrangeira (sem similar nacional)</option>

            <option value="7" ${
              v.origem_mercadoria === "7" ? "selected" : ""
            }>7 - Estrangeira (mercado interno, sem similar)</option>

            <option value="8" ${
              v.origem_mercadoria === "8" ? "selected" : ""
            }>8 - Nacional c/ importação > 70%</option>

          </select>

        </div>

      </div>

      <!-- ===== FIM DADOS FISCAIS ===== -->

      <div class="grid2">

        <div>

          <label>
            Estoque inicial
          </label>

          <input
            id="v_estoque"
            type="number"
            step="0.001"
            min="0"
            value="${v.estoque ?? 0}"
            ${
              v.id
                ? "disabled"
                : ""
            }>

          ${
            v.id
              ? `
                <small class="muted">
                  O estoque não é alterado
                  pela edição da variação.
                </small>
              `
              : ""
          }

        </div>

        <div>

          <label>
            Estoque mínimo
          </label>

          <input
            id="v_minimo"
            type="number"
            step="0.001"
            min="0"
            value="${v.estoque_minimo ?? 0}">

        </div>

      </div>

      <label>

        <input
          id="v_ativo"
          type="checkbox"
          style="width:auto"
          ${
            v.ativo !== false
              ? "checked"
              : ""
          }>

        Variação ativa

      </label>

      <label>

        <input
          id="v_catalogo"
          type="checkbox"
          style="width:auto"
          ${
            v.exibir_catalogo !== false
              ? "checked"
              : ""
          }>

        Exibir no catálogo

      </label>

      <div>

        <label>
          Observações
        </label>

        <textarea
          id="v_observacoes"
          rows="3"
          placeholder="Observações internas"
        >${escapeHtml(v.observacoes || "")}</textarea>

      </div>

      <button
        class="btn btn-primary full"
        type="submit"
        id="saveVariationButton">

        Salvar variação

      </button>

    </form>

  `;

}

/*
 * ==========================================================
 * FEEDBACK VISUAL AO TROCAR DE PRODUTO
 *
 * A herança REAL de custos/precificação/fiscais é feita
 * pelos triggers SQL (BEFORE INSERT / UPDATE) no banco.
 *
 * A herança de IMAGEM é feita aqui no JS, porque o banco
 * não tem trigger para isso.
 * ==========================================================
 */
function onProductChange(productId) {

  const hint = $("productHint");

  if (!productId) {

    if (hint) {
      hint.style.display = "none";
    }

    return;

  }

  const product =
    products.find(function(p) {

      return String(p.id) ===
        String(productId);

    });

  if (!product) {

    if (hint) {
      hint.style.display = "none";
    }

    return;

  }

  /*
   * Avisa se o produto já tem variações
   * cadastradas (evita duplicidade).
   */
  const jaTemVariacoes =
    variations.some(function(v) {

      return (
        String(v.produto_id) ===
          String(productId) &&
        String(v.id) !==
          String(editingVariationId || "")
      );

    });

  /* ----- Preenchimento visual básico ----- */

  // Nome e descrição (só se vazios — feedback)
  const nomeInput = $("v_nome");
  if (nomeInput && !nomeInput.value.trim()) {
    nomeInput.value = product.nome || "";
  }

  const descInput = $("v_descricao");
  if (descInput && !descInput.value.trim()) {
    descInput.value = product.descricao || "";
  }

  // Flags
  const catInput = $("v_catalogo");
  if (catInput) {
    catInput.checked = product.exibir_catalogo !== false;
  }

  const ativoInput = $("v_ativo");
  if (ativoInput) {
    ativoInput.checked = product.ativo !== false;
  }

  // Preenche visualmente os campos que o banco vai herdar
  // (apenas quando o usuário ainda não tocou neles)
  const preencherSeVazio = function(id, valor) {
    const el = $(id);
    if (!el || valor === null || valor === undefined) return;
    if (!el.value || Number(el.value) === 0) {
      el.value = Number(valor) || 0;
    }
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

  // Margem: default 30 → herda do produto se ainda estiver em 30
  const margemEl = $("prec_margem");
  if (margemEl) {
    const margemAtual = Number(margemEl.value);
    const margemProduto = Number(product.precificacao_margem_percentual) || 30;
    if (!margemEl.value || margemAtual === 30) {
      if (margemProduto !== 30) {
        margemEl.value = margemProduto;
      }
    }
  }

  // Campos fiscais (só se vazios)
  const preencherTexto = function(id, valor) {
    const el = $(id);
    if (!el || valor === null || valor === undefined) return;
    if (!el.value || !String(el.value).trim()) {
      el.value = valor;
    }
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

  // ============================================================
  // HERANÇA DE IMAGEM DO PRODUTO
  //
  // Só herda se:
  //   - está criando uma NOVA variação (não é edição)
  //   - o produto tem imagem_principal
  //   - o usuário ainda NÃO escolheu uma imagem nova
  //   - o usuário ainda NÃO removeu manualmente
  //
  // Como a imagem é a MESMA URL do produto, se depois o usuário
  // remover a imagem da variação, ela NÃO deve ser apagada do
  // bucket (pertence ao produto). Por isso currentImageUrl é
  // setado, mas a exclusão no saveVariation fica condicionada
  // a ter havido upload próprio (ver saveVariation).
  // ============================================================
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

  /* ----- Aviso na tela ----- */
  if (hint) {

    if (jaTemVariacoes) {

      hint.textContent =
        "⚠ Este produto já possui variações cadastradas. " +
        "Campos vazios serão herdados pelo banco ao salvar. " +
        "Confira se não está duplicando.";

      hint.style.color = "#b45309";

    } else {

      hint.textContent =
        "✓ Ao salvar, custos, precificação e dados fiscais " +
        "vazios serão herdados automaticamente do produto. " +
        "O preço de venda não é herdado.";

      hint.style.color = "#0a7d28";

    }

    hint.style.display = "block";

  }

}

/*
 * ==========================================================
 * ABERTURA DO MODAL
 * ==========================================================
 */

function newVariation() {

  if (!products.length) {

    alert(
      "Cadastre pelo menos um produto antes de criar uma variação."
    );

    return;

  }

  editingVariationId = null;

  currentImageUrl = null;

  openModal(
    "Nova variação",
    variationForm({
      ativo: true,
      exibir_catalogo: true,
      precificacao_margem_percentual: 30
    })
  );

  atualizarPrecificacao();

}

function editVariation(id) {

  const variation =
    variations.find(function(v) {

      return String(v.id) ===
        String(id);

    });

  if (!variation) {

    alert(
      "Variação não encontrada."
    );

    return;

  }

  editingVariationId = id;

  currentImageUrl = variation.imagem || null;

  openModal(
    "Editar variação",
    variationForm(variation)
  );

  atualizarPrecificacao();

}

/*
 * ==========================================================
 * IMAGEM
 * ==========================================================
 */

function previewImage(event) {

  const file = event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {

    alert("Selecione um arquivo de imagem.");

    event.target.value = "";

    return;

  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {

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

  if ($("imageFileName")) {

    $("imageFileName").textContent =
      "Nenhuma imagem selecionada";

  }

  if ($("imagePreview")) {

    $("imagePreview").src = "";

  }

  if ($("imagePreviewContainer")) {

    $("imagePreviewContainer").style.display = "none";

  }

  currentImageUrl = null;

}

async function uploadImage(file) {

  if (!file) return currentImageUrl;

  $("uploadStatus").style.display = "block";

  $("uploadStatus").textContent = "Enviando imagem...";

  const extension = file.name.split(".").pop().toLowerCase();

  const uniqueName =
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 10) +
    "." +
    extension;

  const filePath =
    currentStore.id_loja +
    "/variacoes/" +
    uniqueName;

  const upload =
    await db.storage
      .from("produtos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

  if (upload.error) {

    $("uploadStatus").style.display = "none";

    throw upload.error;

  }

  const publicUrl =
    db.storage
      .from("produtos")
      .getPublicUrl(filePath);

  $("uploadStatus").textContent = "Imagem enviada.";

  return publicUrl.data.publicUrl;

}

/*
 * ==========================================================
 * SALVAR VARIAÇÃO
 *
 * No INSERT:
 *   - calcula a sequência da loja (count + 1)
 *   - gera o SKU no formato SKU_DO_PRODUTO-NNNNN
 *   - insere já com o SKU definitivo
 *
 * No UPDATE:
 *   - NÃO envia sku → banco preserva o existente
 *
 * Os triggers SQL BEFORE INSERT/UPDATE do banco
 * preenchem o que estiver vazio a partir do produto pai.
 * preco_venda NUNCA é herdado.
 * ==========================================================
 */
async function saveVariation(ev, id) {

  ev.preventDefault();

  if (!currentStore) {

    alert("Não foi possível identificar a loja.");

    return;

  }

  const produtoId =
    Number($("v_produto").value);

  const produto =
    products.find(function(p) {

      return Number(p.id) === produtoId;

    });

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

  // Valida NCM (se preenchido)
  const ncmValue =
    $("v_ncm").value.replace(/\D/g, "");

  if (ncmValue && ncmValue.length !== 8) {

    alert(
      "O NCM deve ter exatamente 8 dígitos.\n\n" +
      "Valor informado: " + ncmValue
    );

    return;

  }

  // Recalcula a precificação para garantir consistência
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

    alert(
      "Não foi possível calcular a precificação:\n\n" +
      precResultado.erro
    );

    return;

  }

  const saveButton = $("saveVariationButton");

  saveButton.disabled = true;

  saveButton.textContent = "Salvando...";

  try {

    const selectedFile = $("v_imagem").files[0];

    let imageUrl = currentImageUrl;

    if (selectedFile) {

      imageUrl = await uploadImage(selectedFile);

    }

    const payload = {

      id_loja: currentStore.id_loja,
      produto_id: produtoId,
      nome: nome,
      descricao: $("v_descricao").value.trim() || null,
      imagem: imageUrl || null,
      preco_venda: precoVenda,
      preco_custo: precoCusto,
      estoque_minimo: estoqueMinimo,
      ativo: $("v_ativo").checked,
      exibir_catalogo: $("v_catalogo").checked,
      observacoes: $("v_observacoes").value.trim() || null,

      // ===== PRECIFICAÇÃO =====
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

      // ===== DADOS FISCAIS =====
      ncm:               ncmValue || null,
      cfop:              $("v_cfop").value.replace(/\D/g, "") || "5102",
      cest:              $("v_cest").value.replace(/\D/g, "") || null,
      unidade:           $("v_unidade_fiscal").value || "UN",
      origem_mercadoria: $("v_origem_mercadoria").value || "0"

    };

    let result;

    if (id) {

      // ===== EDIÇÃO =====
      // NÃO envia sku → o banco preserva o existente.
      result =
        await db
          .from("gestao_loja_produtos_variacoes")
          .update(payload)
          .eq("id", id)
          .eq("id_loja", currentStore.id_loja);

    } else {

      // ===== CADASTRO NOVO =====
      // Calcula a sequência DENTRO da loja atual (começa em 1)
      const sequencia = await proximaSequenciaSkuVariacao();

      // Gera o SKU da variação com base no SKU do produto pai
      const skuVariacao = generateSkuVariacao(produto.sku, sequencia);

      payload.sku = skuVariacao;

      payload.estoque =
        Number($("v_estoque").value || 0);

      result =
        await db
          .from("gestao_loja_produtos_variacoes")
          .insert(payload);

    }

    if (result.error) {

      throw result.error;

    }

    closeModal();

    currentImageUrl = null;

    await renderVariations();

  } catch (error) {

    console.error("Erro ao salvar variação:", error);

    alert("Erro ao salvar variação:\n" + error.message);

  } finally {

    saveButton.disabled = false;

    saveButton.textContent = "Salvar variação";

    if ($("uploadStatus")) {

      $("uploadStatus").style.display = "none";

    }

  }

}

/*
 * ==========================================================
 * BOOT
 * ==========================================================
 */
document.addEventListener(
  "DOMContentLoaded",
  async function() {

    const authenticated = await requireAuth();

    if (!authenticated) return;

    const contextLoaded = await loadUserContext();

    if (!contextLoaded) return;

    setActiveNav();

    $("pageSubtitle").textContent =
      "Cadastre e gerencie as variações dos seus produtos";

    try {

      await renderVariations();

    } catch (e) {

      console.error(e);

      $("variationsTable").innerHTML =
        '<div class="message error">' +
        escapeHtml(e.message) +
        '</div>';

    }

  }
);
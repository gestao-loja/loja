let products = [];
let categories = [];


/*
 * ============================================================
 * CONTROLES DE IMAGEM DO PRODUTO
 * ============================================================
 */

// URL atualmente vinculada ao formulário
let currentProductImageUrl = null;

// URL original do produto (para apagar do bucket ao trocar/remover)
let productImageOriginalUrl = null;

// Se o usuário clicou em "Remover imagem"
let productImageRemoved = false;

// Arquivo escolhido (ainda não enviado ao bucket)
let productImageNewFile = null;

// URL da imagem nova já enviada (para rollback se o save falhar)
let productImageNewUrl = null;


/*
 * Gera um SKU único por loja no formato:
 *   PREFIXO-NNNNN
 * Ex.: CAM-00001
 *
 * O número é a sequência DENTRO da loja,
 * começando em 1 para cada loja.
 */
function generateSku(nomeProduto, sequencia) {

  const nome =
    String(nomeProduto || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();

  const prefixos = [
    { palavras: ["CANECA"], sigla: "CAN" },
    { palavras: ["CHINELO"], sigla: "CHI" },
    { palavras: ["CAMISETA", "CAMISA"], sigla: "CAM" }
  ];

  const regra =
    prefixos.find(item =>
      item.palavras.some(palavra =>
        nome.startsWith(palavra)
      )
    );

  const prefixo =
    regra
      ? regra.sigla
      : nome.substring(0, 3) || "PRO";

  const numero =
    String(sequencia).padStart(5, "0");

  return `${prefixo}-${numero}`;
}


/*
 * Retorna a próxima sequência de SKU para a loja atual.
 * Conta quantos produtos a loja já tem e soma 1.
 *
 * Como não há exclusão de produtos, a sequência
 * nunca volta e nunca colide.
 */
async function proximaSequenciaSku() {

  const result = await db
    .from("gestao_loja_produtos")
    .select("id", { count: "exact", head: true })
    .eq("id_loja", currentStore.id_loja);

  if (result.error) {
    throw result.error;
  }

  const total = result.count || 0;

  return total + 1;

}


async function loadCategories() {

  if (!currentStore || !currentStore.id_loja) {
    throw new Error(
      "Não foi possível identificar a loja."
    );
  }

  const result = await db
    .from("gestao_loja_categorias")
    .select("id,id_loja,nome")
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (result.error) {
    throw result.error;
  }

  categories =
    result.data || [];

}


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
      categoria_id,
      unidade_medida,
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

  products =
    result.data || [];

}


/* ======================================================
   PRECIFICAÇÃO — Fórmula
   PV = C / (1 - (D + L) / 100)
   ====================================================== */

/**
 * Calcula custo total e preço de venda sugerido.
 *
 * @param {Object} dados
 * @param {number} dados.materiais   Custo com materiais (R$)
 * @param {number} dados.embalagem   Custo com embalagem (R$)
 * @param {number} dados.maoObra     Custo com mão de obra (R$)
 * @param {number} dados.outros      Outros custos (R$)
 * @param {number} dados.taxas       Taxas (%) - ex.: maquininha
 * @param {number} dados.impostos    Impostos (%)
 * @param {number} dados.despesas    Despesas fixas (%)
 * @param {number} dados.margem      Margem de lucro desejada (%)
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

  // Se D + L >= 100, a fórmula é inválida (divisão por zero / negativa).
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
 * Lê os campos do formulário, calcula e atualiza
 * os campos de resultado em tempo real.
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
    custoEl.value =
      resultado.custoTotal.toFixed(2);
  }

  if (precoEl) {
    precoEl.value =
      resultado.precoSugerido.toFixed(2);
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

  // Botão para aplicar o preço sugerido em "Preço de venda"
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
  const preco    = $("p_preco");

  if (!sugerido || !preco) return;

  const valor = Number(sugerido.value) || 0;

  if (valor <= 0) {
    alert("Calcule a precificação antes de aplicar.");
    return;
  }

  preco.value = valor.toFixed(2);

}


/* ======================================================
   IMAGEM DO PRODUTO
   ====================================================== */

/**
 * Extrai o caminho do bucket a partir da URL pública.
 * Ex.: https://xxx.supabase.co/storage/v1/object/public/produtos/1/produtos/abc.jpg
 *   → "1/produtos/abc.jpg"
 */
function extrairCaminhoDoBucketProduto(url) {

  if (!url) return null;

  const marcador = "/object/public/produtos/";
  const idx = url.indexOf(marcador);

  if (idx === -1) return null;

  return url.substring(idx + marcador.length);

}


/**
 * Apaga um arquivo do bucket "produtos" a partir da URL pública.
 * Retorna true se apagou (ou se não havia nada para apagar).
 */
async function apagarImagemDoBucketProduto(url) {

  const caminho = extrairCaminhoDoBucketProduto(url);

  if (!caminho) return true;

  try {

    const { error } = await db.storage
      .from("produtos")
      .remove([caminho]);

    if (error) {
      console.warn(
        "Erro ao apagar imagem do produto do bucket:",
        error
      );
      return false;
    }

    return true;

  } catch (e) {

    console.warn(
      "Erro ao apagar imagem do produto do bucket:",
      e
    );

    return false;

  }

}


/**
 * Faz upload da imagem do produto.
 * Caminho: {id_loja}/produtos/{timestamp}_{random}.{ext}
 */
async function uploadProductImage(file) {

  if (!file) return currentProductImageUrl;

  const statusEl = $("uploadStatus");

  if (statusEl) {
    statusEl.style.display = "block";
    statusEl.textContent = "Enviando imagem...";
  }

  const extension =
    file.name.split(".").pop().toLowerCase();

  const uniqueName =
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 10) +
    "." +
    extension;

  const filePath =
    currentStore.id_loja +
    "/produtos/" +
    uniqueName;

  const upload = await db.storage
    .from("produtos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (upload.error) {

    if (statusEl) statusEl.style.display = "none";

    throw upload.error;

  }

  const publicUrl = db.storage
    .from("produtos")
    .getPublicUrl(filePath);

  if (statusEl) statusEl.textContent = "Imagem enviada.";

  return publicUrl.data.publicUrl;

}


/**
 * Preview de imagem escolhida pelo usuário.
 */
function previewProductImage(event) {

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

  const fileNameEl = $("imageFileName");

  if (fileNameEl) {
    fileNameEl.textContent = file.name;
  }

  const reader = new FileReader();

  reader.onload = function (e) {

    const preview = $("imagePreview");
    const container = $("imagePreviewContainer");

    if (preview) preview.src = e.target.result;
    if (container) container.style.display = "block";

  };

  reader.readAsDataURL(file);

  productImageNewFile = file;
  productImageRemoved = false;

}


/**
 * Remove a imagem do produto.
 * NÃO apaga do bucket aqui — só marca a intenção.
 * A exclusão real acontece no saveProduct, após o banco confirmar.
 */
function removeProductImage() {

  const input = $("p_imagem");

  if (input) input.value = "";

  const fileNameEl = $("imageFileName");

  if (fileNameEl) {
    fileNameEl.textContent =
      "Nenhuma imagem selecionada";
  }

  const preview = $("imagePreview");

  if (preview) {
    preview.src = "";
  }

  const container = $("imagePreviewContainer");

  if (container) {
    container.style.display = "none";
  }

  productImageRemoved = true;
  productImageNewFile = null;
  productImageNewUrl = null;
  currentProductImageUrl = null;

}


/* ======================================================
   CATEGORIA
   ====================================================== */

function newCategory() {

  openModal(
    "Nova categoria",
    categoryForm()
  );

}


function categoryForm() {

  return `
    <form onsubmit="saveCategory(event)">

      <div>

        <label for="c_nome">
          Nome da categoria *
        </label>

        <input
          id="c_nome"
          type="text"
          required
          maxlength="100"
          placeholder="Ex.: Canecas, Camisetas, Chinelos"
          autocomplete="off">

      </div>

      <button
        class="btn btn-primary full"
        type="submit"
        style="margin-top:16px;">

        Salvar categoria

      </button>

    </form>
  `;

}


async function saveCategory(ev) {

  ev.preventDefault();

  if (!currentStore || !currentStore.id_loja) {

    alert(
      "Não foi possível identificar a loja responsável pelo cadastro."
    );

    return;

  }

  const nome =
    $("c_nome").value.trim();

  if (!nome) {

    alert(
      "Informe o nome da categoria."
    );

    return;

  }

  const botao =
    ev.submitter;

  if (botao) {

    botao.disabled = true;
    botao.textContent = "Salvando...";

  }

  try {

    const idLoja =
      currentStore.id_loja;

    // Verifica se a categoria já existe NESTA LOJA.
    const consulta = await db
      .from("gestao_loja_categorias")
      .select("id,nome")
      .eq("id_loja", idLoja)
      .ilike("nome", nome);

    if (consulta.error) {
      throw consulta.error;
    }

    const existente =
      (consulta.data || []).some(
        c =>
          String(c.nome).trim().toLowerCase() ===
          nome.toLowerCase()
      );

    if (existente) {

      alert(
        "Esta categoria já está cadastrada na sua loja."
      );

      return;

    }

    // Cadastra a categoria vinculada à loja atual.
    const resultado = await db
      .from("gestao_loja_categorias")
      .insert({
        id_loja: idLoja,
        nome: nome
      })
      .select("id,id_loja,nome")
      .single();

    if (resultado.error) {
      throw resultado.error;
    }

    // Atualiza as categorias disponíveis.
    await loadCategories();

    // Fecha o modal.
    closeModal();

    // Atualiza a listagem de produtos.
    await renderProducts();

    alert(
      "Categoria cadastrada com sucesso!"
    );

  } catch (e) {

    console.error(
      "Erro ao cadastrar categoria:",
      e
    );

    alert(
      "Não foi possível cadastrar a categoria.\n\n" +
      (e.message || "Erro desconhecido.")
    );

  } finally {

    if (botao && botao.isConnected) {

      botao.disabled = false;
      botao.textContent = "Salvar categoria";

    }

  }

}


/* ======================================================
   LISTAGEM
   ====================================================== */

async function renderProducts() {

  try {

    await loadProducts();

  } catch (e) {

    $("productsTable").innerHTML =
      '<div class="message error">' +
      escapeHtml(e.message) +
      '</div>';

    return;

  }

  if (!products.length) {

    $("productsTable").innerHTML =
      '<div class="empty">' +
      'Nenhum produto cadastrado.' +
      '</div>';

    return;

  }

  $("productsTable").innerHTML = `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>Imagem</th>

            <th>Produto</th>

            <th>SKU</th>

            <th>Categoria</th>

            <th>Unidade</th>

            <th>NCM</th>

            <th>Preço</th>

            <th>Status</th>

            <th></th>

          </tr>

        </thead>

        <tbody>

          ${products.map(function(p) {

            const categoria =
              categories.find(function(c) {

                return String(c.id) ===
                  String(p.categoria_id);

              });

            const imageCell =
              p.imagem_principal
                ? `
                  <img
                    src="${escapeHtml(p.imagem_principal)}"
                    alt="${escapeHtml(p.nome)}"
                    style="
                      width:50px;
                      height:50px;
                      object-fit:cover;
                      border-radius:8px;
                      border:1px solid #ddd;
                    ">
                `
                : '<span class="muted">—</span>';

            return `

              <tr>

                <td>

                  ${imageCell}

                </td>

                <td>

                  <strong>
                    ${escapeHtml(p.nome)}
                  </strong>

                </td>

                <td>

                  <strong>
                    ${escapeHtml(
                      p.sku || "-"
                    )}
                  </strong>

                </td>

                <td>

                  ${
                    categoria
                      ? escapeHtml(
                          categoria.nome
                        )
                      : "-"
                  }

                </td>

                <td>

                  ${escapeHtml(
                    p.unidade_medida || "UN"
                  )}

                </td>

                <td>

                  ${
                    p.ncm
                      ? escapeHtml(p.ncm)
                      : '<span class="muted">—</span>'
                  }

                </td>

                <td>

                  ${money(
                    p.preco_venda
                  )}

                </td>

                <td>

                  <span
                    class="badge ${
                      p.ativo
                        ? "badge-green"
                        : "badge-red"
                    }">

                    ${
                      p.ativo
                        ? "Ativo"
                        : "Inativo"
                    }

                  </span>

                </td>

                <td>

                  <button
                    class="btn btn-secondary"
                    onclick="editProduct('${p.id}')">

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


/* ======================================================
   FORMULÁRIO DE PRODUTO
   ====================================================== */

function productForm(p = {}) {

  const categoryOptions =
    categories.map(function(c) {

      return `

        <option
          value="${c.id}"
          ${
            String(
              p.categoria_id || ""
            ) === String(c.id)
              ? "selected"
              : ""
          }>

          ${escapeHtml(c.nome)}

        </option>

      `;

    }).join("");

  // Valores de precificação (defaults vindos do banco / novos produtos)
  const prec = {
    materiais: p.precificacao_materiais ?? 0,
    embalagem: p.precificacao_embalagem ?? 0,
    maoObra:   p.precificacao_mao_obra   ?? 0,
    outros:    p.precificacao_outros     ?? 0,
    taxas:     p.precificacao_taxas_percentual    ?? 0,
    impostos:  p.precificacao_impostos_percentual ?? 0,
    despesas:  p.precificacao_despesas_percentual ?? 0,
    margem:    p.precificacao_margem_percentual   ?? 30,
    custoTotal: p.precificacao_custo_total    ?? 0,
    precoSugerido: p.precificacao_preco_sugerido ?? 0
  };

  // Preview da imagem (se já existir)
  const imagePreview =
    p.imagem_principal
      ? `
        <div
          id="imagePreviewContainer"
          style="
            margin-top:15px;
            text-align:center;
          ">

          <img
            id="imagePreview"
            src="${escapeHtml(p.imagem_principal)}"
            alt="Imagem do produto"
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
            onclick="removeProductImage()">

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
            onclick="removeProductImage()">

            Remover imagem

          </button>

        </div>
      `;

  return `

    <form
      onsubmit="saveProduct(
        event,
        ${
          p.id
            ? `'${p.id}'`
            : "null"
        }
      )">

      <div>

        <label>SKU</label>

        <input
          id="p_sku"
          value="${escapeHtml(
            p.sku ||
            "Gerado automaticamente"
          )}"
          readonly>

        <small class="muted">

          O SKU é gerado automaticamente
          pelo sistema.

        </small>

      </div>

      <div style="margin-top:15px;">

        <label>
          Imagem do produto
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
            for="p_imagem"
            class="btn btn-primary"
            style="
              display:inline-block;
              cursor:pointer;
            ">

            Selecionar imagem

          </label>

          <input
            type="file"
            id="p_imagem"
            accept="image/*"
            style="display:none;"
            onchange="previewProductImage(event)">

          <div
            id="imageFileName"
            class="muted"
            style="margin-top:10px;">

            ${
              p.imagem_principal
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
            Nome *
          </label>

          <input
            id="p_nome"
            required
            value="${escapeHtml(
              p.nome || ""
            )}">

        </div>

        <div>

          <label>
            Categoria
          </label>

          <select id="p_categoria">

            <option value="">
              Sem categoria
            </option>

            ${categoryOptions}

          </select>

        </div>

      </div>

      <div>

        <label>
          Descrição
        </label>

        <textarea
          id="p_descricao"
          rows="3"
        >${escapeHtml(
          p.descricao || ""
        )}</textarea>

      </div>

      <div class="grid2">

        <div>

          <label>
            Unidade de medida
          </label>

          <input
            id="p_unidade"
            value="${escapeHtml(
              p.unidade_medida || "UN"
            )}">

        </div>

        <div>

          <label>
            Preço de venda
          </label>

          <input
            id="p_preco"
            type="number"
            step="0.01"
            min="0"
            value="${
              p.preco_venda ?? 0
            }">

        </div>

      </div>

      <div class="grid2">

        <div>

          <label>
            Preço de custo
          </label>

          <input
            id="p_custo"
            type="number"
            step="0.01"
            min="0"
            value="${
              p.preco_custo ?? 0
            }">

        </div>

        <div>

          <label>
            Estoque mínimo
          </label>

          <input
            id="p_minimo"
            type="number"
            step="0.001"
            min="0"
            value="${
              p.estoque_minimo ?? 0
            }">

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
          Precificação do produto
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
          — onde <b>C</b> = soma dos custos,
          <b>D</b> = despesas percentuais e
          <b>L</b> = margem de lucro.
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
          Usados na emissão de NF-e.
          NCM é obrigatório para PJ.
        </div>

        <div class="grid2">

          <div>

            <label>NCM</label>

            <input
              id="p_ncm"
              maxlength="8"
              placeholder="00000000"
              value="${escapeHtml(
                p.ncm || ""
              )}"
              oninput="this.value = this.value.replace(/\\D/g, '').slice(0,8)">

            <small class="muted">
              8 dígitos, sem pontos
            </small>

          </div>

          <div>

            <label>CFOP</label>

            <input
              id="p_cfop"
              maxlength="4"
              placeholder="5102"
              value="${escapeHtml(
                p.cfop || "5102"
              )}"
              oninput="this.value = this.value.replace(/\\D/g, '').slice(0,4)">

          </div>

        </div>

        <div class="grid2">

          <div>

            <label>CEST</label>

            <input
              id="p_cest"
              maxlength="7"
              placeholder="0000000"
              value="${escapeHtml(
                p.cest || ""
              )}"
              oninput="this.value = this.value.replace(/\\D/g, '').slice(0,7)">

            <small class="muted">
              Opcional (substituição tributária)
            </small>

          </div>

          <div>

            <label>Unidade fiscal</label>

            <select id="p_unidade_fiscal">

              <option value="UN" ${
                (p.unidade || "UN") === "UN"
                  ? "selected"
                  : ""
              }>UN - Unidade</option>

              <option value="PC" ${
                p.unidade === "PC"
                  ? "selected"
                  : ""
              }>PC - Peça</option>

              <option value="CX" ${
                p.unidade === "CX"
                  ? "selected"
                  : ""
              }>CX - Caixa</option>

              <option value="KG" ${
                p.unidade === "KG"
                  ? "selected"
                  : ""
              }>KG - Quilograma</option>

              <option value="G" ${
                p.unidade === "G"
                  ? "selected"
                  : ""
              }>G - Grama</option>

              <option value="L" ${
                p.unidade === "L"
                  ? "selected"
                  : ""
              }>L - Litro</option>

              <option value="ML" ${
                p.unidade === "ML"
                  ? "selected"
                  : ""
              }>ML - Mililitro</option>

              <option value="M" ${
                p.unidade === "M"
                  ? "selected"
                  : ""
              }>M - Metro</option>

              <option value="M2" ${
                p.unidade === "M2"
                  ? "selected"
                  : ""
              }>M2 - Metro quadrado</option>

              <option value="M3" ${
                p.unidade === "M3"
                  ? "selected"
                  : ""
              }>M3 - Metro cúbico</option>

              <option value="PAR" ${
                p.unidade === "PAR"
                  ? "selected"
                  : ""
              }>PAR - Par</option>

              <option value="DZ" ${
                p.unidade === "DZ"
                  ? "selected"
                  : ""
              }>DZ - Dúzia</option>

            </select>

          </div>

        </div>

        <div>

          <label>Origem da mercadoria</label>

          <select id="p_origem_mercadoria">

            <option value="0" ${
              (p.origem_mercadoria || "0") === "0"
                ? "selected"
                : ""
            }>0 - Nacional</option>

            <option value="1" ${
              p.origem_mercadoria === "1"
                ? "selected"
                : ""
            }>1 - Estrangeira (importação direta)</option>

            <option value="2" ${
              p.origem_mercadoria === "2"
                ? "selected"
                : ""
            }>2 - Estrangeira (mercado interno)</option>

            <option value="3" ${
              p.origem_mercadoria === "3"
                ? "selected"
                : ""
            }>3 - Nacional c/ importação 40%–70%</option>

            <option value="4" ${
              p.origem_mercadoria === "4"
                ? "selected"
                : ""
            }>4 - Nacional (processos produtivos básicos)</option>

            <option value="5" ${
              p.origem_mercadoria === "5"
                ? "selected"
                : ""
            }>5 - Nacional c/ importação ≤ 40%</option>

            <option value="6" ${
              p.origem_mercadoria === "6"
                ? "selected"
                : ""
            }>6 - Estrangeira (sem similar nacional)</option>

            <option value="7" ${
              p.origem_mercadoria === "7"
                ? "selected"
                : ""
            }>7 - Estrangeira (mercado interno, sem similar)</option>

            <option value="8" ${
              p.origem_mercadoria === "8"
                ? "selected"
                : ""
            }>8 - Nacional c/ importação > 70%</option>

          </select>

        </div>

      </div>

      <!-- ===== FIM DADOS FISCAIS ===== -->

      <label>

        <input
          id="p_ativo"
          type="checkbox"
          style="width:auto"
          ${
            p.ativo !== false
              ? "checked"
              : ""
          }>

        Produto ativo

      </label>

      <label>

        <input
          id="p_catalogo"
          type="checkbox"
          style="width:auto"
          ${
            p.exibir_catalogo !== false
              ? "checked"
              : ""
          }>

        Exibir no catálogo

      </label>

      <label>

        <input
          id="p_preco_catalogo"
          type="checkbox"
          style="width:auto"
          ${
            p.exibir_preco_catalogo !== false
              ? "checked"
              : ""
          }>

        Exibir preço no catálogo

      </label>

      <div>

        <label>
          Observações
        </label>

        <textarea
          id="p_observacoes"
          rows="3"
        >${escapeHtml(
          p.observacoes || ""
        )}</textarea>

      </div>

      <button
        class="btn btn-primary full"
        type="submit">

        Salvar produto

      </button>

    </form>

  `;

}


function newProduct() {

  // Reseta controles de imagem
  currentProductImageUrl = null;
  productImageOriginalUrl = null;
  productImageRemoved = false;
  productImageNewFile = null;
  productImageNewUrl = null;

  openModal(
    "Novo produto",
    productForm({
      ativo: true,
      exibir_catalogo: true,
      exibir_preco_catalogo: true,
      cfop: "5102",
      unidade: "UN",
      origem_mercadoria: "0",
      precificacao_margem_percentual: 30
    })
  );

  // Calcula precificação inicial (caso os campos já venham preenchidos)
  atualizarPrecificacao();

}


function editProduct(id) {

  const p =
    products.find(function(x) {

      return String(x.id) ===
        String(id);

    });

  if (!p) {

    alert(
      "Produto não encontrado."
    );

    return;

  }

  // Guarda URL original e reseta controles
  currentProductImageUrl = p.imagem_principal || null;
  productImageOriginalUrl = p.imagem_principal || null;
  productImageRemoved = false;
  productImageNewFile = null;
  productImageNewUrl = null;

  openModal(
    "Editar produto",
    productForm(p)
  );

  // Recalcula com base nos dados salvos
  atualizarPrecificacao();

}


async function saveProduct(ev, id) {

  ev.preventDefault();

  if (!currentStore) {

    alert(
      "Não foi possível identificar a loja."
    );

    return;

  }

  const nomeProduto =
    $("p_nome").value.trim();

  if (!nomeProduto) {

    alert(
      "Informe o nome do produto."
    );

    return;

  }

  // Validação do NCM
  const ncmValue =
    $("p_ncm").value.replace(/\D/g, "");

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

  const payload = {

    id_loja:
      currentStore.id_loja,

    nome:
      nomeProduto,

    categoria_id:
      $("p_categoria").value
        ? Number($("p_categoria").value)
        : null,

    descricao:
      $("p_descricao").value.trim() || null,

    unidade_medida:
      $("p_unidade").value.trim() || "UN",

    preco_venda:
      Number($("p_preco").value || 0),

    preco_custo:
      Number($("p_custo").value || 0),

    estoque_minimo:
      Number($("p_minimo").value || 0),

    ncm:
      ncmValue || null,

    cfop:
      $("p_cfop").value.replace(/\D/g, "") || "5102",

    cest:
      $("p_cest").value.replace(/\D/g, "") || null,

    unidade:
      $("p_unidade_fiscal").value || "UN",

    origem_mercadoria:
      $("p_origem_mercadoria").value || "0",

    ativo:
      $("p_ativo").checked,

    exibir_catalogo:
      $("p_catalogo").checked,

    exibir_preco_catalogo:
      $("p_preco_catalogo").checked,

    observacoes:
      $("p_observacoes").value.trim() || null,

    // ===== PRECIFICAÇÃO =====
    precificacao_materiais:
      Number($("prec_materiais").value) || 0,

    precificacao_embalagem:
      Number($("prec_embalagem").value) || 0,

    precificacao_mao_obra:
      Number($("prec_mao_obra").value) || 0,

    precificacao_outros:
      Number($("prec_outros").value) || 0,

    precificacao_taxas_percentual:
      Number($("prec_taxas").value) || 0,

    precificacao_impostos_percentual:
      Number($("prec_impostos").value) || 0,

    precificacao_despesas_percentual:
      Number($("prec_despesas").value) || 0,

    precificacao_margem_percentual:
      Number($("prec_margem").value) || 0,

    precificacao_custo_total:
      precResultado.custoTotal,

    precificacao_preco_sugerido:
      precResultado.precoSugerido

  };

  let result;

  try {

    // ============================================================
    // FLUXO DE IMAGEM
    // ============================================================
    let imagemPrincipalUrl = currentProductImageUrl;
    let urlOriginalParaApagar = null;
    let urlNovaParaApagar = null;

    if (productImageNewFile) {

      // Vai subir uma nova imagem → depois do save, apaga a antiga
      const urlNova = await uploadProductImage(productImageNewFile);

      urlOriginalParaApagar = productImageOriginalUrl || null;
      productImageNewUrl = urlNova;
      urlNovaParaApagar = urlNova;

      imagemPrincipalUrl = urlNova;

    } else if (productImageRemoved) {

      // Vai remover a imagem → depois do save, apaga a antiga
      urlOriginalParaApagar = productImageOriginalUrl || null;

      imagemPrincipalUrl = null;

    }

    payload.imagem_principal = imagemPrincipalUrl || null;

    if (id) {

      // ===== EDIÇÃO =====
      // Preserva o SKU existente do produto.
      const produtoAtual =
        products.find(
          p => String(p.id) === String(id)
        );

      payload.sku =
        produtoAtual?.sku || null;

      // Se por algum motivo o produto estiver sem SKU,
      // gera um novo usando a sequência da loja.
      if (!payload.sku) {
        const sequencia = await proximaSequenciaSku();
        payload.sku = generateSku(nomeProduto, sequencia);
      }

      // 1. Atualiza o produto
      result = await db
        .from("gestao_loja_produtos")
        .update(payload)
        .eq("id", id)
        .eq("id_loja", currentStore.id_loja);

      if (result.error) {
        throw result.error;
      }

      // 2. ATUALIZA AS VARIAÇÕES VINCULADAS A ESTE PRODUTO
      // (Repassa custo, venda, impostos e dados fiscais)
      const { error: variacoesError } = await db
        .from("gestao_loja_produtos_variacoes")
        .update({
          preco_custo: payload.preco_custo,
          preco_venda: payload.preco_venda,
          ncm: payload.ncm,
          cfop: payload.cfop,
          cest: payload.cest,
          unidade: payload.unidade,
          origem_mercadoria: payload.origem_mercadoria
        })
        .eq("produto_id", id)
        .eq("id_loja", currentStore.id_loja);

      if (variacoesError) {
        console.error("Erro ao atualizar variações:", variacoesError);
        // Avisa o usuário, mas não cancela o salvamento do produto,
        // pois o produto em si já foi salvo.
        alert(
          "O produto foi salvo, mas ocorreu um erro ao atualizar as variações:\n" +
          variacoesError.message
        );
      }

    } else {

      // ===== CADASTRO NOVO =====
      // Calcula a sequência DENTRO da loja atual (começa em 1)
      const sequencia = await proximaSequenciaSku();

      // Gera o SKU já com a sequência correta da loja
      const sku = generateSku(nomeProduto, sequencia);

      // Insere o produto já com o SKU definitivo
      result = await db
        .from("gestao_loja_produtos")
        .insert({
          ...payload,
          sku
        })
        .select("id")
        .single();

      if (result.error) {
        throw result.error;
      }

    }

    // Se o save deu certo, apaga a imagem antiga do bucket
    if (urlOriginalParaApagar) {
      await apagarImagemDoBucketProduto(urlOriginalParaApagar);
    }

    // Reseta controles de imagem
    currentProductImageUrl = null;
    productImageOriginalUrl = null;
    productImageRemoved = false;
    productImageNewFile = null;
    productImageNewUrl = null;

    closeModal();
    await renderProducts();

  } catch (e) {

    console.error(
      "Erro ao salvar produto:",
      e
    );

    // Se falhou e havia imagem nova enviada, apaga do bucket
    if (urlNovaParaApagar) {
      await apagarImagemDoBucketProduto(urlNovaParaApagar);
      productImageNewUrl = null;
    }

    alert(
      "Erro ao salvar produto:\n\n" +
      (e.message || "Erro desconhecido.")
    );

  }

}


/* ======================================================
   BOOT
   ====================================================== */

document.addEventListener(
  "DOMContentLoaded",
  async function() {

    const authenticated =
      await requireAuth();

    if (!authenticated) {
      return;
    }

    const contextLoaded =
      await loadUserContext();

    if (!contextLoaded) {
      return;
    }

    setActiveNav();

    $("pageSubtitle").textContent =
      "Cadastre e gerencie seus produtos";

    try {

      await loadCategories();

      await renderProducts();

    } catch (e) {

      console.error(e);

      $("productsTable").innerHTML =
        '<div class="message error">' +
        escapeHtml(e.message) +
        '</div>';

    }

  }
);
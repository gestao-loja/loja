let products = [];
let variations = [];
let stockItems = [];
let clients = [];
let suppliers = [];

// Filtros
let categories = [];
let filterCategory = "";
let filterStatus = "";


/* ======================================================
   CARREGAMENTOS BÁSICOS
   ====================================================== */

async function loadProducts() {

  const result = await db
    .from("gestao_loja_produtos")
    .select(`
      id,
      id_loja,
      nome,
      sku,
      estoque,
      estoque_minimo,
      ativo,
      categoria_id
    `)
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .order("nome");

  if (result.error) {
    throw result.error;
  }

  products =
    result.data || [];

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
      estoque,
      estoque_minimo,
      ativo
    `)
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .order("nome");

  if (result.error) {
    throw result.error;
  }

  variations =
    result.data || [];

}


async function loadClients() {

  const result = await db
    .from("gestao_loja_clientes")
    .select(`
      id,
      nome
    `)
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .eq(
      "ativo",
      true
    )
    .order("nome");

  if (result.error) {
    throw result.error;
  }

  clients =
    result.data || [];

}


async function loadSuppliers() {

  const result = await db
    .from("gestao_loja_fornecedores")
    .select(`
      id,
      razao_social,
      nome_fantasia,
      cpf_cnpj,
      email,
      telefone,
      whatsapp,
      contato_responsavel,
      cep,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      observacoes
    `)
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .eq(
      "ativo",
      true
    )
    .order("razao_social");

  if (result.error) {
    throw result.error;
  }

  suppliers =
    result.data || [];

}


async function loadCategories() {

  const result = await db
    .from("gestao_loja_categorias")
    .select(`
      id,
      nome
    `)
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .order("nome");

  if (result.error) {
    throw result.error;
  }

  categories =
    result.data || [];

}


/* ======================================================
   MONTAGEM DO ESTOQUE
   ====================================================== */

async function loadStock() {

  await Promise.all([
    loadProducts(),
    loadVariations()
  ]);

  const productIdsWithVariations =
    new Set(
      variations.map(function(v) {

        return String(
          v.produto_id
        );

      })
    );


  stockItems = [];


  products.forEach(function(product) {

    const hasVariations =
      productIdsWithVariations.has(
        String(product.id)
      );


    if (!hasVariations) {

      stockItems.push({

        type: "produto",

        id:
          product.id,

        produto_id:
          product.id,

        produto_nome:
          product.nome,

        produto_sku:
          product.sku,

        variacao_nome:
          null,

        sku:
          product.sku,

        categoria_id:
          product.categoria_id || null,

        estoque:
          Number(
            product.estoque || 0
          ),

        estoque_minimo:
          Number(
            product.estoque_minimo || 0
          ),

        ativo:
          product.ativo

      });

    }

  });


  variations.forEach(function(variation) {

    const product =
      products.find(function(p) {

        return String(p.id) ===
          String(
            variation.produto_id
          );

      });


    stockItems.push({

      type:
        "variacao",

      id:
        variation.id,

      produto_id:
        variation.produto_id,

      produto_nome:
        product
          ? product.nome
          : "Produto não encontrado",

      produto_sku:
        product
          ? product.sku
          : null,

      variacao_nome:
        variation.nome,

      sku:
        variation.sku,

      categoria_id:
        product
          ? (product.categoria_id || null)
          : null,

      estoque:
        Number(
          variation.estoque || 0
        ),

      estoque_minimo:
        Number(
          variation.estoque_minimo || 0
        ),

      ativo:
        variation.ativo

    });

  });


  stockItems.sort(function(a, b) {

    const productCompare =
      a.produto_nome.localeCompare(
        b.produto_nome,
        "pt-BR"
      );


    if (productCompare !== 0) {

      return productCompare;

    }


    const variationA =
      a.variacao_nome || "";

    const variationB =
      b.variacao_nome || "";


    return variationA.localeCompare(
      variationB,
      "pt-BR"
    );

  });

}


/* ======================================================
   RENDERIZAÇÃO
   ====================================================== */

async function renderStock() {

  try {

    await loadStock();

  } catch (error) {

    console.error(
      "Erro ao carregar estoque:",
      error
    );


    $("stockTable").innerHTML =
      '<div class="message error">' +
      escapeHtml(
        error.message
      ) +
      '</div>';

    return;

  }


  renderStockTable();

}


function renderStockTable() {

  let items =
    stockItems.slice();


  // Filtro por categoria
  if (filterCategory) {

    items =
      items.filter(function(item) {

        return String(item.categoria_id) ===
          String(filterCategory);

      });

  }


  // Filtro por status
  if (filterStatus) {

    items =
      items.filter(function(item) {

        const estoque =
          Number(item.estoque || 0);

        const minimo =
          Number(item.estoque_minimo || 0);


        if (filterStatus === "sem") {

          return estoque <= 0;

        }

        if (filterStatus === "baixo") {

          return estoque > 0 &&
            estoque <= minimo;

        }

        if (filterStatus === "normal") {

          return estoque > minimo;

        }

        return true;

      });

  }


  if (!items.length) {

    $("stockTable").innerHTML =
      '<div class="empty">' +
      'Nenhum item encontrado com os filtros aplicados.' +
      '</div>';

    return;

  }


  $("stockTable").innerHTML = `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>
              Produto
            </th>

            <th>
              Variação
            </th>

            <th>
              SKU
            </th>

            <th>
              Estoque
            </th>

            <th>
              Mínimo
            </th>

            <th>
              Situação
            </th>

          </tr>

        </thead>

        <tbody>

          ${items.map(function(item) {

            const estoque =
              Number(item.estoque || 0);

            const minimo =
              Number(item.estoque_minimo || 0);


            let situacaoLabel = "Normal";
            let situacaoClass = "badge-green";


            if (estoque <= 0) {

              situacaoLabel = "Sem estoque";
              situacaoClass = "badge-red";

            } else if (estoque <= minimo) {

              situacaoLabel = "Estoque baixo";
              situacaoClass = "badge-red";

            }


            return `

              <tr>

                <td>

                  <strong>

                    ${escapeHtml(
                      item.produto_nome
                    )}

                  </strong>

                  ${
                    item.produto_sku
                      ? `

                        <br>

                        <span class="muted">

                          ${escapeHtml(
                            item.produto_sku
                          )}

                        </span>

                      `
                      : ""
                  }

                </td>


                <td>

                  ${
                    item.variacao_nome
                      ? escapeHtml(
                          item.variacao_nome
                        )
                      : `

                        <span class="muted">

                          Sem variação

                        </span>

                      `
                  }

                </td>


                <td>

                  ${escapeHtml(
                    item.sku || "-"
                  )}

                </td>


                <td>

                  <strong>

                    ${estoque}

                  </strong>

                </td>


                <td>

                  ${minimo}

                </td>


                <td>

                  <span
                    class="badge ${situacaoClass}">

                    ${situacaoLabel}

                  </span>

                </td>

              </tr>

            `;

          }).join("")}

        </tbody>

      </table>

    </div>

  `;

}


function renderCategoryOptions() {

  const select =
    $("filterCategory");


  if (!select) {
    return;
  }


  const currentValue =
    select.value || "";


  select.innerHTML = `

    <option value="">
      Todas as categorias
    </option>

    ${categories.map(function(category) {

      return `

        <option value="${category.id}">
          ${escapeHtml(category.nome)}
        </option>

      `;

    }).join("")}

  `;


  select.value =
    currentValue;

}


function applyStockFilters() {

  filterCategory =
    $("filterCategory")
      ? $("filterCategory").value
      : "";


  filterStatus =
    $("filterStatus")
      ? $("filterStatus").value
      : "";


  renderStockTable();

}


/* ======================================================
   MODAL DE MOVIMENTAÇÃO
   ====================================================== */

function updateMovementFields() {

  const type =
    $("m_tipo").value;


  const entityContainer =
    $("movementEntityContainer");


  const supplierContainer =
    $("supplierContainer");


  const clientContainer =
    $("clientContainer");


  const supplierSelect =
    $("m_fornecedor");


  const clientSelect =
    $("m_cliente");


  const adjustmentContainer =
    $("adjustmentTypeContainer");


  if (adjustmentContainer) {

    adjustmentContainer.style.display =
      type === "Ajuste"
        ? "block"
        : "none";

  }


  if (supplierContainer) {

    supplierContainer.style.display =
      type === "Entrada"
        ? "block"
        : "none";

  }


  if (clientContainer) {

    clientContainer.style.display =
      type === "Saída"
        ? "block"
        : "none";

  }


  if (entityContainer) {

    entityContainer.style.display =
      type === "Ajuste"
        ? "none"
        : "block";

  }


  if (supplierSelect) {

    supplierSelect.required =
      type === "Entrada";


    if (type !== "Entrada") {

      supplierSelect.value = "";

    }

  }


  if (clientSelect) {

    clientSelect.required =
      type === "Saída";


    if (type !== "Saída") {

      clientSelect.value = "";

    }

  }

}


function openMovement() {

  if (!stockItems.length) {

    alert(
      "Não existem produtos para movimentar o estoque."
    );

    return;

  }


  openModal(

    "Movimentar estoque",

    `

      <form
        onsubmit="saveMovement(event)">


        <label>

          Produto / Variação *

        </label>


        <select
          id="m_item"
          required
          onchange="updateStockWarning()">

          <option value="">

            Selecione

          </option>


          ${stockItems.map(function(item) {

            const variationText =
              item.variacao_nome
                ? " — " +
                  item.variacao_nome
                : " — Sem variação";


            return `

              <option
                value="${item.type}:${item.id}">

                ${escapeHtml(
                  item.produto_nome
                )}

                ${escapeHtml(
                  variationText
                )}

                — Estoque:

                ${item.estoque}

              </option>

            `;

          }).join("")}


        </select>


        <div class="grid2">


          <div>

            <label>

              Tipo *

            </label>


            <select
              id="m_tipo"
              onchange="updateMovementFields(); updateStockWarning();">


              <option value="Entrada">

                Entrada

              </option>


              <option value="Saída">

                Saída

              </option>


              <option value="Ajuste">

                Ajuste

              </option>


            </select>

          </div>


          <div>

            <label>

              Quantidade *

            </label>


            <input
              id="m_qtd"
              type="number"
              min="1"
              step="1"
              required
              oninput="updateStockWarning()">

          </div>


        </div>


        <div
          id="stockWarning"
          style="display:none;">

        </div>


        <div
          id="adjustmentTypeContainer"
          style="display:none; margin-top:14px;">

          <label>

            Tipo de ajuste *

          </label>


          <div
            style="
              display:flex;
              gap:18px;
              align-items:center;
              flex-wrap:wrap;
              padding:10px 0;
            ">

            <label
              style="
                display:flex;
                align-items:center;
                gap:7px;
                margin:0;
                cursor:pointer;
              ">

              <input
                type="radio"
                name="m_ajuste_tipo"
                value="perda"
                checked>

              Perda / redução

            </label>


            <label
              style="
                display:flex;
                align-items:center;
                gap:7px;
                margin:0;
                cursor:pointer;
              ">

              <input
                type="radio"
                name="m_ajuste_tipo"
                value="acerto_positivo">

              Acerto positivo

            </label>

          </div>

        </div>


        <div
          id="movementEntityContainer">


          <div
            id="supplierContainer">


            <label>

              Fornecedor *

            </label>


            <div
              style="display:flex;gap:8px;align-items:flex-end;">


              <div style="flex:1;">

                <select
                  id="m_fornecedor">

                  <option value="">

                    Selecione o fornecedor

                  </option>


                  ${suppliers.map(function(supplier) {

                    const supplierName =
                      supplier.nome_fantasia ||
                      supplier.razao_social ||
                      "Fornecedor";


                    return `

                      <option
                        value="${supplier.id}">

                        ${escapeHtml(
                          supplierName
                        )}

                      </option>

                    `;

                  }).join("")}


                </select>

              </div>


              <button
                type="button"
                class="btn btn-secondary"
                onclick="openSupplierForm()">

                + Cadastrar fornecedor

              </button>


            </div>

          </div>


          <div
            id="clientContainer"
            style="display:none;">


            <label>

              Cliente *

            </label>


            <div
              style="display:flex;gap:8px;align-items:flex-end;">


              <div style="flex:1;">

                <select
                  id="m_cliente">

                  <option value="">

                    Selecione o cliente

                  </option>


                  ${clients.map(function(client) {

                    return `

                      <option
                        value="${client.id}">

                        ${escapeHtml(
                          client.nome
                        )}

                      </option>

                    `;

                  }).join("")}


                </select>

              </div>


              <button
                type="button"
                class="btn btn-secondary"
                onclick="openClientForm()">

                + Cadastrar cliente

              </button>


            </div>

          </div>


        </div>


        <label>

          Motivo

        </label>


        <input
          id="m_motivo"
          placeholder="Ex.: compra, venda, perda...">


        <label>

          Observação

        </label>


        <textarea
          id="m_obs"
          rows="3"></textarea>


        <button
          class="btn btn-primary full"
          type="submit">

          Registrar movimentação

        </button>


      </form>

    `

  );


  loadMovementEntities();

}


function updateStockWarning() {

  const warning =
    $("stockWarning");


  if (!warning) {
    return;
  }


  const type =
    $("m_tipo")
      ? $("m_tipo").value
      : "";


  const quantity =
    $("m_qtd")
      ? Number(
          $("m_qtd").value || 0
        )
      : 0;


  const itemValue =
    $("m_item")
      ? $("m_item").value
      : "";


  if (
    type !== "Saída" ||
    !quantity ||
    !itemValue
  ) {

    warning.style.display =
      "none";

    warning.innerHTML = "";

    return;

  }


  const parts =
    itemValue.split(":");


  const itemType =
    parts[0];


  const itemId =
    parts[1];


  const item =
    stockItems.find(function(x) {

      return x.type === itemType &&
        String(x.id) ===
        String(itemId);

    });


  if (!item) {

    warning.style.display =
      "none";

    warning.innerHTML = "";

    return;

  }


  const estoqueAtual =
    Number(
      item.estoque || 0
    );


  if (quantity > estoqueAtual) {

    const falta =
      quantity -
      estoqueAtual;


    warning.style.display =
      "block";


    warning.innerHTML = `

      <div
        style="
          margin:10px 0;
          padding:12px;
          border:1px solid #dc2626;
          border-radius:8px;
          background:#fef2f2;
          color:#991b1b;
        ">

        <strong>
          ⚠️ Estoque insuficiente
        </strong>

        <br>

        Estoque atual:
        <strong>${estoqueAtual}</strong>

        <br>

        Quantidade solicitada:
        <strong>${quantity}</strong>

        <br>

        Faltam:
        <strong>${falta}</strong>

      </div>

    `;

  } else {

    warning.style.display =
      "none";

    warning.innerHTML = "";

  }

}


async function loadMovementEntities() {

  try {

    await Promise.all([

      loadClients(),

      loadSuppliers()

    ]);


    const supplierSelect =
      $("m_fornecedor");


    const clientSelect =
      $("m_cliente");


    if (supplierSelect) {

      supplierSelect.innerHTML = `

        <option value="">

          Selecione o fornecedor

        </option>


        ${suppliers.map(function(supplier) {

          const supplierName =
            supplier.nome_fantasia ||
            supplier.razao_social ||
            "Fornecedor";


          return `

            <option
              value="${supplier.id}">

              ${escapeHtml(
                supplierName
              )}

            </option>

          `;

        }).join("")}

      `;

    }


    if (clientSelect) {

      clientSelect.innerHTML = `

        <option value="">

          Selecione o cliente

        </option>


        ${clients.map(function(client) {

          return `

            <option
              value="${client.id}">

              ${escapeHtml(
                client.nome
              )}

            </option>

          `;

        }).join("")}

      `;

    }


    updateMovementFields();


  } catch (error) {

    console.error(
      "Erro ao carregar clientes e fornecedores:",
      error
    );


    alert(
      "Erro ao carregar clientes e fornecedores:\n" +
      error.message
    );

  }

}


/* ======================================================
   CADASTRO DE FORNECEDOR
   ====================================================== */

function openSupplierForm() {

  openModal(

    "Cadastrar fornecedor",

    `

      <form
        onsubmit="saveSupplier(event)">


        <div class="grid2">


          <div>

            <label>

              Razão social *

            </label>


            <input
              id="s_razao_social"
              required>

          </div>


          <div>

            <label>

              Nome fantasia

            </label>


            <input
              id="s_nome_fantasia">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              CPF / CNPJ

            </label>


            <input
              id="s_cpf_cnpj">

          </div>


          <div>

            <label>

              Contato responsável

            </label>


            <input
              id="s_contato_responsavel">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              E-mail

            </label>


            <input
              id="s_email"
              type="email">

          </div>


          <div>

            <label>

              Telefone

            </label>


            <input
              id="s_telefone">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              WhatsApp

            </label>


            <input
              id="s_whatsapp">

          </div>


          <div>

            <label>

              CEP

            </label>


            <input
              id="s_cep">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Endereço

            </label>


            <input
              id="s_endereco">

          </div>


          <div>

            <label>

              Número

            </label>


            <input
              id="s_numero">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Complemento

            </label>


            <input
              id="s_complemento">

          </div>


          <div>

            <label>

              Bairro

            </label>


            <input
              id="s_bairro">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Cidade

            </label>


            <input
              id="s_cidade">

          </div>


          <div>

            <label>

              Estado

            </label>


            <input
              id="s_estado"
              maxlength="2">

          </div>


        </div>


        <label>

          Observações

        </label>


        <textarea
          id="s_observacoes"
          rows="3"></textarea>


        <button
          class="btn btn-primary full"
          type="submit">

          Cadastrar fornecedor

        </button>


      </form>

    `

  );

}


async function saveSupplier(ev) {

  ev.preventDefault();


  const razaoSocial =
    $("s_razao_social")
      .value
      .trim();


  const nomeFantasia =
    $("s_nome_fantasia")
      .value
      .trim();


  const cpfCnpj =
    $("s_cpf_cnpj")
      .value
      .trim();


  const contatoResponsavel =
    $("s_contato_responsavel")
      .value
      .trim();


  const email =
    $("s_email")
      .value
      .trim();


  const telefone =
    $("s_telefone")
      .value
      .trim();


  const whatsapp =
    $("s_whatsapp")
      .value
      .trim();


  const cep =
    $("s_cep")
      .value
      .trim();


  const endereco =
    $("s_endereco")
      .value
      .trim();


  const numero =
    $("s_numero")
      .value
      .trim();


  const complemento =
    $("s_complemento")
      .value
      .trim();


  const bairro =
    $("s_bairro")
      .value
      .trim();


  const cidade =
    $("s_cidade")
      .value
      .trim();


  const estado =
    $("s_estado")
      .value
      .trim()
      .toUpperCase();


  const observacoes =
    $("s_observacoes")
      .value
      .trim();


  if (!razaoSocial) {

    alert(
      "Informe a razão social."
    );

    return;

  }


  try {

    const result =
      await db
        .from(
          "gestao_loja_fornecedores"
        )
        .insert({

          id_loja:
            currentStore.id_loja,

          razao_social:
            razaoSocial,

          nome_fantasia:
            nomeFantasia || null,

          cpf_cnpj:
            cpfCnpj || null,

          email:
            email || null,

          telefone:
            telefone || null,

          whatsapp:
            whatsapp || null,

          contato_responsavel:
            contatoResponsavel || null,

          cep:
            cep || null,

          endereco:
            endereco || null,

          numero:
            numero || null,

          complemento:
            complemento || null,

          bairro:
            bairro || null,

          cidade:
            cidade || null,

          estado:
            estado || null,

          observacoes:
            observacoes || null,

          ativo:
            true

        })
        .select(`
          id,
          razao_social,
          nome_fantasia,
          ativo
        `)
        .single();


    if (result.error) {

      throw result.error;

    }


    const newSupplier =
      result.data;


    suppliers.push(
      newSupplier
    );


    suppliers.sort(function(a, b) {

      const nameA =
        a.nome_fantasia ||
        a.razao_social ||
        "";


      const nameB =
        b.nome_fantasia ||
        b.razao_social ||
        "";


      return nameA.localeCompare(
        nameB,
        "pt-BR"
      );

    });


    closeModal();


    openMovement();


    setTimeout(function() {

      const supplierSelect =
        $("m_fornecedor");


      if (supplierSelect) {

        supplierSelect.value =
          String(
            newSupplier.id
          );

      }

    }, 100);


  } catch (error) {

    console.error(
      "Erro ao cadastrar fornecedor:",
      error
    );


    alert(
      "Erro ao cadastrar fornecedor:\n" +
      error.message
    );

  }

}


/* ======================================================
   CADASTRO DE CLIENTE
   ====================================================== */

function openClientForm() {

  openModal(

    "Cadastrar cliente",

    `

      <form
        onsubmit="saveClient(event)">


        <div class="grid2">


          <div>

            <label>

              Tipo de cliente *

            </label>


            <select
              id="c_tipo_cliente">

              <option value="Pessoa Física">

                Pessoa Física

              </option>


              <option value="Pessoa Jurídica">

                Pessoa Jurídica

              </option>


            </select>

          </div>


          <div>

            <label>

              Nome *

            </label>


            <input
              id="c_nome"
              required>

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Razão social

            </label>


            <input
              id="c_razao_social">

          </div>


          <div>

            <label>

              Nome fantasia

            </label>


            <input
              id="c_nome_fantasia">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              CPF / CNPJ

            </label>


            <input
              id="c_cpf_cnpj">

          </div>


          <div>

            <label>

              E-mail

            </label>


            <input
              id="c_email"
              type="email">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Telefone

            </label>


            <input
              id="c_telefone">

          </div>


          <div>

            <label>

              WhatsApp

            </label>


            <input
              id="c_whatsapp">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              CEP

            </label>


            <input
              id="c_cep">

          </div>


          <div>

            <label>

              Endereço

            </label>


            <input
              id="c_endereco">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Número

            </label>


            <input
              id="c_numero">

          </div>


          <div>

            <label>

              Complemento

            </label>


            <input
              id="c_complemento">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Bairro

            </label>


            <input
              id="c_bairro">

          </div>


          <div>

            <label>

              Cidade

            </label>


            <input
              id="c_cidade">

          </div>


        </div>


        <div class="grid2">


          <div>

            <label>

              Estado

            </label>


            <input
              id="c_estado"
              maxlength="2">

          </div>

        </div>


        <label>

          Observações

        </label>


        <textarea
          id="c_observacoes"
          rows="3"></textarea>


        <button
          class="btn btn-primary full"
          type="submit">

          Cadastrar cliente

        </button>


      </form>

    `

  );

}


async function saveClient(ev) {

  ev.preventDefault();


  const tipoCliente =
    $("c_tipo_cliente")
      .value;


  const nome =
    $("c_nome")
      .value
      .trim();


  const razaoSocial =
    $("c_razao_social")
      .value
      .trim();


  const nomeFantasia =
    $("c_nome_fantasia")
      .value
      .trim();


  const cpfCnpj =
    $("c_cpf_cnpj")
      .value
      .trim();


  const email =
    $("c_email")
      .value
      .trim();


  const telefone =
    $("c_telefone")
      .value
      .trim();


  const whatsapp =
    $("c_whatsapp")
      .value
      .trim();


  const cep =
    $("c_cep")
      .value
      .trim();


  const endereco =
    $("c_endereco")
      .value
      .trim();


  const numero =
    $("c_numero")
      .value
      .trim();


  const complemento =
    $("c_complemento")
      .value
      .trim();


  const bairro =
    $("c_bairro")
      .value
      .trim();


  const cidade =
    $("c_cidade")
      .value
      .trim();


  const estado =
    $("c_estado")
      .value
      .trim()
      .toUpperCase();


  const observacoes =
    $("c_observacoes")
      .value
      .trim();


  if (!nome) {

    alert(
      "Informe o nome do cliente."
    );

    return;

  }


  try {

    const result =
      await db
        .from(
          "gestao_loja_clientes"
        )
        .insert({

          id_loja:
            currentStore.id_loja,

          tipo_cliente:
            tipoCliente,

          nome:
            nome,

          razao_social:
            razaoSocial || null,

          nome_fantasia:
            nomeFantasia || null,

          cpf_cnpj:
            cpfCnpj || null,

          email:
            email || null,

          telefone:
            telefone || null,

          whatsapp:
            whatsapp || null,

          cep:
            cep || null,

          endereco:
            endereco || null,

          numero:
            numero || null,

          complemento:
            complemento || null,

          bairro:
            bairro || null,

          cidade:
            cidade || null,

          estado:
            estado || null,

          observacoes:
            observacoes || null,

          ativo:
            true

        })
        .select(`
          id,
          nome,
          ativo
        `)
        .single();


    if (result.error) {

      throw result.error;

    }


    const newClient =
      result.data;


    clients.push(
      newClient
    );


    clients.sort(function(a, b) {

      return a.nome.localeCompare(
        b.nome,
        "pt-BR"
      );

    });


    closeModal();


    openMovement();


    setTimeout(function() {

      const clientSelect =
        $("m_cliente");


      if (clientSelect) {

        clientSelect.value =
          String(
            newClient.id
          );

      }

    }, 100);


  } catch (error) {

    console.error(
      "Erro ao cadastrar cliente:",
      error
    );


    alert(
      "Erro ao cadastrar cliente:\n" +
      error.message
    );

  }

}


/* ======================================================
   SALVAR MOVIMENTAÇÃO
   ====================================================== */

async function saveMovement(ev) {

  ev.preventDefault();


  const itemValue =
    $("m_item").value;


  const type =
    $("m_tipo").value;


  const ajusteTipoElement =
    document.querySelector(
      'input[name="m_ajuste_tipo"]:checked'
    );


  const ajusteTipo =
    ajusteTipoElement
      ? ajusteTipoElement.value
      : "perda";


  const quantity =
    Number(
      $("m_qtd").value
    );


  const motivo =
    $("m_motivo")
      .value
      .trim();


  const observacao =
    $("m_obs")
      .value
      .trim();


  const fornecedorId =
    $("m_fornecedor")
      ? $("m_fornecedor").value
      : "";


  const clienteId =
    $("m_cliente")
      ? $("m_cliente").value
      : "";


  if (!itemValue) {

    alert(
      "Selecione um produto ou variação."
    );

    return;

  }


  if (
    !quantity ||
    quantity <= 0
  ) {

    alert(
      "Informe uma quantidade válida."
    );

    return;

  }


  if (
    type === "Entrada" &&
    !fornecedorId
  ) {

    alert(
      "Selecione o fornecedor."
    );

    return;

  }


  if (
    type === "Saída" &&
    !clienteId
  ) {

    alert(
      "Selecione o cliente."
    );

    return;

  }


  const parts =
    itemValue.split(":");


  const itemType =
    parts[0];


  const itemId =
    parts[1];


  const item =
    stockItems.find(function(x) {

      return x.type === itemType &&
        String(x.id) ===
        String(itemId);

    });


  if (!item) {

    alert(
      "Produto ou variação não encontrado."
    );

    return;

  }


  if (type === "Saída") {

    const estoqueAtual =
      Number(
        item.estoque || 0
      );


    if (
      quantity >
      estoqueAtual
    ) {

      const falta =
        quantity -
        estoqueAtual;


      const continuar =
        confirm(

          "⚠️ ESTOQUE INSUFICIENTE\n\n" +

          "Produto: " +
          item.produto_nome +
          "\n" +

          (
            item.variacao_nome
              ? "Variação: " +
                item.variacao_nome +
                "\n"
              : ""
          ) +

          "Estoque atual: " +
          estoqueAtual +
          "\n" +

          "Quantidade solicitada: " +
          quantity +
          "\n" +

          "Quantidade faltante: " +
          falta +
          "\n\n" +

          "O estoque ficará negativo.\n\n" +

          "Deseja continuar mesmo assim?"

        );


      if (!continuar) {

        return;

      }

    }

  }


  try {


    if (
      itemType ===
      "variacao"
    ) {


      if (type === "Ajuste") {


        const estoqueAtual =
          Number(
            item.estoque || 0
          );


        const novoEstoque =
          ajusteTipo === "perda"
            ? estoqueAtual - quantity
            : estoqueAtual + quantity;


        const result =
          await db.rpc(
            "gestao_loja_ajustar_estoque",
            {

              p_variacao_id:
                itemId,

              p_novo_estoque:
                novoEstoque,

              p_motivo:
                motivo ||
                "Ajuste manual"

            }
          );


        if (result.error) {

          throw result.error;

        }


      } else {


        const result =
          await db.rpc(
            "gestao_loja_movimentar_estoque",
            {

              p_variacao_id:
                itemId,

              p_quantidade:
                quantity,

              p_entrada:
                type === "Entrada",

              p_tipo:
                type,

              p_fornecedor_id:
                type === "Entrada"
                  ? fornecedorId
                  : null,

              p_cliente_id:
                type === "Saída"
                  ? clienteId
                  : null,

              p_motivo:
                motivo || null,

              p_observacao:
                observacao || null

            }
          );


        if (result.error) {

          throw result.error;

        }

      }


    } else {


      let novoEstoque =
        Number(
          item.estoque || 0
        );


      if (
        type ===
        "Entrada"
      ) {

        novoEstoque +=
          quantity;

      } else if (
        type ===
        "Saída"
      ) {

        novoEstoque -=
          quantity;

      } else if (
        type ===
        "Ajuste"
      ) {

        if (ajusteTipo === "perda") {

          novoEstoque -=
            quantity;

        } else {

          novoEstoque +=
            quantity;

        }

      }


      if (
        novoEstoque < 0
      ) {

        const continuar =
          confirm(

            "⚠️ ESTOQUE INSUFICIENTE\n\n" +

            "O estoque ficará negativo.\n\n" +

            "Deseja continuar mesmo assim?"

          );


        if (!continuar) {

          return;

        }

      }


      const result =
        await db
          .from(
            "gestao_loja_produtos"
          )
          .update({

            estoque:
              novoEstoque

          })
          .eq(
            "id",
            itemId
          )
          .eq(
            "id_loja",
            currentStore.id_loja
          );


      if (result.error) {

        throw result.error;

      }

    }


    closeModal();


    await renderStock();


  } catch (error) {

    console.error(
      "Erro ao movimentar estoque:",
      error
    );


    alert(
      "Erro ao movimentar estoque:\n" +
      error.message
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
      "Acompanhe entradas, saídas e saldos";


    await loadClients();

    await loadSuppliers();

    await loadCategories();

    renderCategoryOptions();

    await renderStock();

  }

);
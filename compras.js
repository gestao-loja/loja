let suppliers = [];

let products = [];

let variations = [];

let insumos = [];

let insumoVariations = [];

let purchases = [];

let currentPurchaseItems = [];

let editingPurchaseId = null;

/*
 * =========================================================
 * NÚMERO DA COMPRA — sequencial POR LOJA
 * =========================================================
 */

/*
 * Retorna a próxima sequência de número de compra para a loja atual.
 * Conta quantas compras a loja já tem e soma 1.
 *
 * Como compras canceladas continuam na tabela (status = 'Cancelado'),
 * a contagem nunca "volta" e nunca colide.
 */
async function proximaSequenciaCompra() {

  const result = await db
    .from("gestao_loja_compras")
    .select("id", { count: "exact", head: true })
    .eq("id_loja", currentStore.id_loja);

  if (result.error) {
    throw result.error;
  }

  const total = result.count || 0;

  return total + 1;

}

function purchaseMoney(value) {
  return Number(value || 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL"
    }
  );
}

function purchaseNumber(value) {
  return Number(value || 0);
}

function getPurchaseNumberValue(id) {
  const element =
    document.getElementById(id);

  if (!element) {
    return 0;
  }

  return Number(
    String(
      element.value || ""
    ).replace(",", ".")
  ) || 0;
}

function getPurchaseToday() {
  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatPurchaseDate(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "pt-BR"
  );
}

function isPurchasePending(purchase) {
  return (
    purchase.status === "Pendente" ||
    purchase.status === "pendente"
  );
}

async function loadSuppliers() {
  const {
    data,
    error
  } = await db
    .from(
      "gestao_loja_fornecedores"
    )
    .select("*")
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .eq(
      "ativo",
      true
    )
    .order("nome_fantasia");

  if (error) {
    throw error;
  }

  suppliers =
    data || [];
}

async function loadPurchaseProducts() {
  const {
    data,
    error
  } = await db
    .from(
      "gestao_loja_produtos"
    )
    .select("*")
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .eq(
      "ativo",
      true
    )
    .order("nome");

  if (error) {
    throw error;
  }

  products =
    data || [];
}

async function loadPurchaseVariations() {
  const {
    data,
    error
  } = await db
    .from(
      "gestao_loja_produtos_variacoes"
    )
    .select("*")
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .eq(
      "ativo",
      true
    )
    .order("nome");

  if (error) {
    throw error;
  }

  variations =
    data || [];
}

async function loadPurchaseInsumos() {
  const {
    data,
    error
  } = await db
    .from(
      "gestao_loja_insumos"
    )
    .select("*")
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .eq(
      "ativo",
      true
    )
    .order("nome");

  if (error) {
    insumos = [];
    return;
  }

  insumos = data || [];
}

async function loadPurchaseInsumoVariations() {
  const {
    data,
    error
  } = await db
    .from(
      "gestao_loja_insumos_variacoes"
    )
    .select("*")
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .eq(
      "ativo",
      true
    )
    .order("nome");

  if (error) {
    insumoVariations = [];
    return;
  }

  insumoVariations = data || [];
}

async function loadPurchases() {
  const {
    data,
    error
  } = await db
    .from(
      "gestao_loja_compras"
    )
    .select(`
      *,
      gestao_loja_fornecedores (
        id,
        razao_social,
        nome_fantasia,
        telefone,
        whatsapp,
        email,
        cpf_cnpj
      )
    `)
    .eq(
      "id_loja",
      currentStore.id_loja
    )
    .order(
      "id",
      {
        ascending: false
      }
    );

  if (error) {
    throw error;
  }

  purchases =
    data || [];

  renderPurchases();
}

function renderPurchases() {
  const container =
    document.getElementById(
      "purchasesContainer"
    );

  if (!container) {
    return;
  }

  if (!purchases.length) {
    container.innerHTML = `
      <div class="card">
        <h3>
          Nenhuma compra cadastrada
        </h3>

        <p class="muted">
          Clique em "+ Nova compra"
          para cadastrar a primeira compra.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div
      class="card"
      style="
        padding:0;
        overflow:auto;
      "
    >
      <table class="table">
        <thead>
          <tr>
            <th>
              Nº
            </th>

            <th>
              Fornecedor
            </th>

            <th>
              Data
            </th>

            <th>
              Nota fiscal
            </th>

            <th>
              Status
            </th>

            <th>
              Valor
            </th>

            <th
              style="text-align:right;"
            >
              Ações
            </th>
          </tr>
        </thead>

        <tbody>
          ${
            purchases.map(
              purchase => {
                const supplier =
                  purchase.gestao_loja_fornecedores;

                const supplierName =
                  supplier?.nome_fantasia ||
                  supplier?.razao_social ||
                  "Fornecedor não informado";

                return `
                  <tr>
                    <td>
                      <strong>
                        ${purchase.numero}
                      </strong>
                    </td>

                    <td>
                      ${escapeHtml(
                        supplierName
                      )}
                    </td>

                    <td>
                      ${formatPurchaseDate(
                        purchase.data_compra
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        purchase.numero_nota_fiscal ||
                        "-"
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        purchase.status ||
                        "Pendente"
                      )}
                    </td>

                    <td>
                      <strong>
                        ${purchaseMoney(
                          purchase.valor_total
                        )}
                      </strong>
                    </td>

                    <td
                      style="text-align:right;"
                    >
                      <button
                        class="btn btn-secondary"
                        onclick="
                          viewPurchase(
                            ${purchase.id}
                          )
                        "
                      >
                        Visualizar
                      </button>
                    </td>
                  </tr>
                `;
              }
            ).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}

function buildSupplierOptions(
  selectedId = ""
) {
  return `
    <option value="">
      Selecione o fornecedor
    </option>

    ${
      suppliers.map(
        supplier => `
          <option
            value="${supplier.id}"
            ${
              String(
                supplier.id
              ) ===
              String(
                selectedId
              )
                ? "selected"
                : ""
            }
          >
            ${escapeHtml(
              supplier.nome_fantasia ||
              supplier.razao_social
            )}
          </option>
        `
      ).join("")
    }
  `;
}

function buildPurchaseProductOptions(
  selectedId = ""
) {
  return `
    <option value="">
      Selecione o produto
    </option>

    ${
      products.map(
        product => `
          <option
            value="${product.id}"
            ${
              String(
                product.id
              ) ===
              String(
                selectedId
              )
                ? "selected"
                : ""
            }
          >
            ${escapeHtml(
              product.nome
            )}
          </option>
        `
      ).join("")
    }
  `;
}

function buildPurchaseItemOptions(
  selectedValue = ""
) {
  const prodOptions = products.map(p => `
    <option value="prod_${p.id}" ${selectedValue === `prod_${p.id}` ? "selected" : ""}>
      ${escapeHtml(p.nome)}
    </option>
  `).join("");

  const insOptions = insumos.map(i => `
    <option value="ins_${i.id}" ${selectedValue === `ins_${i.id}` ? "selected" : ""}>
      ${escapeHtml(i.nome)}
    </option>
  `).join("");

  return `
    <option value="">Selecione o item</option>
    <optgroup label="Produtos">
      ${prodOptions}
    </optgroup>
    <optgroup label="Insumos">
      ${insOptions}
    </optgroup>
  `;
}

/* =========================================================
   CADASTRO DE FORNECEDOR (mesmo modelo do estoque.html)
   ========================================================= */
function openSupplierForm() {
  openModal(
    "Cadastrar fornecedor",
    `
      <form onsubmit="saveSupplier(event)">

        <div class="grid2">

          <div>
            <label>
              Razão social *
            </label>
            <input id="s_razao_social" required>
          </div>

          <div>
            <label>
              Nome fantasia
            </label>
            <input id="s_nome_fantasia">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>
              CPF / CNPJ
            </label>
            <input id="s_cpf_cnpj">
          </div>

          <div>
            <label>
              Contato responsável
            </label>
            <input id="s_contato_responsavel">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>
              E-mail
            </label>
            <input id="s_email" type="email">
          </div>

          <div>
            <label>
              Telefone
            </label>
            <input id="s_telefone">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>
              WhatsApp
            </label>
            <input id="s_whatsapp">
          </div>

          <div>
            <label>
              CEP
            </label>
            <input id="s_cep">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>
              Endereço
            </label>
            <input id="s_endereco">
          </div>

          <div>
            <label>
              Número
            </label>
            <input id="s_numero">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>
              Complemento
            </label>
            <input id="s_complemento">
          </div>

          <div>
            <label>
              Bairro
            </label>
            <input id="s_bairro">
          </div>

        </div>

        <div class="grid2">

          <div>
            <label>
              Cidade
            </label>
            <input id="s_cidade">
          </div>

          <div>
            <label>
              Estado
            </label>
            <input id="s_estado" maxlength="2">
          </div>

        </div>

        <label>
          Observações
        </label>

        <textarea id="s_observacoes" rows="3"></textarea>

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
    alert("Informe a razão social.");
    return;
  }

  try {
    const result =
      await db
        .from("gestao_loja_fornecedores")
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

    suppliers.push(newSupplier);

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

    if (document.getElementById("purchaseSupplier")) {
      const select = document.getElementById("purchaseSupplier");
      select.innerHTML = buildSupplierOptions(newSupplier.id);
    } else {
      openNewPurchase();
      setTimeout(function() {
        const select = document.getElementById("purchaseSupplier");
        if (select) {
          select.value = String(newSupplier.id);
        }
      }, 100);
    }

    alert("Fornecedor cadastrado com sucesso.");

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

function buildPurchaseForm() {
  return `
    <div
      style="
        display:grid;
        grid-template-columns:2fr 1fr;
        gap:15px;
      "
    >
      <div>
        <label>
          Fornecedor
        </label>

        <div
          style="display:flex;gap:8px;align-items:flex-end;"
        >
          <div style="flex:1;">
            <select id="purchaseSupplier">
              ${buildSupplierOptions()}
            </select>
          </div>

          <button
            type="button"
            class="btn btn-secondary"
            onclick="openSupplierForm()"
          >
            + Cadastrar fornecedor
          </button>
        </div>
      </div>

      <div>
        <label>
          Data da compra
        </label>

        <input
          type="date"
          id="purchaseDate"
        >
      </div>
    </div>

    <div
      style="
        display:grid;
        grid-template-columns:1fr 1fr 1fr;
        gap:15px;
        margin-top:15px;
      "
    >
      <div>
        <label>
          Número da nota fiscal
        </label>

        <input
          type="text"
          id="purchaseInvoice"
          placeholder="Número da NF"
        >
      </div>

      <div>
        <label>
          Forma de pagamento
        </label>

        <select
          id="purchasePayment"
          required
        >
          <option value="">Selecione...</option>
          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">Pix</option>
          <option value="Cartão de débito">Cartão de débito</option>
          <option value="Cartão de crédito">Cartão de crédito</option>
          <option value="Transferência bancária">Transferência bancária</option>
          <option value="Boleto">Boleto</option>
          <option value="A prazo">A prazo</option>
          <option value="Outro">Outro</option>
        </select>
      </div>

      <div>
        <label>
          Observações
        </label>

        <input
          type="text"
          id="purchaseNotes"
          placeholder="Observações da compra"
        >
      </div>
    </div>

    <div
      style="
        margin-top:25px;
      "
    >
      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          margin-bottom:15px;
        "
      >
        <div>
          <h3
            style="margin:0;"
          >
            Produtos e Insumos da compra
          </h3>

          <div class="muted">
            Adicione quantos itens quiser
            nesta mesma compra.
          </div>
        </div>

        <button
          type="button"
          class="btn btn-primary"
          onclick="addPurchaseItem()"
        >
          + Adicionar item
        </button>
      </div>

      <div
        id="purchaseItems"
      ></div>
    </div>

    <div
      style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:15px;
        margin-top:20px;
      "
    >
      <div>
        <label>
          Desconto
        </label>

        <input
          type="number"
          id="purchaseDiscount"
          value="0"
          min="0"
          step="0.01"
          oninput="updatePurchaseSummary()"
        >
      </div>

      <div>
        <label>
          Frete
        </label>

        <input
          type="number"
          id="purchaseFreight"
          value="0"
          min="0"
          step="0.01"
          oninput="updatePurchaseSummary()"
        >
      </div>
    </div>

    <div
      style="
        margin-top:20px;
        padding:20px;
        background:#f5f5f5;
        border-radius:8px;
      "
    >
      <div class="order-summary-row">
        <span>Subtotal</span>
        <strong id="purchaseSummarySubtotal">R$ 0,00</strong>
      </div>

      <div class="order-summary-row">
        <span>Frete</span>
        <strong id="purchaseSummaryFreight">R$ 0,00</strong>
      </div>

      <div class="order-summary-row">
        <span>Desconto</span>
        <strong id="purchaseSummaryDiscount">R$ 0,00</strong>
      </div>

      <hr>

      <div
        class="order-summary-row"
        style="font-size:20px;"
      >
        <strong>Total</strong>
        <strong id="purchaseSummaryTotal">R$ 0,00</strong>
      </div>
    </div>

    <div
      style="
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:25px;
      "
    >
      <button
        type="button"
        class="btn btn-secondary"
        onclick="closeModal()"
      >
        Cancelar
      </button>

      <button
        type="button"
        class="btn btn-primary"
        onclick="savePurchase()"
      >
        Salvar compra
      </button>
    </div>
  `;
}

function openNewPurchase() {
  editingPurchaseId =
    null;

  currentPurchaseItems =
    [];

  const modal =
    document.getElementById(
      "modal"
    );

  modal.classList.remove(
    "hidden"
  );

  document.querySelector(
    ".modal-card"
  ).style.maxWidth =
    "900px";

  document.getElementById(
    "modalTitle"
  ).textContent =
    "Nova compra";

  document.getElementById(
    "modalContent"
  ).innerHTML =
    buildPurchaseForm();

  document.getElementById(
    "purchaseDate"
  ).value =
    getPurchaseToday();

  addPurchaseItem();

  updatePurchaseSummary();
}

function addPurchaseItem() {
  currentPurchaseItems.push({
    item_type: "",
    item_id: "",
    produto_id: null,
    insumo_id: null,
    variacao_id: "",
    quantidade: 1,
    preco_unitario: 0,
    subtotal: 0
  });

  renderPurchaseItems();

  updatePurchaseSummary();
}

function removePurchaseItem(
  index
) {
  currentPurchaseItems.splice(
    index,
    1
  );

  renderPurchaseItems();

  updatePurchaseSummary();
}

function renderPurchaseItems() {
  const container =
    document.getElementById(
      "purchaseItems"
    );

  if (!container) {
    return;
  }

  if (
    !currentPurchaseItems.length
  ) {
    container.innerHTML = `
      <div
        style="
          padding:20px;
          text-align:center;
          border:1px dashed #ccc;
          border-radius:8px;
        "
      >
        <span class="muted">
          Nenhum item adicionado.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    currentPurchaseItems.map(
      (
        item,
        index
      ) => {
        let itemVariations = [];

        if (item.item_type === "prod" && item.produto_id) {
          itemVariations = variations.filter(
            variation => String(variation.produto_id) === String(item.produto_id)
          );
        } else if (item.item_type === "ins" && item.insumo_id) {
          itemVariations = insumoVariations.filter(
            variation => String(variation.insumo_id) === String(item.insumo_id)
          );
        }

        const subtotal =
          (
            Number(
              item.quantidade
            ) || 0
          ) *
          (
            Number(
              item.preco_unitario
            ) || 0
          );

        const selectedValue = item.item_type && item.item_id ? `${item.item_type}_${item.item_id}` : "";

        return `
          <div
            style="
              padding:15px;
              border:1px solid #ddd;
              border-radius:8px;
              margin-bottom:15px;
            "
          >
            <div
              style="
                display:grid;
                grid-template-columns:2fr 2fr 1fr 1.2fr auto;
                gap:10px;
                align-items:end;
              "
            >
              <div>
                <label>
                  Produto / Insumo
                </label>

                <select
                  onchange="
                    changePurchaseItem(
                      ${index},
                      this.value
                    )
                  "
                >
                  ${buildPurchaseItemOptions(
                    selectedValue
                  )}
                </select>
              </div>

              <div>
                <label>
                  Variação
                </label>

                <select
                  onchange="
                    changePurchaseVariation(
                      ${index},
                      this.value
                    )
                  "
                  ${
                    !itemVariations.length
                      ? "disabled"
                      : ""
                  }
                >
                  <option value="">
                    ${
                      itemVariations.length
                        ? "Selecione"
                        : "Sem variação"
                    }
                  </option>

                  ${
                    itemVariations.map(
                      variation => `
                        <option
                          value="${variation.id}"
                          ${
                            String(
                              variation.id
                            ) ===
                            String(
                              item.variacao_id
                            )
                              ? "selected"
                              : ""
                          }
                        >
                          ${escapeHtml(
                            variation.nome
                          )}
                        </option>
                      `
                    ).join("")
                  }
                </select>
              </div>

              <div>
                <label>
                  Quantidade
                </label>

                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value="${item.quantidade}"
                  onchange="
                    changePurchaseQuantity(
                      ${index},
                      this.value
                    )
                  "
                >
              </div>

              <div>
                <label>
                  Preço de custo
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value="${item.preco_unitario}"
                  onchange="
                    changePurchasePrice(
                      ${index},
                      this.value
                    )
                  "
                >
              </div>

              <button
                type="button"
                class="btn btn-danger"
                onclick="
                  removePurchaseItem(
                    ${index}
                  )
                "
              >
                ×
              </button>
            </div>

            <div
              style="
                display:flex;
                justify-content:flex-end;
                margin-top:10px;
              "
            >
              <strong>
                Subtotal:
                ${purchaseMoney(
                  subtotal
                )}
              </strong>
            </div>
          </div>
        `;
      }
    ).join("");
}

function changePurchaseItem(
  index,
  selectedValue
) {
  const item =
    currentPurchaseItems[
      index
    ];

  if (!item) {
    return;
  }

  const [type, id] = selectedValue.split("_");

  item.item_type = type || "";
  item.item_id = id || "";
  item.variacao_id = "";
  item.produto_id = null;
  item.insumo_id = null;

  if (type === "prod") {
    item.produto_id = id;
    const product = products.find(
      product => String(product.id) === String(id)
    );
    item.preco_unitario = product ? Number(product.preco_custo) || 0 : 0;
  } else if (type === "ins") {
    item.insumo_id = id;
    const insumo = insumos.find(
      insumo => String(insumo.id) === String(id)
    );
    item.preco_unitario = insumo ? Number(insumo.preco_custo) || 0 : 0;
  } else {
    item.preco_unitario = 0;
  }

  renderPurchaseItems();

  updatePurchaseSummary();
}

function changePurchaseVariation(
  index,
  variationId
) {
  const item =
    currentPurchaseItems[
      index
    ];

  if (!item) {
    return;
  }

  item.variacao_id =
    variationId || "";

  if (variationId) {
    if (item.item_type === "prod") {
      const variation = variations.find(
        variation => String(variation.id) === String(variationId)
      );
      if (variation) {
        item.preco_unitario = Number(variation.preco_custo) || 0;
      }
    } else if (item.item_type === "ins") {
      const variation = insumoVariations.find(
        variation => String(variation.id) === String(variationId)
      );
      if (variation) {
        item.preco_unitario = Number(variation.preco_custo) || 0;
      }
    }
  } else {
    if (item.item_type === "prod") {
      const product = products.find(
        product => String(product.id) === String(item.produto_id)
      );
      if (product) {
        item.preco_unitario = Number(product.preco_custo) || 0;
      }
    } else if (item.item_type === "ins") {
      const insumo = insumos.find(
        insumo => String(insumo.id) === String(item.insumo_id)
      );
      if (insumo) {
        item.preco_unitario = Number(insumo.preco_custo) || 0;
      }
    }
  }

  renderPurchaseItems();

  updatePurchaseSummary();
}
function changePurchaseQuantity(
  index,
  value
) {
  if (
    !currentPurchaseItems[
      index
    ]
  ) {
    return;
  }

  currentPurchaseItems[
    index
  ].quantidade =
    Number(value) || 0;

  renderPurchaseItems();

  updatePurchaseSummary();
}

function changePurchasePrice(
  index,
  value
  ) {
  if (
    !currentPurchaseItems[
      index
    ]
  ) {
    return;
  }

  currentPurchaseItems[
    index
  ].preco_unitario =
    Number(value) || 0;

  renderPurchaseItems();

  updatePurchaseSummary();
}

function updatePurchaseSummary() {
  let subtotal = 0;

  currentPurchaseItems.forEach(
    item => {
      subtotal +=
        (
          Number(
            item.quantidade
          ) || 0
        ) *
        (
          Number(
            item.preco_unitario
          ) || 0
        );
    }
  );

  const discount =
    getPurchaseNumberValue(
      "purchaseDiscount"
    );

  const freight =
    getPurchaseNumberValue(
      "purchaseFreight"
    );

  const total =
    subtotal +
    freight -
    discount;

  const values = {
    purchaseSummarySubtotal:
      subtotal,

    purchaseSummaryFreight:
      freight,

    purchaseSummaryDiscount:
      discount,

    purchaseSummaryTotal:
      Math.max(
        total,
        0
      )
  };

  Object.keys(
    values
  ).forEach(
    id => {
      const element =
        document.getElementById(
          id
        );

      if (element) {
        element.textContent =
          purchaseMoney(
            values[id]
          );
      }
    }
  );
}

async function savePurchase() {
  const supplierId =
    document.getElementById(
      "purchaseSupplier"
    ).value;

  if (!supplierId) {
    alert(
      "Selecione um fornecedor."
    );

    return;
  }

  if (
    !currentPurchaseItems.length
  ) {
    alert(
      "Adicione pelo menos um produto ou insumo à compra."
    );

    return;
  }

  for (
    const item of currentPurchaseItems
  ) {
    if (!item.item_id) {
      alert(
        "Selecione o produto/insumo de todos os itens."
      );

      return;
    }

    if (
      !item.quantidade ||
      item.quantidade <= 0
    ) {
      alert(
        "Informe uma quantidade válida para todos os itens."
      );

      return;
    }

    if (
      Number(
        item.preco_unitario
      ) < 0
    ) {
      alert(
        "O preço de custo não pode ser negativo."
      );

      return;
    }
  }

  const subtotal =
    currentPurchaseItems.reduce(
      (
        total,
        item
      ) => {
        return (
          total +
          (
            Number(
              item.quantidade
            ) || 0
          ) *
          (
            Number(
              item.preco_unitario
            ) || 0
          )
        );
      },
      0
    );

  const discount =
    getPurchaseNumberValue(
      "purchaseDiscount"
    );

  const freight =
    getPurchaseNumberValue(
      "purchaseFreight"
    );

  const total =
    Math.max(
      subtotal +
      freight -
      discount,
      0
    );

  try {

    // Calcula a sequência DENTRO da loja atual (começa em 1)
    const numeroCompra = await proximaSequenciaCompra();

    const purchaseData = {
      id_loja:
        currentStore.id_loja,

      // Número sequencial POR LOJA (não usa ID global)
      numero:
        numeroCompra,

      fornecedor_id:
        Number(
          supplierId
        ),

      data_compra:
        document.getElementById(
          "purchaseDate"
        ).value,

      status:
        "Pendente",

      subtotal:
        subtotal,

      desconto:
        discount,

      frete:
        freight,

      valor_total:
        total,

      numero_nota_fiscal:
        document.getElementById(
          "purchaseInvoice"
        ).value.trim(),

      observacoes:
        document.getElementById(
          "purchaseNotes"
        ).value.trim(),

      forma_pagamento:
        document.getElementById(
          "purchasePayment"
        ).value,
    };

    const {
      data: purchase,
      error
    } = await db
      .from(
        "gestao_loja_compras"
      )
      .insert(
        purchaseData
      )
      .select()
      .single();

    if (error) {
      alert(
        "Erro ao salvar compra:\n" +
        error.message
      );

      return;
    }

    const itemsData =
      currentPurchaseItems.map(
        item => ({
          id_loja:
            currentStore.id_loja,

          compra_id:
            purchase.id,

          produto_id:
            item.item_type === "prod" ? Number(item.produto_id) : null,

          insumo_id:
            item.item_type === "ins" ? Number(item.insumo_id) : null,

          variacao_id:
            item.variacao_id
              ? Number(
                  item.variacao_id
                )
              : null,

          quantidade:
            Number(
              item.quantidade
            ),

          preco_unitario:
            Number(
              item.preco_unitario
            ),

          subtotal:
            Number(
              item.quantidade
            ) *
            Number(
              item.preco_unitario
            )
        })
      );

    const {
      error: itemsError
    } = await db
      .from(
        "gestao_loja_compras_itens"
      )
      .insert(
        itemsData
      );

    if (itemsError) {
      await db
        .from(
          "gestao_loja_compras"
        )
        .delete()
        .eq(
          "id",
          purchase.id
        );

      alert(
        "Erro ao salvar os itens da compra:\n" +
        itemsError.message
      );

      return;
    }

    closeModal();

    await loadPurchases();

    alert(
      "Compra salva com sucesso."
    );

  } catch (error) {

    console.error(
      "Erro ao salvar compra:",
      error
    );

    alert(
      "Erro ao salvar compra:\n" +
      (error.message || "Erro desconhecido.")
    );

  }
}

async function viewPurchase(
  purchaseId
) {
  const {
    data: purchase,
    error: purchaseError
  } = await db
    .from(
      "gestao_loja_compras"
    )
    .select(`
      *,
      gestao_loja_fornecedores (
        id,
        razao_social,
        nome_fantasia,
        telefone,
        whatsapp,
        email,
        cpf_cnpj
      )
    `)
    .eq(
      "id",
      purchaseId
    )
    .single();

  if (purchaseError) {
    alert(
      "Erro ao carregar compra:\n" +
      purchaseError.message
    );

    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from(
      "gestao_loja_compras_itens"
    )
    .select(`
      *,
      gestao_loja_produtos (
        id,
        nome,
        sku
      ),
      gestao_loja_produtos_variacoes (
        id,
        nome,
        sku
      )
    `)
    .eq(
      "compra_id",
      purchaseId
    )
    .order("id");

  if (itemsError) {
    alert(
      "Erro ao carregar itens:\n" +
      itemsError.message
    );

    return;
  }

  // Busca os insumos para cruzar os nomes
  const itemInsumoIds = items.filter(i => i.insumo_id).map(i => i.insumo_id);
  let insumosMap = {};
  if (itemInsumoIds.length > 0) {
    const { data: insumosDb } = await db
      .from("gestao_loja_insumos")
      .select("id, nome")
      .in("id", itemInsumoIds);
      
    if (insumosDb) {
      insumosDb.forEach(i => { insumosMap[i.id] = i.nome; });
    }
  }

  const supplier =
    purchase.gestao_loja_fornecedores;

  document.getElementById(
    "modal"
  ).classList.remove(
    "hidden"
  );

  document.querySelector(
    ".modal-card"
  ).style.maxWidth =
    "1100px";

  document.getElementById(
    "modalTitle"
  ).textContent =
    `Compra #${purchase.numero}`;

  const itemsHtml =
    (items || []).map(
      item => {
        let nomeExibicao = "-";
        let variacaoNome = "";

        if (item.produto_id && item.gestao_loja_produtos) {
          nomeExibicao = item.gestao_loja_produtos.nome;
          if (item.gestao_loja_produtos_variacoes) {
            variacaoNome = item.gestao_loja_produtos_variacoes.nome;
          }
        } else if (item.insumo_id) {
          nomeExibicao = insumosMap[item.insumo_id] || "Insumo não encontrado";
        }

        return `
          <tr>
            <td>
              ${escapeHtml(
                nomeExibicao
              )}

              ${
                variacaoNome
                  ?
                    `
                      <br>

                      <small class="muted">
                        ${escapeHtml(
                          variacaoNome
                        )}
                      </small>
                    `
                  : ""
              }
            </td>

            <td>
              ${purchaseNumber(
                item.quantidade
              )}
            </td>

            <td>
              ${purchaseMoney(
                item.preco_unitario
              )}
            </td>

            <td>
              ${purchaseMoney(
                item.subtotal
              )}
            </td>
          </tr>
        `;
      }
    ).join("");

  document.getElementById(
    "modalContent"
  ).innerHTML = `
    <div
      style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:20px;
      "
    >
      <div class="card">
        <h3>
          Dados da compra
        </h3>

        <p>
          <strong>
            Número:
          </strong>

          #${purchase.numero}
        </p>

        <p>
          <strong>
            Data:
          </strong>

          ${formatPurchaseDate(
            purchase.data_compra
          )}
        </p>

        <p>
          <strong>
            Status:
          </strong>

          ${escapeHtml(
            purchase.status ||
            "Pendente"
          )}
        </p>

        <p>
          <strong>
            Nota fiscal:
          </strong>

          ${escapeHtml(
            purchase.numero_nota_fiscal ||
            "-"
          )}
        </p>
      </div>

      <div class="card">
        <h3>
          Fornecedor
        </h3>

        <p>
          <strong>
            ${escapeHtml(
              supplier?.nome_fantasia ||
              supplier?.razao_social ||
              "Fornecedor não informado"
            )}
          </strong>
        </p>

        <p>
          ${escapeHtml(
            supplier?.cpf_cnpj ||
            ""
          )}
        </p>

        <p>
          ${escapeHtml(
            supplier?.telefone ||
            supplier?.whatsapp ||
            ""
          )}
        </p>

        <p>
          ${escapeHtml(
            supplier?.email ||
            ""
          )}
        </p>
      </div>
    </div>

    <div
      class="card"
      style="
        margin-top:20px;
        overflow:auto;
      "
    >
      <h3>
        Itens
      </h3>

      <table
        class="table"
        style="
          margin-top:15px;
        "
      >
        <thead>
          <tr>
            <th>
              Produto / Insumo
            </th>

            <th>
              Quantidade
            </th>

            <th>
              Preço de custo
            </th>

            <th>
              Subtotal
            </th>
          </tr>
        </thead>

        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <div
      class="card"
      style="
        margin-top:20px;
        max-width:500px;
        margin-left:auto;
      "
    >
      <div class="order-summary-row">
        <span>Subtotal</span>
        <strong>
          ${purchaseMoney(
            purchase.subtotal
          )}
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Frete</span>
        <strong>
          ${purchaseMoney(
            purchase.frete
          )}
        </strong>
      </div>

      <div class="order-summary-row">
        <span>Desconto</span>
        <strong>
          ${purchaseMoney(
            purchase.desconto
          )}
        </strong>
      </div>

      <hr>

      <div
        class="order-summary-row"
        style="font-size:20px;"
      >
        <strong>Total</strong>
        <strong>
          ${purchaseMoney(
            purchase.valor_total
          )}
        </strong>
      </div>
    </div>

    ${
      purchase.observacoes
        ? `
          <div
            class="card"
            style="margin-top:20px;"
          >
            <h3>
              Observações
            </h3>

            <div
              style="
                margin-top:8px;
                white-space:pre-wrap;
              "
            >
              ${escapeHtml(
                purchase.observacoes
              )}
            </div>
          </div>
        `
        : ""
    }

    <div
      style="
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:30px;
        flex-wrap:wrap;
      "
    >
      ${
        isPurchasePending(
          purchase
        )
          ? `
            <button
              class="btn btn-secondary"
              onclick="
                editPurchase(
                  ${purchase.id}
                )
              "
            >
              Editar
            </button>

            <button
              class="btn btn-primary"
              onclick="
                closeModal();
                finalizePurchase(
                  ${purchase.id}
                )
              "
            >
              Finalizar compra
            </button>

            <button
              class="btn btn-danger"
              onclick="
                closeModal();
                cancelPurchase(
                  ${purchase.id}
                )
              "
            >
              Cancelar compra
            </button>
          `
          : ""
      }

      <button
        class="btn btn-secondary"
        onclick="closeModal()"
      >
        Fechar
      </button>
    </div>
  `;
}

async function editPurchase(
  purchaseId
) {
  const {
    data: purchase,
    error: purchaseError
  } = await db
    .from(
      "gestao_loja_compras"
    )
    .select("*")
    .eq(
      "id",
      purchaseId
    )
    .single();

  if (purchaseError) {
    alert(
      "Erro ao carregar compra:\n" +
      purchaseError.message
    );

    return;
  }

  if (
    !isPurchasePending(
      purchase
    )
  ) {
    alert(
      "Somente compras pendentes podem ser editadas."
    );

    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from(
      "gestao_loja_compras_itens"
    )
    .select("*")
    .eq(
      "compra_id",
      purchaseId
    )
    .order("id");

  if (itemsError) {
    alert(
      "Erro ao carregar itens:\n" +
      itemsError.message
    );

    return;
  }

  editingPurchaseId =
    purchaseId;

  currentPurchaseItems =
    (items || []).map(
      item => {
        const isProd = !!item.produto_id;
        const item_type = isProd ? "prod" : "ins";
        const item_id = isProd ? item.produto_id : item.insumo_id;

        return {
          item_type,
          item_id,
          produto_id: item.produto_id,
          insumo_id: item.insumo_id,
          variacao_id:
            item.variacao_id ||
            "",

          quantidade:
            Number(
              item.quantidade
            ),

          preco_unitario:
            Number(
              item.preco_unitario
            ),

          subtotal:
            Number(
              item.subtotal
            )
        };
      }
    );

  document.getElementById(
    "modal"
  ).classList.remove(
    "hidden"
  );

  document.querySelector(
    ".modal-card"
  ).style.maxWidth =
    "900px";

  document.getElementById(
    "modalTitle"
  ).textContent =
    `Editar compra #${purchase.numero}`;

  document.getElementById(
    "modalContent"
  ).innerHTML =
    buildPurchaseForm();

  document.getElementById(
    "purchaseSupplier"
  ).value =
    purchase.fornecedor_id ||
    "";

  document.getElementById(
    "purchaseDate"
  ).value =
    purchase.data_compra ||
    "";

  document.getElementById(
    "purchaseInvoice"
  ).value =
    purchase.numero_nota_fiscal ||
    "";

  document.getElementById(
    "purchaseNotes"
  ).value =
    purchase.observacoes ||
    "";

  document.getElementById(
    "purchasePayment"
  ).value =
    purchase.forma_pagamento || "";

  document.getElementById(
    "purchaseDiscount"
  ).value =
    Number(
      purchase.desconto || 0
    );

  document.getElementById(
    "purchaseFreight"
  ).value =
    Number(
      purchase.frete || 0
    );

  renderPurchaseItems();

  updatePurchaseSummary();
}

async function updatePurchase(
  purchaseId
) {
  const supplierId =
    document.getElementById(
      "purchaseSupplier"
    ).value;

  if (!supplierId) {
    alert(
      "Selecione um fornecedor."
    );

    return;
  }

  if (
    !currentPurchaseItems.length
  ) {
    alert(
      "Adicione pelo menos um item."
    );

    return;
  }

  for (
    const item of currentPurchaseItems
  ) {
    if (!item.item_id) {
      alert(
        "Selecione o produto/insumo de todos os itens."
      );

      return;
    }

    if (
      !item.quantidade ||
      item.quantidade <= 0
    ) {
      alert(
        "Informe uma quantidade válida."
      );

      return;
    }
  }

  const subtotal =
    currentPurchaseItems.reduce(
      (
        total,
        item
      ) => {
        return (
          total +
          Number(
            item.quantidade
          ) *
          Number(
            item.preco_unitario
          )
        );
      },
      0
    );

  const discount =
    getPurchaseNumberValue(
      "purchaseDiscount"
    );

  const freight =
    getPurchaseNumberValue(
      "purchaseFreight"
    );

  const total =
    Math.max(
      subtotal +
      freight -
      discount,
      0
    );

  const purchaseData = {
    fornecedor_id:
      Number(
        supplierId
      ),

    data_compra:
      document.getElementById(
        "purchaseDate"
      ).value,

    subtotal:
      subtotal,

    desconto:
      discount,

    frete:
      freight,

    valor_total:
      total,

    numero_nota_fiscal:
      document.getElementById(
        "purchaseInvoice"
      ).value.trim(),

    observacoes:
      document.getElementById(
        "purchaseNotes"
      ).value.trim(),

    forma_pagamento:
      document.getElementById(
        "purchasePayment"
      ).value
  };

  const {
    error
  } = await db
    .from(
      "gestao_loja_compras"
    )
    .update(
      purchaseData
    )
    .eq(
      "id",
      purchaseId
    );

  if (error) {
    alert(
      "Erro ao atualizar compra:\n" +
      error.message
    );

    return;
  }

  const {
    error: deleteError
  } = await db
    .from(
      "gestao_loja_compras_itens"
    )
    .delete()
    .eq(
      "compra_id",
      purchaseId
    );

  if (deleteError) {
    alert(
      "Erro ao atualizar os itens:\n" +
      deleteError.message
    );

    return;
  }

  const itemsData =
    currentPurchaseItems.map(
      item => ({
        id_loja:
          currentStore.id_loja,

        compra_id:
          purchaseId,

        produto_id:
          item.item_type === "prod" ? Number(item.produto_id) : null,

        insumo_id:
          item.item_type === "ins" ? Number(item.insumo_id) : null,

        variacao_id:
          item.variacao_id
            ? Number(
                item.variacao_id
              )
            : null,

        quantidade:
          Number(
            item.quantidade
          ),

        preco_unitario:
          Number(
            item.preco_unitario
          ),

        subtotal:
          Number(
            item.quantidade
          ) *
          Number(
            item.preco_unitario
          )
      })
    );

  const {
    error: insertError
  } = await db
    .from(
      "gestao_loja_compras_itens"
    )
    .insert(
      itemsData
    );

  if (insertError) {
    alert(
      "Erro ao salvar os novos itens:\n" +
      insertError.message
    );

    return;
  }

  closeModal();

  await loadPurchases();

  alert(
    "Compra atualizada com sucesso."
  );
}

async function finalizePurchase(
  purchaseId
) {
  const purchase =
    purchases.find(
      item =>
        Number(
          item.id
        ) ===
        Number(
          purchaseId
        )
    );

  if (!purchase) {
    return;
  }

  if (
    !isPurchasePending(
      purchase
    )
  ) {
    alert(
      "Esta compra não está pendente."
    );

    return;
  }

  const confirmed =
    confirm(
      `Deseja finalizar a compra #${purchase.numero}?\n\n` +
      `Valor: ${
        purchaseMoney(
          purchase.valor_total
        )
      }\n\n` +
      `Todos os itens desta compra serão adicionados ao estoque.`
    );

  if (!confirmed) {
    return;
  }

  const {
    error
  } = await db.rpc(
    "gestao_loja_finalizar_compra",
    {
      p_compra_id:
        purchaseId
    }
  );

  if (error) {
    alert(
      "Erro ao finalizar compra:\n" +
      error.message
    );

    return;
  }

  await loadPurchases();

  alert(
    "Compra finalizada com sucesso. Os itens foram adicionados ao estoque."
  );
}

async function cancelPurchase(
  purchaseId
) {
  const purchase =
    purchases.find(
      item =>
        Number(
          item.id
        ) ===
        Number(
          purchaseId
        )
    );

  if (!purchase) {
    return;
  }

  if (
    !isPurchasePending(
      purchase
    )
  ) {
    alert(
      "Somente compras pendentes podem ser canceladas."
    );

    return;
  }

  const confirmed =
    confirm(
      `Deseja cancelar a compra #${purchase.numero}?`
    );

  if (!confirmed) {
    return;
  }

  const {
    error
  } = await db
    .from(
      "gestao_loja_compras"
    )
    .update({
      status:
        "Cancelado"
    })
    .eq(
      "id",
      purchaseId
    );

  if (error) {
    alert(
      "Erro ao cancelar compra:\n" +
      error.message
    );

    return;
  }

  await loadPurchases();

  alert(
    "Compra cancelada."
  );
}

document.addEventListener(
  "DOMContentLoaded",
  async function() {
    try {
      const authenticated =
        await requireAuth();

      if (!authenticated) {
        return;
      }

      if (!currentUser) {
        return;
      }

      const contextLoaded =
        await loadUserContext();

      if (!contextLoaded) {
        return;
      }

      const subtitle =
        document.getElementById(
          "pageSubtitle"
        );

      if (subtitle) {
        subtitle.textContent =
          "Gerencie as compras da loja";
      }

      await Promise.all([
        loadSuppliers(),
        loadPurchaseProducts(),
        loadPurchaseVariations(),
        loadPurchaseInsumos(),
        loadPurchaseInsumoVariations()
      ]);

      await loadPurchases();

    } catch (error) {
      console.error(
        "Erro na página de compras:",
        error
      );

      const container =
        document.getElementById(
          "purchasesContainer"
        );

      if (container) {
        container.innerHTML = `
          <div class="card">
            <h3>
              Erro ao carregar a página
            </h3>

            <p>
              ${escapeHtml(
                error.message ||
                "Erro desconhecido."
              )}
            </p>
          </div>
        `;
      }
    }
  }
);
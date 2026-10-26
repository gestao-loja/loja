let clients = [];
let products = [];
let variations = [];
let quotes = [];
let currentQuoteItems = [];
let editingQuoteId = null;


/* ======================================================
   NÚMERO DO ORÇAMENTO — sequencial POR LOJA
   ====================================================== */

/*
 * Retorna a próxima sequência de número para a loja atual.
 *
 * IMPORTANTE: orçamentos e pedidos compartilham a mesma
 * tabela (gestao_loja_pedidos) e a mesma numeração por loja.
 * Isso evita colisão quando um orçamento é aprovado e vira
 * pedido (o número é preservado).
 */
async function proximaSequenciaOrcamento() {
  const result = await db
    .from("gestao_loja_pedidos")
    .select("numero")
    .eq("id_loja", currentStore.id_loja)
    .order("numero", { ascending: false })
    .limit(1);

  if (result.error) {
    throw result.error;
  }

  if (!result.data || result.data.length === 0) {
    return 1;
  }

  const ultimoNumero = Number(result.data[0].numero) || 0;
  return ultimoNumero + 1;
}


/* ======================================================
   HELPERS
   ====================================================== */

function quoteMoney(value) {

  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

}

function quoteNumber(value) {

  return Number(value || 0);

}

function getQuoteNumberValue(id) {

  const element = document.getElementById(id);

  if (!element) {
    return 0;
  }

  return Number(
    String(element.value || "").replace(",", ".")
  ) || 0;

}

function getQuoteToday() {

  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;

}

function formatQuoteDate(value) {

  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR");

}

function isQuoteStatus(status) {

  return String(status || "")
    .trim()
    .toLowerCase() === "orçamento";

}

function quoteStatusClass(status) {

  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (normalized === "orçamento") {
    return "status-orcamento";
  }

  if (normalized === "pendente") {
    return "status-pendente";
  }

  if (normalized === "confirmado") {
    return "status-confirmado";
  }

  if (normalized === "cancelado") {
    return "status-cancelado";
  }

  return "";

}

function isPessoaJuridica(tipo) {

  const t = String(tipo || "").toLowerCase();

  return (
    t.includes("jurid") ||
    t.includes("jurídica") ||
    t.includes("juridica")
  );

}

function getIndicadorIeLabel(value) {

  const labels = {
    "1": "1 - Contribuinte ICMS",
    "2": "2 - Contribuinte isento",
    "9": "9 - Não contribuinte"
  };

  return labels[String(value)] || "9 - Não contribuinte";

}


/* ======================================================
   HELPERS DE TIPO DE ENTREGA
   ====================================================== */

function isRetiradaQuote(quote) {

  if (!quote) {
    return false;
  }

  if (String(quote.tipo_entrega || "").toLowerCase() === "retirada") {
    return true;
  }

  return (
    String(quote.endereco_entrega || "")
      .trim()
      .toLowerCase() === "retirada na loja"
  );

}

function getTipoEntregaQuoteFromForm() {

  const selected = document.querySelector(
    'input[name="tipo_entrega_quote"]:checked'
  );

  return selected ? selected.value : "entrega";

}


/* ======================================================
   CARREGAMENTOS
   ====================================================== */

async function loadQuoteClients() {

  const { data, error } = await db
    .from("gestao_loja_clientes")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw error;
  }

  clients = data || [];

}

async function loadQuoteProducts() {

  const { data, error } = await db
    .from("gestao_loja_produtos")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw error;
  }

  products = data || [];

}

async function loadQuoteVariations() {

  const { data, error } = await db
    .from("gestao_loja_produtos_variacoes")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw error;
  }

  variations = data || [];

}

async function loadQuotes() {

  const { data, error } = await db
    .from("gestao_loja_pedidos")
    .select(`
      *,
      gestao_loja_clientes (
        id,
        nome,
        telefone,
        whatsapp,
        email,
        cpf_cnpj,
        tipo_cliente,
        inscricao_estadual,
        indicador_ie
      )
    `)
    .eq("id_loja", currentStore.id_loja)
    .eq("status", "Orçamento")
    .order("id", { ascending: false });

  if (error) {
    throw error;
  }

  quotes = data || [];

  renderQuotes();

}


/* ======================================================
   LISTAGEM
   ====================================================== */

function renderQuotes() {

  const container =
    document.getElementById("quotesContainer");

  if (!container) {
    return;
  }

  if (!quotes.length) {

    container.innerHTML = `
      <div class="card">

        <h3>
          Nenhum orçamento cadastrado
        </h3>

        <p class="muted">
          Clique em "+ Novo orçamento"
          para cadastrar o primeiro orçamento.
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
            <th>Nº</th>
            <th>Cliente</th>
            <th>Data</th>
            <th>Status</th>
            <th>Valor</th>
            <th style="text-align:right;">
              Ações
            </th>
          </tr>

        </thead>

        <tbody>

          ${quotes.map(quote => {

            const client =
              quote.gestao_loja_clientes;

            const clientName =
              client?.nome ||
              "Cliente não informado";

            const status =
              quote.status ||
              "Orçamento";

            return `
              <tr>

                <td>
                  <strong>
                    #${quote.numero}
                  </strong>
                </td>

                <td>
                  ${escapeHtml(clientName)}
                </td>

                <td>
                  ${formatQuoteDate(
                    quote.data_pedido
                  )}
                </td>

                <td>

                  <span
                    class="status ${quoteStatusClass(status)}"
                  >
                    ${escapeHtml(status)}
                  </span>

                </td>

                <td>

                  <strong>
                    ${quoteMoney(
                      quote.valor_total
                    )}
                  </strong>

                </td>

                <td style="text-align:right;">

                  <button
                    class="btn btn-secondary"
                    onclick="viewQuote(${quote.id})"
                  >
                    Visualizar
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
   OPÇÕES
   ====================================================== */

function buildQuoteClientOptions(
  selectedId = ""
) {

  return `
    <option value="">
      Selecione o cliente
    </option>

    ${clients.map(client => `

      <option
        value="${client.id}"
        ${
          String(client.id) ===
          String(selectedId)
            ? "selected"
            : ""
        }
      >
        ${escapeHtml(client.nome)}
      </option>

    `).join("")}
  `;

}

function buildQuoteProductOptions(
  selectedId = ""
) {

  return `
    <option value="">
      Selecione o produto
    </option>

    ${products.map(product => `

      <option
        value="${product.id}"
        ${
          String(product.id) ===
          String(selectedId)
            ? "selected"
            : ""
        }
      >
        ${escapeHtml(product.nome)}
      </option>

    `).join("")}
  `;

}


/* ======================================================
   CADASTRO DE CLIENTE (COM DADOS FISCAIS PJ)
   ====================================================== */

function openClientForm() {

  openModal(
    "Cadastrar cliente",
    clientFormFromQuote()
  );

  toggleClientTypeFieldsQuote();

}

function clientFormFromQuote() {

  return `
    <div class="form-grid">

      <!-- ============ IDENTIFICAÇÃO ============ -->

      <div class="form-section-title">
        Identificação
      </div>

      <div class="form-group">

        <label>
          Tipo de cliente *
        </label>

        <select
          id="c_tipo_cliente"
          onchange="toggleClientTypeFieldsQuote()"
        >
          <option value="Pessoa Física">Pessoa Física</option>
          <option value="Pessoa Jurídica">Pessoa Jurídica</option>
        </select>

      </div>

      <div class="form-group">

        <label>
          Status
        </label>

        <select id="c_ativo">
          <option value="true" selected>Ativo</option>
          <option value="false">Inativo</option>
        </select>

      </div>

      <div class="form-group full">

        <label>
          Nome / Razão social *
        </label>

        <input
          type="text"
          id="c_nome"
          placeholder="Nome completo ou razão social"
        >

      </div>

      <div
        class="form-group full pj-field hidden-field"
      >
        <label>
          Nome fantasia
        </label>

        <input
          type="text"
          id="c_nome_fantasia"
          placeholder="Nome fantasia da empresa"
        >

      </div>

      <div class="form-group">

        <label>
          CPF / CNPJ
        </label>

        <input
          type="text"
          id="c_cpf_cnpj"
          placeholder="Somente números"
        >

      </div>

      <div
        class="form-group pj-field hidden-field"
      >
        <label>
          Inscrição Estadual
        </label>

        <input
          type="text"
          id="c_inscricao_estadual"
          placeholder="IE ou ISENTO"
        >

        <small class="form-hint">
          Use ISENTO se não contribuinte
        </small>

      </div>

      <div
        class="form-group pj-field hidden-field"
      >
        <label>
          Indicador de IE
        </label>

        <select id="c_indicador_ie">
          <option value="1">1 - Contribuinte ICMS</option>
          <option value="2">2 - Contribuinte isento</option>
          <option value="9" selected>9 - Não contribuinte</option>
        </select>

      </div>

      <div
        class="form-group pj-field hidden-field"
      >
        <label>
          Inscrição Municipal
        </label>

        <input
          type="text"
          id="c_inscricao_municipal"
          placeholder="Opcional"
        >

      </div>

      <!-- ============ CONTATO ============ -->

      <div class="form-section-title">
        Contato
      </div>

      <div class="form-group">

        <label>
          E-mail
        </label>

        <input
          type="email"
          id="c_email"
          placeholder="cliente@email.com"
        >

      </div>

      <div class="form-group">

        <label>
          Telefone
        </label>

        <input
          type="text"
          id="c_telefone"
          placeholder="Telefone"
        >

      </div>

      <div class="form-group">

        <label>
          WhatsApp
        </label>

        <input
          type="text"
          id="c_whatsapp"
          placeholder="WhatsApp"
        >

      </div>

      <!-- ============ ENDEREÇO ============ -->

      <div class="form-section-title">
        Endereço
      </div>

      <div class="form-group">

        <label>
          CEP
        </label>

        <input
          type="text"
          id="c_cep"
          placeholder="00000-000"
        >

      </div>

      <div class="form-group">

        <label>
          Endereço
        </label>

        <input
          type="text"
          id="c_endereco"
          placeholder="Rua, avenida..."
        >

      </div>

      <div class="form-group">

        <label>
          Número
        </label>

        <input
          type="text"
          id="c_numero"
          placeholder="Número"
        >

      </div>

      <div class="form-group">

        <label>
          Complemento
        </label>

        <input
          type="text"
          id="c_complemento"
          placeholder="Complemento"
        >

      </div>

      <div class="form-group">

        <label>
          Bairro
        </label>

        <input
          type="text"
          id="c_bairro"
          placeholder="Bairro"
        >

      </div>

      <div class="form-group">

        <label>
          Cidade
        </label>

        <input
          type="text"
          id="c_cidade"
          placeholder="Cidade"
        >

      </div>

      <div class="form-group">

        <label>
          Estado (UF)
        </label>

        <input
          type="text"
          id="c_estado"
          maxlength="2"
          placeholder="MG"
          style="text-transform:uppercase;"
        >

      </div>

      <!-- ============ OBS ============ -->

      <div class="form-section-title">
        Observações
      </div>

      <div class="form-group full">

        <label>
          Observações
        </label>

        <textarea
          id="c_observacoes"
          placeholder="Observações internas"
        ></textarea>

      </div>

    </div>

    <div class="modal-actions">

      <button
        class="btn btn-secondary"
        type="button"
        onclick="closeModal()"
      >
        Cancelar
      </button>

      <button
        class="btn btn-primary"
        type="button"
        onclick="saveClientFromQuote()"
        id="saveClientFromQuoteButton"
      >
        Salvar cliente
      </button>

    </div>
  `;

}

function toggleClientTypeFieldsQuote() {

  const type =
    document.getElementById("c_tipo_cliente")?.value || "";

  const isPJ = isPessoaJuridica(type);

  document
    .querySelectorAll(".pj-field")
    .forEach(field => {

      if (isPJ) {
        field.classList.remove("hidden-field");
      } else {
        field.classList.add("hidden-field");
      }

    });

}

async function saveClientFromQuote() {

  const name =
    document.getElementById("c_nome")
      .value
      .trim();

  if (!name) {
    alert("Informe o nome do cliente.");
    return;
  }

  if (!currentStore || !currentStore.id_loja) {
    alert("Loja não identificada.");
    return;
  }

  const tipoCliente =
    document.getElementById("c_tipo_cliente").value;

  const isPJ =
    isPessoaJuridica(tipoCliente);

  const cpfCnpj =
    (document.getElementById("c_cpf_cnpj").value || "")
      .replace(/\D/g, "");

  /* ---------- Validações ---------- */

  if (isPJ) {

    if (cpfCnpj && cpfCnpj.length !== 14) {

      alert(
        "O CNPJ deve ter 14 dígitos.\n\n" +
        "Valor informado: " + cpfCnpj
      );

      return;

    }

    const ie =
      (document.getElementById("c_inscricao_estadual")?.value || "")
        .trim()
        .toUpperCase();

    if (!ie) {

      const continuar = confirm(
        "A Inscrição Estadual não foi informada.\n\n" +
        "Sem ela, o cliente será tratado como " +
        "não contribuinte (indicador 9).\n\n" +
        "Deseja continuar?"
      );

      if (!continuar) {
        return;
      }

    }

  } else {

    if (cpfCnpj && cpfCnpj.length !== 11) {

      alert(
        "O CPF deve ter 11 dígitos.\n\n" +
        "Valor informado: " + cpfCnpj
      );

      return;

    }

  }

  const payload = {

    id_loja: currentStore.id_loja,

    tipo_cliente: tipoCliente,

    nome: name,

    razao_social: isPJ ? name : null,

    nome_fantasia:
      isPJ
        ? (document.getElementById("c_nome_fantasia")?.value.trim() || null)
        : null,

    cpf_cnpj: cpfCnpj || null,

    inscricao_estadual:
      isPJ
        ? (document.getElementById("c_inscricao_estadual")?.value.trim() || null)
        : null,

    indicador_ie:
      isPJ
        ? (document.getElementById("c_indicador_ie")?.value || "9")
        : "9",

    inscricao_municipal:
      isPJ
        ? (document.getElementById("c_inscricao_municipal")?.value.trim() || null)
        : null,

    email:
      document.getElementById("c_email").value.trim() || null,

    telefone:
      document.getElementById("c_telefone").value.trim() || null,

    whatsapp:
      document.getElementById("c_whatsapp").value.trim() || null,

    cep:
      document.getElementById("c_cep").value.trim() || null,

    endereco:
      document.getElementById("c_endereco").value.trim() || null,

    numero:
      document.getElementById("c_numero").value.trim() || null,

    complemento:
      document.getElementById("c_complemento").value.trim() || null,

    bairro:
      document.getElementById("c_bairro").value.trim() || null,

    cidade:
      document.getElementById("c_cidade").value.trim() || null,

    estado:
      document.getElementById("c_estado").value.trim().toUpperCase() || null,

    observacoes:
      document.getElementById("c_observacoes").value.trim() || null,

    ativo:
      document.getElementById("c_ativo").value === "true"

  };

  const button =
    document.getElementById("saveClientFromQuoteButton");

  if (button) {
    button.disabled = true;
    button.textContent = "Salvando...";
  }

  try {

    const result = await db
      .from("gestao_loja_clientes")
      .insert(payload)
      .select(`
        id,
        nome,
        telefone,
        whatsapp,
        email,
        cpf_cnpj,
        tipo_cliente,
        inscricao_estadual,
        indicador_ie,
        inscricao_municipal,
        cep,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        estado
      `)
      .single();

    if (result.error) {
      throw result.error;
    }

    const newClient = result.data;

    clients.push(newClient);

    clients.sort(function(a, b) {
      return String(a.nome || "").localeCompare(
        String(b.nome || ""),
        "pt-BR"
      );
    });

    closeModal();

    const quoteSelect =
      document.getElementById("quoteClient");

    if (quoteSelect) {

      quoteSelect.innerHTML =
        buildQuoteClientOptions(newClient.id);

      changeQuoteClient(newClient.id);

    } else {

      openNewQuote();

      setTimeout(function() {

        const sel = document.getElementById("quoteClient");

        if (sel) {
          sel.value = String(newClient.id);
          changeQuoteClient(newClient.id);
        }

      }, 100);

    }

    alert("Cliente cadastrado com sucesso.");

  } catch (error) {

    console.error("Erro ao cadastrar cliente:", error);

    alert(
      "Erro ao cadastrar cliente:\n" +
      error.message
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "Salvar cliente";
    }

  }

}


/* ======================================================
   FORMULÁRIO DE ORÇAMENTO
   ====================================================== */

function buildQuoteForm() {

  return `

    <div
      style="
        display:grid;
        grid-template-columns:repeat(2,1fr);
        gap:15px;
      "
    >

      <div>

        <label>
          Cliente
        </label>

        <div
          style="display:flex;gap:8px;align-items:flex-end;"
        >

          <div style="flex:1;">

            <select
              id="quoteClient"
              onchange="changeQuoteClient(this.value)"
            >

              ${buildQuoteClientOptions()}

            </select>

          </div>

          <button
            type="button"
            class="btn btn-secondary"
            onclick="openClientForm()"
          >
            + Cadastrar cliente
          </button>

        </div>

      </div>

      <div>

        <label>
          Data do orçamento
        </label>

        <input
          type="date"
          id="quoteDate"
        >

      </div>

    </div>


    <div
      style="
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        margin-top: 20px;
        padding: 15px;
        background: #f8f9fa;
        border: 1px solid #e5e8ed;
        border-radius: 8px;
      "
    >

      <strong style="font-size: 13px; color: #555d6d;">
        Tipo de entrega:
      </strong>

      <label style="display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; margin: 0;">
        <input
          type="radio"
          name="tipo_entrega_quote"
          value="entrega"
          checked
          onchange="changeTipoEntregaQuote(this.value)"
          style="margin: 0; width: 16px; height: 16px;"
        >
        Entrega no endereço
      </label>

      <label style="display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; margin: 0;">
        <input
          type="radio"
          name="tipo_entrega_quote"
          value="retirada"
          onchange="changeTipoEntregaQuote(this.value)"
          style="margin: 0; width: 16px; height: 16px;"
        >
        Retirada na loja
      </label>

    </div>


    <div
      id="quoteAddressBlock"
      style="
        margin-top:20px;
        padding:15px;
        border:1px solid #ddd;
        border-radius:8px;
      "
    >

      <strong>
        Endereço de entrega
      </strong>

      <div
        class="muted"
        style="
          font-size:13px;
          margin-top:4px;
          margin-bottom:15px;
        "
      >
        O endereço será preenchido automaticamente
        pelo cadastro do cliente e poderá ser editado.
      </div>


      <div
        style="
          display:grid;
          grid-template-columns:1fr 2fr 1fr;
          gap:15px;
        "
      >

        <div>

          <label>
            CEP
          </label>

          <input
            type="text"
            id="quoteCep"
            placeholder="00000-000"
          >

        </div>


        <div>

          <label>
            Endereço
          </label>

          <input
            type="text"
            id="quoteAddress"
            placeholder="Rua, avenida..."
          >

        </div>


        <div>

          <label>
            Número
          </label>

          <input
            type="text"
            id="quoteNumber"
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
            Complemento
          </label>

          <input
            type="text"
            id="quoteComplement"
          >

        </div>


        <div>

          <label>
            Bairro
          </label>

          <input
            type="text"
            id="quoteNeighborhood"
          >

        </div>


        <div>

          <label>
            Cidade
          </label>

          <input
            type="text"
            id="quoteCity"
          >

        </div>

      </div>


      <div
        style="
          width:150px;
          margin-top:15px;
        "
      >

        <label>
          Estado
        </label>

        <input
          type="text"
          id="quoteState"
          maxlength="2"
          placeholder="MG"
        >

      </div>

    </div>


    <div style="margin-top:25px;">

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:15px;
        "
      >

        <h3 style="margin:0;">
          Produtos do orçamento
        </h3>

        <button
          type="button"
          class="btn btn-primary"
          onclick="addQuoteItem()"
        >
          + Adicionar produto
        </button>

      </div>

      <div id="quoteItems"></div>

    </div>


    <div
      style="
        display:grid;
        grid-template-columns:repeat(2,1fr);
        gap:15px;
        margin-top:20px;
      "
    >

      <div>

        <label>
          Prazo de entrega
        </label>

        <input
          type="text"
          id="quoteDeliveryDeadline"
          placeholder="Ex.: 5 dias"
        >

      </div>


      <div>

        <label>
          Forma de pagamento
        </label>

        <input
          type="text"
          id="quotePayment"
          placeholder="Ex.: PIX, dinheiro, cartão..."
        >

      </div>

    </div>


    <div
      style="
        display:grid;
        grid-template-columns:repeat(4,1fr);
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
          id="quoteDiscount"
          value="0"
          min="0"
          step="0.01"
          oninput="updateQuoteSummary()"
        >

      </div>


      <div>

        <label>
          Acréscimo
        </label>

        <input
          type="number"
          id="quoteIncrease"
          value="0"
          min="0"
          step="0.01"
          oninput="updateQuoteSummary()"
        >

      </div>


      <div>

        <label>
          Mão de obra
        </label>

        <input
          type="number"
          id="quoteLabor"
          value="0"
          min="0"
          step="0.01"
          oninput="updateQuoteSummary()"
        >

      </div>


      <div>

        <label>
          Frete
        </label>

        <input
          type="number"
          id="quoteFreight"
          value="0"
          min="0"
          step="0.01"
          oninput="updateQuoteSummary()"
        >

      </div>

    </div>


    <div style="margin-top:20px;">

      <label>
        Observações
      </label>

      <textarea
        id="quoteNotes"
        rows="4"
        placeholder="Observações do orçamento..."
      ></textarea>

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

        <span>
          Subtotal
        </span>

        <strong id="quoteSummarySubtotal">
          R$ 0,00
        </strong>

      </div>


      <div class="order-summary-row">

        <span>
          Mão de obra
        </span>

        <strong id="quoteSummaryLabor">
          R$ 0,00
        </strong>

      </div>


      <div class="order-summary-row">

        <span>
          Frete
        </span>

        <strong id="quoteSummaryFreight">
          R$ 0,00
        </strong>

      </div>


      <div class="order-summary-row">

        <span>
          Acréscimo
        </span>

        <strong id="quoteSummaryIncrease">
          R$ 0,00
        </strong>

      </div>


      <div class="order-summary-row">

        <span>
          Desconto
        </span>

        <strong id="quoteSummaryDiscount">
          R$ 0,00
        </strong>

      </div>


      <hr>


      <div
        class="order-summary-row"
        style="font-size:20px;"
      >

        <strong>
          Total
        </strong>

        <strong id="quoteSummaryTotal">
          R$ 0,00
        </strong>

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
        onclick="saveQuote()"
      >
        Salvar orçamento
      </button>

    </div>
  `;

}

function changeTipoEntregaQuote(tipo) {

  const enderecoBlock =
    document.getElementById("quoteAddressBlock");

  const freteInput =
    document.getElementById("quoteFreight");

  if (enderecoBlock) {
    enderecoBlock.style.display =
      tipo === "retirada" ? "none" : "block";
  }

  if (freteInput) {
    if (tipo === "retirada") {
      freteInput.value = "0";
      freteInput.disabled = true;
    } else {
      freteInput.disabled = false;
    }
  }

  updateQuoteSummary();

}

function openNewQuote() {

  editingQuoteId = null;
  currentQuoteItems = [];

  const modal = document.getElementById("modal");

  modal.classList.remove("hidden");

  document.querySelector(
    ".modal-card"
  ).style.maxWidth = "900px";

  document.getElementById(
    "modalTitle"
  ).textContent = "Novo orçamento";

  document.getElementById(
    "modalContent"
  ).innerHTML = buildQuoteForm();

  document.getElementById(
    "quoteDate"
  ).value = getQuoteToday();

  changeTipoEntregaQuote("entrega");

  renderQuoteItems();
  updateQuoteSummary();

}

function changeQuoteClient(clientId) {

  const client =
    clients.find(
      item =>
        String(item.id) ===
        String(clientId)
    );

  const ids = [
    "quoteCep",
    "quoteAddress",
    "quoteNumber",
    "quoteComplement",
    "quoteNeighborhood",
    "quoteCity",
    "quoteState"
  ];

  if (!client) {

    ids.forEach(id => {

      const element = document.getElementById(id);

      if (element) {
        element.value = "";
      }

    });

    return;

  }

  // Só preenche se NÃO for retirada
  const tipo = getTipoEntregaQuoteFromForm();

  if (tipo === "retirada") {
    return;
  }

  document.getElementById("quoteCep").value =
    client.cep || "";

  document.getElementById("quoteAddress").value =
    client.endereco || "";

  document.getElementById("quoteNumber").value =
    client.numero || "";

  document.getElementById("quoteComplement").value =
    client.complemento || "";

  document.getElementById("quoteNeighborhood").value =
    client.bairro || "";

  document.getElementById("quoteCity").value =
    client.cidade || "";

  document.getElementById("quoteState").value =
    client.estado || "";

}


/* ======================================================
   ITENS
   ====================================================== */

function addQuoteItem() {

  currentQuoteItems.push({
    produto_id: "",
    variacao_id: "",
    quantidade: 1,
    preco_unitario: 0,
    desconto: 0,
    observacao: ""
  });

  renderQuoteItems();
  updateQuoteSummary();

}

function removeQuoteItem(index) {

  currentQuoteItems.splice(index, 1);

  renderQuoteItems();
  updateQuoteSummary();

}

function renderQuoteItems() {

  const container =
    document.getElementById("quoteItems");

  if (!container) {
    return;
  }

  if (!currentQuoteItems.length) {

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
          Nenhum produto adicionado ao orçamento.
        </span>

      </div>
    `;

    return;

  }

  container.innerHTML =
    currentQuoteItems.map((item, index) => {

      const productVariations =
        variations.filter(
          variation =>
            String(variation.produto_id) ===
            String(item.produto_id)
        );

      const itemSubtotal =
        (Number(item.quantidade) || 0) *
        (Number(item.preco_unitario) || 0) -
        (Number(item.desconto) || 0);

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
              grid-template-columns:2fr 2fr 1fr 1fr auto;
              gap:10px;
              align-items:end;
            "
          >

            <div>

              <label>
                Produto
              </label>

              <select
                onchange="
                  changeQuoteItemProduct(
                    ${index},
                    this.value
                  )
                "
              >

                ${buildQuoteProductOptions(item.produto_id)}

              </select>

            </div>


            <div>

              <label>
                Variação
              </label>

              <select
                onchange="
                  changeQuoteItemVariation(
                    ${index},
                    this.value
                  )
                "
                ${!productVariations.length ? "disabled" : ""}
              >

                <option value="">
                  ${
                    productVariations.length
                      ? "Selecione"
                      : "Sem variação"
                  }
                </option>

                ${productVariations.map(variation => `

                  <option
                    value="${variation.id}"
                    ${
                      String(variation.id) ===
                      String(item.variacao_id)
                        ? "selected"
                        : ""
                    }
                  >
                    ${escapeHtml(variation.nome)}
                  </option>

                `).join("")}

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
                  changeQuoteItemQuantity(
                    ${index},
                    this.value
                  )
                "
              >

            </div>


            <div>

              <label>
                Preço unitário
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value="${item.preco_unitario}"
                onchange="
                  changeQuoteItemPrice(
                    ${index},
                    this.value
                  )
                "
              >

            </div>


            <button
              type="button"
              class="btn btn-danger"
              onclick="removeQuoteItem(${index})"
            >
              ×
            </button>

          </div>


          <div style="margin-top:10px;">

            <label>
              Observação do item
            </label>

            <input
              type="text"
              value="${escapeHtml(item.observacao || "")}"
              onchange="
                changeQuoteItemObservation(
                  ${index},
                  this.value
                )
              "
              placeholder="Observação..."
            >

          </div>


          <div
            style="
              text-align:right;
              margin-top:10px;
            "
          >

            <strong>
              Subtotal:
              ${quoteMoney(itemSubtotal)}
            </strong>

          </div>

        </div>
      `;

    }).join("");

}

function changeQuoteItemProduct(index, productId) {

  const item = currentQuoteItems[index];

  if (!item) {
    return;
  }

  item.produto_id = productId;
  item.variacao_id = "";

  const product =
    products.find(
      product =>
        String(product.id) ===
        String(productId)
    );

  item.preco_unitario =
    product
      ? Number(product.preco_venda) || 0
      : 0;

  renderQuoteItems();
  updateQuoteSummary();

}

function changeQuoteItemVariation(index, variationId) {

  const item = currentQuoteItems[index];

  if (!item) {
    return;
  }

  item.variacao_id = variationId;

  if (variationId) {

    const variation =
      variations.find(
        variation =>
          String(variation.id) ===
          String(variationId)
      );

    if (variation) {
      item.preco_unitario =
        Number(variation.preco_venda) || 0;
    }

  } else {

    const product =
      products.find(
        product =>
          String(product.id) ===
          String(item.produto_id)
      );

    if (product) {
      item.preco_unitario =
        Number(product.preco_venda) || 0;
    }

  }

  renderQuoteItems();
  updateQuoteSummary();

}

function changeQuoteItemQuantity(index, value) {

  if (!currentQuoteItems[index]) {
    return;
  }

  currentQuoteItems[index].quantidade =
    Number(value) || 0;

  renderQuoteItems();
  updateQuoteSummary();

}

function changeQuoteItemPrice(index, value) {

  if (!currentQuoteItems[index]) {
    return;
  }

  currentQuoteItems[index].preco_unitario =
    Number(value) || 0;

  renderQuoteItems();
  updateQuoteSummary();

}

function changeQuoteItemObservation(index, value) {

  if (!currentQuoteItems[index]) {
    return;
  }

  currentQuoteItems[index].observacao = value;

}


/* ======================================================
   RESUMO
   ====================================================== */

function updateQuoteSummary() {

  let subtotal = 0;

  currentQuoteItems.forEach(item => {

    subtotal +=
      (Number(item.quantidade) || 0) *
      (Number(item.preco_unitario) || 0) -
      (Number(item.desconto) || 0);

  });

  const discount = getQuoteNumberValue("quoteDiscount");
  const increase = getQuoteNumberValue("quoteIncrease");
  const labor    = getQuoteNumberValue("quoteLabor");
  const freight  = getQuoteNumberValue("quoteFreight");

  const total =
    subtotal +
    labor +
    freight +
    increase -
    discount;

  const values = {

    quoteSummarySubtotal: subtotal,
    quoteSummaryLabor: labor,
    quoteSummaryFreight: freight,
    quoteSummaryIncrease: increase,
    quoteSummaryDiscount: discount,
    quoteSummaryTotal: Math.max(total, 0)

  };

  Object.keys(values).forEach(id => {

    const element = document.getElementById(id);

    if (element) {
      element.textContent =
        quoteMoney(values[id]);
    }

  });

}

function getQuoteDeliveryAddress() {

  const tipo = getTipoEntregaQuoteFromForm();

  if (tipo === "retirada") {
    return "Retirada na loja";
  }

  const cep =
    document.getElementById("quoteCep")?.value.trim() || "";

  const address =
    document.getElementById("quoteAddress")?.value.trim() || "";

  const number =
    document.getElementById("quoteNumber")?.value.trim() || "";

  const complement =
    document.getElementById("quoteComplement")?.value.trim() || "";

  const neighborhood =
    document.getElementById("quoteNeighborhood")?.value.trim() || "";

  const city =
    document.getElementById("quoteCity")?.value.trim() || "";

  const state =
    document.getElementById("quoteState")?.value.trim() || "";

  const lines = [];

  if (cep) {
    lines.push(`CEP: ${cep}`);
  }

  if (address) {

    let line = `Endereço: ${address}`;

    if (number) {
      line += `, Nº ${number}`;
    }

    lines.push(line);

  }

  if (complement) {
    lines.push(`Complemento: ${complement}`);
  }

  if (neighborhood) {
    lines.push(`Bairro: ${neighborhood}`);
  }

  if (city || state) {

    lines.push(
      `Cidade: ${city}${state ? " - " + state : ""}`
    );

  }

  return lines.join("\n");

}


/* ======================================================
   SALVAR ORÇAMENTO
   ====================================================== */

async function saveQuote() {

  if (!currentQuoteItems.length) {
    alert("Adicione pelo menos um produto ao orçamento.");
    return;
  }

  const clientId =
    document.getElementById("quoteClient").value;

  if (!clientId) {
    alert("Selecione um cliente.");
    return;
  }

  for (const item of currentQuoteItems) {

    if (!item.produto_id) {
      alert("Selecione o produto de todos os itens.");
      return;
    }

    if (!item.quantidade || Number(item.quantidade) <= 0) {
      alert("Informe uma quantidade válida para todos os produtos.");
      return;
    }

  }

  const subtotal =
    currentQuoteItems.reduce((total, item) => {

      const quantidade = Number(item.quantidade) || 0;
      const precoUnitario = Number(item.preco_unitario) || 0;
      const descontoItem = Number(item.desconto) || 0;

      return total +
        (quantidade * precoUnitario - descontoItem);

    }, 0);

  const desconto  = getQuoteNumberValue("quoteDiscount");
  const acrescimo = getQuoteNumberValue("quoteIncrease");
  const maoDeObra = getQuoteNumberValue("quoteLabor");
  const frete     = getQuoteNumberValue("quoteFreight");

  const valorTotal =
    Math.max(
      subtotal - desconto + acrescimo + frete + maoDeObra,
      0
    );

  const subtotalFinal    = Number(subtotal.toFixed(2));
  const descontoFinal    = Number(desconto.toFixed(2));
  const acrescimoFinal   = Number(acrescimo.toFixed(2));
  const freteFinal       = Number(frete.toFixed(2));
  const maoDeObraFinal   = Number(maoDeObra.toFixed(2));
  const valorTotalFinal  = Number(valorTotal.toFixed(2));

  const quoteData = {

    id_loja: currentStore.id_loja,

    cliente_id: Number(clientId),

    data_pedido:
      document.getElementById("quoteDate").value,

    status: "Orçamento",

    tipo_entrega: getTipoEntregaQuoteFromForm(),

    subtotal: subtotalFinal,
    desconto: descontoFinal,
    acrescimo: acrescimoFinal,
    frete: freteFinal,
    mao_de_obra: maoDeObraFinal,
    valor_total: valorTotalFinal,

    prazo_entrega:
      document.getElementById("quoteDeliveryDeadline").value.trim(),

    forma_pagamento:
      document.getElementById("quotePayment").value.trim(),

    endereco_entrega: getQuoteDeliveryAddress(),

    observacoes:
      document.getElementById("quoteNotes").value.trim()

  };


  /* ---------- EDIÇÃO ---------- */
  /* Não envia numero → banco preserva o existente. */

  if (editingQuoteId) {

    const {
      data: updatedQuote,
      error: quoteError
    } = await db
      .from("gestao_loja_pedidos")
      .update(quoteData)
      .eq("id", editingQuoteId)
      .eq("id_loja", currentStore.id_loja)
      .select()
      .single();

    if (quoteError) {
      alert("Erro ao atualizar orçamento:\n" + quoteError.message);
      return;
    }

    const { error: deleteItemsError } = await db
      .from("gestao_loja_pedidos_itens")
      .delete()
      .eq("pedido_id", editingQuoteId);

    if (deleteItemsError) {
      alert(
        "Erro ao atualizar os itens:\n" +
        deleteItemsError.message
      );
      return;
    }

    const itemsData =
      currentQuoteItems.map(item => {

        const quantidade = Number(item.quantidade) || 0;
        const precoUnitario = Number(item.preco_unitario) || 0;
        const descontoItem = Number(item.desconto) || 0;
        const subtotalItem =
          quantidade * precoUnitario - descontoItem;

        return {

          id_loja: currentStore.id_loja,
          pedido_id: updatedQuote.id,

          produto_id: Number(item.produto_id),
          variacao_id: item.variacao_id
            ? Number(item.variacao_id)
            : null,

          quantidade,
          preco_unitario: precoUnitario,
          desconto: descontoItem,
          subtotal: Number(subtotalItem.toFixed(2)),

          observacao: item.observacao || null

        };

      });

    const { error: itemsError } = await db
      .from("gestao_loja_pedidos_itens")
      .insert(itemsData);

    if (itemsError) {
      alert(
        "Erro ao salvar os itens do orçamento:\n" +
        itemsError.message
      );
      return;
    }

    const { error: finalUpdateError } = await db
      .from("gestao_loja_pedidos")
      .update({
        subtotal: subtotalFinal,
        desconto: descontoFinal,
        acrescimo: acrescimoFinal,
        frete: freteFinal,
        mao_de_obra: maoDeObraFinal,
        valor_total: valorTotalFinal
      })
      .eq("id", editingQuoteId)
      .eq("id_loja", currentStore.id_loja);

    if (finalUpdateError) {
      alert(
        "Os itens foram atualizados, mas ocorreu um erro ao atualizar o valor total:\n" +
        finalUpdateError.message
      );
      return;
    }

    editingQuoteId = null;
    currentQuoteItems = [];

    closeModal();
    await loadQuotes();

    alert(
      "Orçamento atualizado com sucesso.\n\n" +
      "Total: " + quoteMoney(valorTotalFinal)
    );

    return;

  }


  /* ---------- CRIAÇÃO ---------- */
  /* Calcula o número POR LOJA antes de inserir. */

  try {

    const numeroOrcamento = await proximaSequenciaOrcamento();

    quoteData.numero = numeroOrcamento;

    const { data: quote, error } = await db
      .from("gestao_loja_pedidos")
      .insert(quoteData)
      .select()
      .single();

    if (error) {
      alert("Erro ao salvar orçamento:\n" + error.message);
      return;
    }

    const itemsData =
      currentQuoteItems.map(item => {

        const quantidade = Number(item.quantidade) || 0;
        const precoUnitario = Number(item.preco_unitario) || 0;
        const descontoItem = Number(item.desconto) || 0;
        const subtotalItem =
          quantidade * precoUnitario - descontoItem;

        return {

          id_loja: currentStore.id_loja,
          pedido_id: quote.id,

          produto_id: Number(item.produto_id),
          variacao_id: item.variacao_id
            ? Number(item.variacao_id)
            : null,

          quantidade,
          preco_unitario: precoUnitario,
          desconto: descontoItem,
          subtotal: Number(subtotalItem.toFixed(2)),

          observacao: item.observacao || null

        };

      });

    const { error: itemsError } = await db
      .from("gestao_loja_pedidos_itens")
      .insert(itemsData);

    if (itemsError) {

      await db
        .from("gestao_loja_pedidos")
        .delete()
        .eq("id", quote.id);

      alert(
        "Erro ao salvar os itens do orçamento:\n" +
        itemsError.message
      );

      return;

    }

    const { error: finalUpdateError } = await db
      .from("gestao_loja_pedidos")
      .update({
        subtotal: subtotalFinal,
        desconto: descontoFinal,
        acrescimo: acrescimoFinal,
        frete: freteFinal,
        mao_de_obra: maoDeObraFinal,
        valor_total: valorTotalFinal
      })
      .eq("id", quote.id)
      .eq("id_loja", currentStore.id_loja);

    if (finalUpdateError) {
      alert(
        "Orçamento criado, mas ocorreu um erro ao atualizar o valor total:\n" +
        finalUpdateError.message
      );
      return;
    }

    closeModal();
    await loadQuotes();

    alert(
      "Orçamento salvo com sucesso.\n\n" +
      "Número: #" + numeroOrcamento + "\n" +
      "Total: " + quoteMoney(valorTotalFinal)
    );

  } catch (error) {

    console.error("Erro ao salvar orçamento:", error);

    alert(
      "Erro ao salvar orçamento:\n" +
      (error.message || "Erro desconhecido.")
    );

  }

}


/* ======================================================
   VISUALIZAR
   ====================================================== */

async function viewQuote(quoteId) {

  const {
    data: quote,
    error: quoteError
  } = await db
    .from("gestao_loja_pedidos")
    .select(`
      *,
      gestao_loja_clientes (
        id,
        nome,
        telefone,
        whatsapp,
        email,
        cpf_cnpj,
        tipo_cliente,
        inscricao_estadual,
        indicador_ie,
        inscricao_municipal
      )
    `)
    .eq("id", quoteId)
    .eq("id_loja", currentStore.id_loja)
    .single();

  if (quoteError) {
    alert("Erro ao carregar orçamento:\n" + quoteError.message);
    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from("gestao_loja_pedidos_itens")
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
    .eq("pedido_id", quoteId)
    .order("id");

  if (itemsError) {
    alert("Erro ao carregar itens:\n" + itemsError.message);
    return;
  }

  const client = quote.gestao_loja_clientes;

  const isPJ = isPessoaJuridica(client?.tipo_cliente);

  document.getElementById("modal").classList.remove("hidden");

  document.querySelector(
    ".modal-card"
  ).style.maxWidth = "1100px";

  document.getElementById(
    "modalTitle"
  ).textContent =
    `Orçamento #${quote.numero}`;

  const itemsHtml =
    (items || []).map(item => {

      const product = item.gestao_loja_produtos;
      const variation = item.gestao_loja_produtos_variacoes;

      return `
        <tr>

          <td>

            ${escapeHtml(product?.nome || "-")}

            ${
              variation?.nome
                ? `
                  <br>

                  <small class="muted">
                    ${escapeHtml(variation.nome)}
                  </small>
                `
                : ""
            }

          </td>

          <td>
            ${quoteNumber(item.quantidade)}
          </td>

          <td>
            ${quoteMoney(item.preco_unitario)}
          </td>

          <td>
            ${quoteMoney(item.subtotal)}
          </td>

          <td>
            ${escapeHtml(item.observacao || "")}
          </td>

        </tr>
      `;

    }).join("");

  document.getElementById("modalContent").innerHTML = `

    <div
      style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:20px;
      "
    >

      <div class="card">

        <h3>
          Dados do orçamento
        </h3>

        <p>
          <strong>Número:</strong>
          #${quote.numero}
        </p>

        <p>
          <strong>Data:</strong>
          ${formatQuoteDate(quote.data_pedido)}
        </p>

        <p>

          <strong>Status:</strong>

          <span class="status ${quoteStatusClass(quote.status)}">
            ${escapeHtml(quote.status || "Orçamento")}
          </span>

        </p>

        <p>
          <strong>Forma de pagamento:</strong>
          ${escapeHtml(quote.forma_pagamento || "-")}
        </p>

        <p>
          <strong>Prazo de entrega:</strong>
          ${escapeHtml(quote.prazo_entrega || "-")}
        </p>

      </div>


      <div class="card">

        <h3>
          Cliente
        </h3>

        <p>
          <strong>
            ${escapeHtml(client?.nome || "Cliente não informado")}
          </strong>
        </p>

        ${
          isPJ && client?.nome_fantasia
            ? `
              <p>
                <strong>Nome fantasia:</strong>
                ${escapeHtml(client.nome_fantasia)}
              </p>
            `
            : ""
        }

        <p>
          <strong>
            ${isPJ ? "CNPJ" : "CPF"}:
          </strong>
          ${escapeHtml(client?.cpf_cnpj || "-")}
        </p>

        ${
          isPJ
            ? `
              <p>
                <strong>Inscrição Estadual:</strong>
                ${escapeHtml(client?.inscricao_estadual || "Não informada")}
              </p>

              <p>
                <strong>Indicador de IE:</strong>
                ${escapeHtml(getIndicadorIeLabel(client?.indicador_ie))}
              </p>

              <p>
                <strong>Inscrição Municipal:</strong>
                ${escapeHtml(client?.inscricao_municipal || "Não informada")}
              </p>
            `
            : ""
        }

        <p>
          <strong>Telefone:</strong>
          ${escapeHtml(client?.telefone || client?.whatsapp || "-")}
        </p>

        <p>
          <strong>E-mail:</strong>
          ${escapeHtml(client?.email || "-")}
        </p>

      </div>

    </div>


    ${
      isRetiradaQuote(quote)
        ? `
          <div
            class="card"
            style="
              margin-top:20px;
              border-left:4px solid #5145cd;
              background:#f5f3ff;
            "
          >
            <h3 style="margin-top:0;">
              🏬 Retirada na loja
            </h3>

            <p class="muted" style="margin:8px 0 0;">
              Este orçamento será retirado diretamente no estabelecimento.
              Não há endereço de entrega nem frete.
            </p>
          </div>
        `
        : `
          <div class="card" style="margin-top:20px;">

            <h3>
              Endereço de entrega
            </h3>

            <div
              style="
                white-space:pre-wrap;
                margin-top:10px;
              "
            >
              ${escapeHtml(quote.endereco_entrega || "Endereço não informado.")}
            </div>

          </div>
        `
    }


    <div
      class="card"
      style="
        margin-top:20px;
        overflow:auto;
      "
    >

      <h3>
        Produtos
      </h3>

      <table class="table" style="margin-top:15px;">

        <thead>

          <tr>
            <th>Produto</th>
            <th>Quantidade</th>
            <th>Preço unitário</th>
            <th>Subtotal</th>
            <th>Observação</th>
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
        <strong>${quoteMoney(quote.subtotal)}</strong>
      </div>

      <div class="order-summary-row">
        <span>Mão de obra</span>
        <strong>${quoteMoney(quote.mao_de_obra)}</strong>
      </div>

      <div class="order-summary-row">
        <span>Frete</span>
        <strong>${quoteMoney(quote.frete)}</strong>
      </div>

      <div class="order-summary-row">
        <span>Acréscimo</span>
        <strong>${quoteMoney(quote.acrescimo)}</strong>
      </div>

      <div class="order-summary-row">
        <span>Desconto</span>
        <strong>${quoteMoney(quote.desconto)}</strong>
      </div>

      <hr>

      <div
        class="order-summary-row"
        style="font-size:20px;"
      >
        <strong>Total</strong>
        <strong>${quoteMoney(quote.valor_total)}</strong>
      </div>

    </div>


    ${
      quote.observacoes
        ? `
          <div class="card" style="margin-top:20px;">

            <h3>
              Observações
            </h3>

            <div
              style="
                margin-top:8px;
                white-space:pre-wrap;
              "
            >
              ${escapeHtml(quote.observacoes)}
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

      <button
        class="btn btn-secondary"
        onclick="generateQuotePDF(${quote.id})"
      >
        📄 Gerar PDF
      </button>


      ${
        isQuoteStatus(quote.status)
          ? `
            <button
              class="btn btn-secondary"
              onclick="editQuote(${quote.id})"
            >
              Editar
            </button>

            <button
              class="btn btn-primary"
              onclick="approveQuote(${quote.id})"
            >
              Aprovar orçamento
            </button>

            <button
              class="btn btn-danger"
              onclick="cancelQuote(${quote.id})"
            >
              Cancelar
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


/* ======================================================
   EDITAR
   ====================================================== */

async function editQuote(quoteId) {

  const {
    data: quote,
    error: quoteError
  } = await db
    .from("gestao_loja_pedidos")
    .select("*")
    .eq("id", quoteId)
    .eq("id_loja", currentStore.id_loja)
    .single();

  if (quoteError) {
    alert("Erro ao carregar orçamento:\n" + quoteError.message);
    return;
  }

  if (!isQuoteStatus(quote.status)) {
    alert("Somente orçamentos podem ser editados.");
    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from("gestao_loja_pedidos_itens")
    .select("*")
    .eq("pedido_id", quoteId)
    .order("id");

  if (itemsError) {
    alert("Erro ao carregar itens:\n" + itemsError.message);
    return;
  }

  editingQuoteId = quoteId;

  currentQuoteItems =
    (items || []).map(item => ({

      produto_id: item.produto_id,

      variacao_id: item.variacao_id || "",

      quantidade: Number(item.quantidade),

      preco_unitario: Number(item.preco_unitario),

      desconto: Number(item.desconto || 0),

      observacao: item.observacao || ""

    }));

  document.getElementById("modal").classList.remove("hidden");

  document.querySelector(
    ".modal-card"
  ).style.maxWidth = "900px";

  document.getElementById(
    "modalTitle"
  ).textContent =
    `Editar orçamento #${quote.numero}`;

  document.getElementById(
    "modalContent"
  ).innerHTML = buildQuoteForm();

  document.getElementById("quoteClient").value =
    quote.cliente_id || "";

  document.getElementById("quoteDate").value =
    quote.data_pedido || "";

  document.getElementById("quoteDeliveryDeadline").value =
    quote.prazo_entrega || "";

  document.getElementById("quotePayment").value =
    quote.forma_pagamento || "";

  document.getElementById("quoteDiscount").value =
    Number(quote.desconto || 0);

  document.getElementById("quoteIncrease").value =
    Number(quote.acrescimo || 0);

  document.getElementById("quoteLabor").value =
    Number(quote.mao_de_obra || 0);

  document.getElementById("quoteFreight").value =
    Number(quote.frete || 0);

  document.getElementById("quoteNotes").value =
    quote.observacoes || "";

  // Tipo de entrega
  const tipoEntrega =
    quote.tipo_entrega ||
    (isRetiradaQuote(quote) ? "retirada" : "entrega");

  const radioTipo = document.querySelector(
    `input[name="tipo_entrega_quote"][value="${tipoEntrega}"]`
  );

  if (radioTipo) {
    radioTipo.checked = true;
  }

  changeTipoEntregaQuote(tipoEntrega);

  changeQuoteClient(quote.cliente_id);

  renderQuoteItems();
  updateQuoteSummary();

}


/* ======================================================
   APROVAR / CANCELAR
   ====================================================== */

async function approveQuote(quoteId) {

  const { data: quote, error } = await db
    .from("gestao_loja_pedidos")
    .select("*")
    .eq("id", quoteId)
    .eq("id_loja", currentStore.id_loja)
    .single();

  if (error) {
    alert("Erro ao carregar orçamento:\n" + error.message);
    return;
  }

  if (!isQuoteStatus(quote.status)) {
    alert("Este orçamento não está mais disponível para aprovação.");
    return;
  }

  const confirmed = confirm(
    `Deseja aprovar o orçamento #${quote.numero}?\n\n` +
    `Valor: ${quoteMoney(quote.valor_total)}\n\n` +
    `O orçamento passará para o status "Pendente".`
  );

  if (!confirmed) {
    return;
  }

  const { error: updateError } = await db
    .from("gestao_loja_pedidos")
    .update({ status: "Pendente" })
    .eq("id", quoteId)
    .eq("id_loja", currentStore.id_loja);

  if (updateError) {
    alert("Erro ao aprovar orçamento:\n" + updateError.message);
    return;
  }

  closeModal();
  await loadQuotes();

  alert(
    "Orçamento aprovado.\n\n" +
    "Agora ele está como Pendente."
  );

}

async function cancelQuote(quoteId) {

  // Busca o orçamento para mostrar o número amigável na confirmação
  const { data: quote } = await db
    .from("gestao_loja_pedidos")
    .select("numero")
    .eq("id", quoteId)
    .eq("id_loja", currentStore.id_loja)
    .single();

  const numeroLabel = quote?.numero ? `#${quote.numero}` : "";

  const confirmed = confirm(
    `Deseja cancelar ${numeroLabel ? "o orçamento " + numeroLabel : "este orçamento"}?`
  );

  if (!confirmed) {
    return;
  }

  const { error } = await db
    .from("gestao_loja_pedidos")
    .update({ status: "Cancelado" })
    .eq("id", quoteId)
    .eq("id_loja", currentStore.id_loja);

  if (error) {
    alert("Erro ao cancelar orçamento:\n" + error.message);
    return;
  }

  closeModal();
  await loadQuotes();

  alert("Orçamento cancelado.");

}


/* ======================================================
   GERAR PDF
   ====================================================== */

async function generateQuotePDF(quoteId) {

  const {
    data: quote,
    error: quoteError
  } = await db
    .from("gestao_loja_pedidos")
    .select(`
      *,
      gestao_loja_clientes (
        id,
        nome,
        telefone,
        whatsapp,
        email,
        cpf_cnpj,
        tipo_cliente,
        inscricao_estadual,
        indicador_ie,
        inscricao_municipal
      )
    `)
    .eq("id", quoteId)
    .eq("id_loja", currentStore.id_loja)
    .single();

  if (quoteError) {
    alert("Erro ao gerar PDF:\n" + quoteError.message);
    return;
  }

  const {
    data: items,
    error: itemsError
  } = await db
    .from("gestao_loja_pedidos_itens")
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
    .eq("pedido_id", quoteId)
    .order("id");

  if (itemsError) {
    alert("Erro ao carregar itens para o PDF:\n" + itemsError.message);
    return;
  }

  const client = quote.gestao_loja_clientes;

  const isPJ = isPessoaJuridica(client?.tipo_cliente);

  const quoteRetirada = isRetiradaQuote(quote);

  const storeName = escapeHtml(
    currentStore?.nome_fantasia ||
    currentStore?.nome ||
    "Gestão Loja"
  );

  const storeDocument = escapeHtml(
    currentStore?.cnpj || ""
  );

  const address = escapeHtml(
    quote.endereco_entrega || "-"
  ).replace(/\n/g, "<br>");

  const itemsHtml =
    (items || []).map(item => {

      const product = item.gestao_loja_produtos;
      const variation = item.gestao_loja_produtos_variacoes;

      return `
        <tr>

          <td>

            ${escapeHtml(product?.nome || "-")}

            ${
              variation?.nome
                ? `
                  <br>

                  <small>
                    ${escapeHtml(variation.nome)}
                  </small>
                `
                : ""
            }

          </td>

          <td>${quoteNumber(item.quantidade)}</td>

          <td>${quoteMoney(item.preco_unitario)}</td>

          <td>${quoteMoney(item.subtotal)}</td>

        </tr>
      `;

    }).join("");

  const pdfWindow = window.open(
    "",
    "_blank",
    "width=900,height=700"
  );

  if (!pdfWindow) {
    alert(
      "O navegador bloqueou a janela do PDF. Permita pop-ups para este site."
    );
    return;
  }

  pdfWindow.document.open();

  pdfWindow.document.write(`

    <!DOCTYPE html>

    <html lang="pt-BR">

    <head>

      <meta charset="UTF-8">

      <title>
        Orçamento #${quote.numero}
      </title>

      <style>

        * { box-sizing: border-box; }

        body {
          font-family: Arial, Helvetica, sans-serif;
          margin: 0;
          padding: 30px;
          color: #222;
          font-size: 13px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #222;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }

        .store {
          font-size: 22px;
          font-weight: bold;
        }

        .title {
          text-align: right;
          font-size: 22px;
          font-weight: bold;
        }

        .section {
          margin-top: 20px;
        }

        .section-title {
          font-weight: bold;
          font-size: 15px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 6px;
          margin-bottom: 10px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 30px;
        }

        .info-label {
          font-weight: bold;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }

        th, td {
          border: 1px solid #ccc;
          padding: 9px;
        }

        th {
          text-align: left;
          background: #f2f2f2;
        }

        .totals {
          width: 350px;
          margin-left: auto;
          margin-top: 20px;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
        }

        .grand-total {
          font-size: 20px;
          font-weight: bold;
          border-top: 2px solid #222;
          margin-top: 8px;
          padding-top: 10px;
        }

        .observations {
          white-space: pre-wrap;
          line-height: 1.5;
        }

        .footer {
          margin-top: 40px;
          padding-top: 15px;
          border-top: 1px solid #ccc;
          text-align: center;
          font-size: 11px;
          color: #666;
        }

        @media print {
          body { padding: 10px; }
        }

      </style>

    </head>

    <body>

      <div class="header">

        <div>

          <div class="store">
            ${storeName}
          </div>

          ${storeDocument ? `<div>${storeDocument}</div>` : ""}

        </div>

        <div class="title">

          ORÇAMENTO

          <div>#${quote.numero}</div>

        </div>

      </div>


      <div class="section">

        <div class="section-title">
          Dados do orçamento
        </div>

        <div class="info-grid">

          <div>
            <span class="info-label">Cliente:</span>
            ${escapeHtml(client?.nome || "-")}
          </div>

          <div>
            <span class="info-label">Data:</span>
            ${formatQuoteDate(quote.data_pedido)}
          </div>

          <div>
            <span class="info-label">Status:</span>
            ${escapeHtml(quote.status || "Orçamento")}
          </div>

          <div>
            <span class="info-label">Telefone:</span>
            ${escapeHtml(client?.telefone || client?.whatsapp || "-")}
          </div>

          ${
            isPJ
              ? `
                <div>
                  <span class="info-label">CNPJ:</span>
                  ${escapeHtml(client?.cpf_cnpj || "-")}
                </div>

                <div>
                  <span class="info-label">Inscrição Estadual:</span>
                  ${escapeHtml(client?.inscricao_estadual || "-")}
                </div>

                <div>
                  <span class="info-label">Indicador de IE:</span>
                  ${escapeHtml(getIndicadorIeLabel(client?.indicador_ie))}
                </div>

                <div>
                  <span class="info-label">Inscrição Municipal:</span>
                  ${escapeHtml(client?.inscricao_municipal || "-")}
                </div>
              `
              : `
                <div>
                  <span class="info-label">CPF:</span>
                  ${escapeHtml(client?.cpf_cnpj || "-")}
                </div>
              `
          }

          <div>
            <span class="info-label">Forma de pagamento:</span>
            ${escapeHtml(quote.forma_pagamento || "-")}
          </div>

          <div>
            <span class="info-label">Prazo de entrega:</span>
            ${escapeHtml(quote.prazo_entrega || "-")}
          </div>

        </div>

      </div>


      ${
        quoteRetirada
          ? `
            <div class="section">

              <div class="section-title">
                Tipo de entrega
              </div>

              <div style="padding:10px;background:#f5f3ff;border-radius:6px;">
                <strong>RETIRADA NA LOJA</strong><br>
                <small>Este orçamento não possui endereço de entrega nem frete.</small>
              </div>

            </div>
          `
          : `
            <div class="section">

              <div class="section-title">
                Endereço de entrega
              </div>

              <div>${address}</div>

            </div>
          `
      }


      <div class="section">

        <div class="section-title">
          Produtos
        </div>

        <table>

          <thead>

            <tr>

              <th>Produto</th>
              <th>Qtd.</th>
              <th>Valor unit.</th>
              <th>Subtotal</th>

            </tr>

          </thead>

          <tbody>
            ${itemsHtml}
          </tbody>

        </table>

      </div>


      <div class="totals">

        <div class="total-row">
          <span>Subtotal</span>
          <strong>${quoteMoney(quote.subtotal)}</strong>
        </div>

        <div class="total-row">
          <span>Mão de obra</span>
          <strong>${quoteMoney(quote.mao_de_obra)}</strong>
        </div>

        <div class="total-row">
          <span>Frete</span>
          <strong>${quoteMoney(quote.frete)}</strong>
        </div>

        <div class="total-row">
          <span>Acréscimo</span>
          <strong>${quoteMoney(quote.acrescimo)}</strong>
        </div>

        <div class="total-row">
          <span>Desconto</span>
          <strong>${quoteMoney(quote.desconto)}</strong>
        </div>

        <div class="total-row grand-total">
          <span>TOTAL</span>
          <span>${quoteMoney(quote.valor_total)}</span>
        </div>

      </div>


      ${
        quote.observacoes
          ? `
            <div class="section">

              <div class="section-title">
                Observações
              </div>

              <div class="observations">
                ${escapeHtml(quote.observacoes)}
              </div>

            </div>
          `
          : ""
      }


      <div class="footer">
        Orçamento gerado pelo Gestão Loja
      </div>

    </body>

    </html>

  `);

  pdfWindow.document.close();

  setTimeout(function() {

    pdfWindow.focus();

    pdfWindow.print();

  }, 500);

}


/* ======================================================
   BOOT
   ====================================================== */

document.addEventListener(
  "DOMContentLoaded",
  async function() {

    try {

      const authenticated = await requireAuth();

      if (!authenticated) {
        return;
      }

      if (!currentUser) {
        return;
      }

      const contextLoaded = await loadUserContext();

      if (!contextLoaded) {
        return;
      }

      if (typeof loadMenu === "function") {
        await loadMenu();
      }

      if (typeof setActiveNav === "function") {
        setActiveNav();
      }

      const subtitle =
        document.getElementById("pageSubtitle");

      if (subtitle) {
        subtitle.textContent =
          "Gerencie os orçamentos dos clientes";
      }

      await Promise.all([
        loadQuoteClients(),
        loadQuoteProducts(),
        loadQuoteVariations()
      ]);

      await loadQuotes();

    } catch (error) {

      console.error(
        "Erro na página de orçamentos:",
        error
      );

      const container =
        document.getElementById("quotesContainer");

      if (container) {
        container.innerHTML = `
          <div class="card">
            <h3>
              Erro ao carregar a página
            </h3>
            <p>
              ${escapeHtml(
                error.message || "Erro desconhecido."
              )}
            </p>
          </div>
        `;
      }

    }

  }
);
let clients = [];
let clientOrders = [];
let editingClientId = null;


document.addEventListener("DOMContentLoaded", async () => {

  const authenticated = await requireAuth();

  if (!authenticated) {
    return;
  }

  if (!currentUser) {
    return;
  }

  if (!currentStore) {

    const contextLoaded = await loadUserContext();

    if (!contextLoaded) {
      return;
    }

  }

  await loadClientsPage();

});


async function loadClientsPage() {

  const container = $("clientsList");

  if (container) {

    container.innerHTML = `
      <div class="empty-clients">
        Carregando clientes...
      </div>
    `;

  }

  try {

    if (!currentStore || !currentStore.id_loja) {

      console.error(
        "Loja não encontrada:",
        currentStore
      );

      if (container) {

        container.innerHTML = `
          <div class="empty-clients">
            Não foi possível identificar a loja.
          </div>
        `;

      }

      return;

    }

    const clientsResult =
      await db
        .from("gestao_loja_clientes")
        .select("*")
        .eq(
          "id_loja",
          currentStore.id_loja
        )
        .order(
          "nome",
          { ascending: true }
        );

    if (clientsResult.error) {

      console.error(
        "Erro ao carregar clientes:",
        clientsResult.error
      );

      if (container) {

        container.innerHTML = `
          <div class="empty-clients">
            Erro ao carregar clientes.
            <br>
            <small>
              ${escapeHtml(clientsResult.error.message)}
            </small>
          </div>
        `;

      }

      return;

    }

    clients = clientsResult.data || [];

    const ordersResult =
      await db
        .from("gestao_loja_pedidos")
        .select(
          "id,id_loja,numero,cliente_id,data_pedido,status,valor_total"
        )
        .eq(
          "id_loja",
          currentStore.id_loja
        )
        .order(
          "data_pedido",
          { ascending: false }
        );

    if (ordersResult.error) {

      console.error(
        "Erro ao carregar pedidos:",
        ordersResult.error
      );

      clientOrders = [];

    } else {

      clientOrders = ordersResult.data || [];

    }

    updateClientStats();
    renderClients();

  } catch (error) {

    console.error(
      "Erro ao carregar página de clientes:",
      error
    );

    if (container) {

      container.innerHTML = `
        <div class="empty-clients">
          Erro ao carregar os dados dos clientes.
        </div>
      `;

    }

  }

}


/* ======================================================
   HELPERS DE PEDIDOS
   ====================================================== */

function getConfirmedOrders() {

  return clientOrders.filter(order => {

    const status =
      String(order.status || "")
        .trim()
        .toLowerCase();

    return (
      status === "confirmado" ||
      status === "confirmada"
    );

  });

}


function getClientOrders(clientId) {

  return getConfirmedOrders()
    .filter(order =>
      Number(order.cliente_id) === Number(clientId)
    )
    .sort((a, b) => {

      const dateA =
        new Date(a.data_pedido).getTime() || 0;

      const dateB =
        new Date(b.data_pedido).getTime() || 0;

      return dateB - dateA;

    });

}


function getClientStats(clientId) {

  const orders = getClientOrders(clientId);

  const total =
    orders.reduce(
      (sum, order) =>
        sum + Number(order.valor_total || 0),
      0
    );

  const lastOrder =
    orders.length > 0 ? orders[0] : null;

  return {
    orders,
    total,
    lastOrder,
    quantity: orders.length
  };

}


/* ======================================================
   ESTATÍSTICAS DO TOPO
   ====================================================== */

function updateClientStats() {

  const confirmedOrders = getConfirmedOrders();

  const totalSales =
    confirmedOrders.reduce(
      (sum, order) =>
        sum + Number(order.valor_total || 0),
      0
    );

  const clientsWithPurchase = new Set();

  confirmedOrders.forEach(order => {

    if (
      order.cliente_id !== null &&
      order.cliente_id !== undefined
    ) {

      clientsWithPurchase.add(Number(order.cliente_id));

    }

  });

  const withoutPurchase =
    clients.filter(client =>
      !clientsWithPurchase.has(Number(client.id))
    ).length;

  const active =
    clients.filter(client => client.ativo === true).length;

  if ($("totalClients")) {

    $("totalClients").textContent =
      clients.length.toLocaleString("pt-BR");

  }

  if ($("activeClients")) {

    $("activeClients").textContent =
      active.toLocaleString("pt-BR");

  }

  if ($("totalClientSales")) {

    $("totalClientSales").textContent =
      money(totalSales);

  }

  if ($("clientsWithoutPurchase")) {

    $("clientsWithoutPurchase").textContent =
      withoutPurchase.toLocaleString("pt-BR");

  }

}


/* ======================================================
   LISTAGEM
   ====================================================== */

function renderClients() {

  const container = $("clientsList");

  if (!container) {
    return;
  }

  const search =
    ($("clientSearch")?.value || "")
      .toLowerCase()
      .trim();

  const filter =
    $("clientFilter")?.value || "todos";

  const filtered = clients.filter(client => {

    const name =
      String(client.nome || "").toLowerCase();

    const cpfCnpj =
      String(client.cpf_cnpj || "").toLowerCase();

    const phone =
      String(client.telefone || "").toLowerCase();

    const whatsapp =
      String(client.whatsapp || "").toLowerCase();

    const matchesSearch =
      !search ||
      name.includes(search) ||
      cpfCnpj.includes(search) ||
      phone.includes(search) ||
      whatsapp.includes(search);

    if (!matchesSearch) {
      return false;
    }

    if (filter === "ativos" && client.ativo !== true) {
      return false;
    }

    if (filter === "inativos" && client.ativo === true) {
      return false;
    }

    const clientType =
      String(client.tipo_cliente || "").toLowerCase();

    if (
      filter === "fisicos" &&
      !clientType.includes("fisic")
    ) {
      return false;
    }

    if (
      filter === "juridicos" &&
      !clientType.includes("jurid")
    ) {
      return false;
    }

    if (
      filter === "sem_compra" &&
      getClientStats(client.id).quantity > 0
    ) {
      return false;
    }

    return true;

  });

  if (!filtered.length) {

    container.innerHTML = `
      <div class="empty-clients">
        Nenhum cliente encontrado.
      </div>
    `;

    return;

  }

  container.innerHTML =
    filtered
      .map(client => renderClientCard(client))
      .join("");

}


function renderClientCard(client) {

  const stats = getClientStats(client.id);

  const isPJ =
    String(client.tipo_cliente || "")
      .toLowerCase()
      .includes("jurid");

  const type = isPJ ? "Jurídico" : "Físico";

  const statusClass =
    client.ativo === true ? "" : "inactive";

  const statusText =
    client.ativo === true ? "Ativo" : "Inativo";

  const lastPurchase =
    stats.lastOrder
      ? formatDate(stats.lastOrder.data_pedido)
      : "Nenhuma compra";

  return `
    <div class="client-card">

      <div class="client-card-top">

        <div>

          <div class="client-name">
            ${escapeHtml(client.nome || "Cliente sem nome")}
          </div>

          <div class="client-type">
            ${type}
            ${
              client.cpf_cnpj
                ? " • " + escapeHtml(client.cpf_cnpj)
                : ""
            }
            ${
              isPJ && client.inscricao_estadual
                ? " • IE: " + escapeHtml(client.inscricao_estadual)
                : ""
            }
          </div>

        </div>

        <span class="client-status ${statusClass}">
          ${statusText}
        </span>

      </div>

      <div class="client-info-grid">

        <div>
          <div class="client-info-label">
            Total comprado
          </div>
          <div class="client-info-value">
            ${money(stats.total)}
          </div>
        </div>

        <div>
          <div class="client-info-label">
            Última compra
          </div>
          <div class="client-info-value">
            ${lastPurchase}
          </div>
        </div>

        <div>
          <div class="client-info-label">
            Pedidos
          </div>
          <div class="client-info-value">
            ${stats.quantity}
          </div>
        </div>

      </div>

      <div class="client-actions">

        <button
          class="btn btn-secondary"
          onclick="viewClient(${client.id})"
        >
          Ver detalhes
        </button>

        <button
          class="btn btn-secondary"
          onclick="editClient(${client.id})"
        >
          Editar
        </button>

      </div>

    </div>
  `;

}


/* ======================================================
   DATAS / HELPERS FISCAIS
   ====================================================== */

function formatDate(value) {

  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("pt-BR");

}


function formatDateTime(value) {

  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("pt-BR");

}


function getIndicadorIeLabel(value) {

  const labels = {
    "1": "1 - Contribuinte ICMS",
    "2": "2 - Contribuinte isento",
    "9": "9 - Não contribuinte"
  };

  return labels[String(value)] || "9 - Não contribuinte";

}


function isPessoaJuridica(tipo) {

  const t = String(tipo || "").toLowerCase();

  return (
    t.includes("jurid") ||
    t.includes("jurídica") ||
    t.includes("juridica")
  );

}


/* ======================================================
   ABERTURA DO MODAL
   ====================================================== */

function openNewClient() {

  editingClientId = null;

  openModal(
    "Novo cliente",
    clientForm()
  );

  toggleClientTypeFields();

}


function editClient(clientId) {

  const client =
    clients.find(item =>
      Number(item.id) === Number(clientId)
    );

  if (!client) {
    return;
  }

  editingClientId = client.id;

  openModal(
    "Editar cliente",
    clientForm(client)
  );

  toggleClientTypeFields();

}


/* ======================================================
   FORMULÁRIO
   ====================================================== */

function clientForm(client = {}) {

  const isPJ = isPessoaJuridica(
    client.tipo_cliente
  );

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
          id="clientType"
          onchange="toggleClientTypeFields()">

          <option
            value="Pessoa Física"
            ${!isPJ ? "selected" : ""}
          >
            Pessoa Física
          </option>

          <option
            value="Pessoa Jurídica"
            ${isPJ ? "selected" : ""}
          >
            Pessoa Jurídica
          </option>

        </select>

      </div>

      <div class="form-group">

        <label>
          Status
        </label>

        <select id="clientActive">

          <option
            value="true"
            ${client.ativo !== false ? "selected" : ""}
          >
            Ativo
          </option>

          <option
            value="false"
            ${client.ativo === false ? "selected" : ""}
          >
            Inativo
          </option>

        </select>

      </div>

      <div class="form-group full">

        <label>
          Nome / Razão social *
        </label>

        <input
          type="text"
          id="clientName"
          value="${escapeHtml(
            client.nome ||
            client.razao_social ||
            ""
          )}"
          placeholder="Nome completo ou razão social"
        >

      </div>

      <!-- Nome fantasia (PJ) -->
      <div
        class="form-group full pj-field ${isPJ ? "" : "hidden-field"}">

        <label>
          Nome fantasia
        </label>

        <input
          type="text"
          id="clientNomeFantasia"
          value="${escapeHtml(client.nome_fantasia || "")}"
          placeholder="Nome fantasia da empresa"
        >

      </div>

      <div class="form-group">

        <label>
          CPF / CNPJ
        </label>

        <input
          type="text"
          id="clientCpfCnpj"
          value="${escapeHtml(client.cpf_cnpj || "")}"
          placeholder="Somente números"
        >

      </div>

      <!-- Inscrição Estadual (PJ) -->
      <div
        class="form-group pj-field ${isPJ ? "" : "hidden-field"}">

        <label>
          Inscrição Estadual
        </label>

        <input
          type="text"
          id="clientInscricaoEstadual"
          value="${escapeHtml(client.inscricao_estadual || "")}"
          placeholder="IE ou ISENTO"
        >

        <small class="form-hint">
          Use ISENTO se não contribuinte
        </small>

      </div>

      <!-- Indicador de IE (PJ) -->
      <div
        class="form-group pj-field ${isPJ ? "" : "hidden-field"}">

        <label>
          Indicador de IE
        </label>

        <select id="clientIndicadorIe">

          <option value="1"
            ${client.indicador_ie === "1" ? "selected" : ""}>
            1 - Contribuinte ICMS
          </option>

          <option value="2"
            ${client.indicador_ie === "2" ? "selected" : ""}>
            2 - Contribuinte isento
          </option>

          <option value="9"
            ${!client.indicador_ie || client.indicador_ie === "9"
              ? "selected"
              : ""}>
            9 - Não contribuinte
          </option>

        </select>

      </div>

      <!-- Inscrição Municipal (PJ) -->
      <div
        class="form-group pj-field ${isPJ ? "" : "hidden-field"}">

        <label>
          Inscrição Municipal
        </label>

        <input
          type="text"
          id="clientInscricaoMunicipal"
          value="${escapeHtml(client.inscricao_municipal || "")}"
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
          id="clientEmail"
          value="${escapeHtml(client.email || "")}"
          placeholder="cliente@email.com"
        >

      </div>

      <div class="form-group">

        <label>
          Telefone
        </label>

        <input
          type="text"
          id="clientPhone"
          value="${escapeHtml(client.telefone || "")}"
          placeholder="Telefone"
        >

      </div>

      <div class="form-group">

        <label>
          WhatsApp
        </label>

        <input
          type="text"
          id="clientWhatsapp"
          value="${escapeHtml(client.whatsapp || "")}"
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
          id="clientCep"
          value="${escapeHtml(client.cep || "")}"
          placeholder="00000-000"
        >

      </div>

      <div class="form-group">

        <label>
          Endereço
        </label>

        <input
          type="text"
          id="clientAddress"
          value="${escapeHtml(client.endereco || "")}"
          placeholder="Rua, avenida..."
        >

      </div>

      <div class="form-group">

        <label>
          Número
        </label>

        <input
          type="text"
          id="clientNumber"
          value="${escapeHtml(client.numero || "")}"
          placeholder="Número"
        >

      </div>

      <div class="form-group">

        <label>
          Complemento
        </label>

        <input
          type="text"
          id="clientComplement"
          value="${escapeHtml(client.complemento || "")}"
          placeholder="Complemento"
        >

      </div>

      <div class="form-group">

        <label>
          Bairro
        </label>

        <input
          type="text"
          id="clientNeighborhood"
          value="${escapeHtml(client.bairro || "")}"
          placeholder="Bairro"
        >

      </div>

      <div class="form-group">

        <label>
          Cidade
        </label>

        <input
          type="text"
          id="clientCity"
          value="${escapeHtml(client.cidade || "")}"
          placeholder="Cidade"
        >

      </div>

      <div class="form-group">

        <label>
          Estado (UF)
        </label>

        <input
          type="text"
          id="clientState"
          maxlength="2"
          value="${escapeHtml(client.estado || "")}"
          placeholder="MG"
          style="text-transform:uppercase;"
        >

      </div>

      <!-- ============ OBSERVAÇÕES ============ -->

      <div class="form-section-title">
        Observações
      </div>

      <div class="form-group full">

        <textarea
          id="clientNotes"
          placeholder="Observações internas"
        >${escapeHtml(client.observacoes || "")}</textarea>

      </div>

    </div>

    <div class="modal-actions">

      <button
        class="btn btn-secondary"
        onclick="closeModal()"
      >
        Cancelar
      </button>

      <button
        class="btn btn-primary"
        onclick="saveClient()"
      >
        Salvar cliente
      </button>

    </div>
  `;

}


function toggleClientTypeFields() {

  const type = $("clientType")?.value || "";

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


/* ======================================================
   SALVAR
   ====================================================== */

async function saveClient() {

  const name =
    $("clientName")?.value.trim();

  if (!name) {

    alert("Informe o nome do cliente.");
    return;

  }

  if (!currentStore || !currentStore.id_loja) {

    alert("Loja não identificada.");
    return;

  }

  const tipoCliente =
    $("clientType").value;

  const isPJ =
    isPessoaJuridica(tipoCliente);


  /* ---------- Validações fiscais ---------- */

  const cpfCnpj =
    ($("clientCpfCnpj")?.value || "")
      .replace(/\D/g, "");

  if (isPJ) {

    if (cpfCnpj && cpfCnpj.length !== 14) {

      alert(
        "O CNPJ deve ter 14 dígitos.\n\n" +
        "Valor informado: " + cpfCnpj
      );

      return;

    }

    const ie =
      ($("clientInscricaoEstadual")?.value || "")
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


  /* ---------- Monta payload ---------- */

  const data = {

    id_loja: currentStore.id_loja,

    tipo_cliente: tipoCliente,

    nome: name,

    razao_social:
      isPJ ? name : null,

    nome_fantasia:
      isPJ
        ? ($("clientNomeFantasia")?.value.trim() || null)
        : null,

    cpf_cnpj:
      cpfCnpj || null,

    inscricao_estadual:
      isPJ
        ? ($("clientInscricaoEstadual")?.value.trim() || null)
        : null,

    indicador_ie:
      isPJ
        ? ($("clientIndicadorIe")?.value || "9")
        : "9",

    inscricao_municipal:
      isPJ
        ? ($("clientInscricaoMunicipal")?.value.trim() || null)
        : null,

    email:
      $("clientEmail").value.trim() || null,

    telefone:
      $("clientPhone").value.trim() || null,

    whatsapp:
      $("clientWhatsapp").value.trim() || null,

    cep:
      $("clientCep").value.trim() || null,

    endereco:
      $("clientAddress").value.trim() || null,

    numero:
      $("clientNumber").value.trim() || null,

    complemento:
      $("clientComplement").value.trim() || null,

    bairro:
      $("clientNeighborhood").value.trim() || null,

    cidade:
      $("clientCity").value.trim() || null,

    estado:
      $("clientState").value.trim().toUpperCase() || null,

    observacoes:
      $("clientNotes").value.trim() || null,

    ativo:
      $("clientActive").value === "true"

  };


  try {

    let result;

    if (editingClientId) {

      result = await db
        .from("gestao_loja_clientes")
        .update(data)
        .eq("id", editingClientId)
        .eq("id_loja", currentStore.id_loja);

    } else {

      result = await db
        .from("gestao_loja_clientes")
        .insert(data);

    }

    if (result.error) {

      console.error(
        "Erro ao salvar cliente:",
        result.error
      );

      alert(
        "Erro ao salvar cliente: " +
        result.error.message
      );

      return;

    }

    closeModal();

    await loadClientsPage();

  } catch (error) {

    console.error(
      "Erro ao salvar cliente:",
      error
    );

    alert("Erro ao salvar cliente.");

  }

}


/* ======================================================
   DETALHES
   ====================================================== */

function viewClient(clientId) {

  const client =
    clients.find(item =>
      Number(item.id) === Number(clientId)
    );

  if (!client) {
    return;
  }

  const stats = getClientStats(client.id);

  const isPJ =
    isPessoaJuridica(client.tipo_cliente);

  const type =
    isPJ ? "Pessoa Jurídica" : "Pessoa Física";

  const lastPurchase =
    stats.lastOrder
      ? formatDate(stats.lastOrder.data_pedido)
      : "Nenhuma compra";

  const addressParts = [
    client.endereco,
    client.numero,
    client.complemento,
    client.bairro,
    client.cidade,
    client.estado
  ].filter(Boolean);

  const address =
    addressParts.length
      ? addressParts.join(", ")
      : "Não informado";

  const history =
    stats.orders.length
      ? stats.orders
          .map(order => `
            <div class="purchase-row">

              <div>
                <div class="purchase-label">
                  Pedido
                </div>
                <div class="purchase-value">
                  #${escapeHtml(String(order.numero || order.id))}
                </div>
              </div>

              <div>
                <div class="purchase-label">
                  Data
                </div>
                <div class="purchase-value">
                  ${formatDate(order.data_pedido)}
                </div>
              </div>

              <div>
                <div class="purchase-label">
                  Valor
                </div>
                <div class="purchase-value">
                  ${money(order.valor_total)}
                </div>
              </div>

              <div>
                <div class="purchase-label">
                  Status
                </div>
                <div class="purchase-value">
                  ${escapeHtml(order.status || "-")}
                </div>
              </div>

            </div>
          `)
          .join("")
      : `
        <div
          style="
            color:#7d8492;
            font-size:13px;
            padding:10px 0;
          "
        >
          Este cliente ainda não possui compras confirmadas.
        </div>
      `;

  openModal(
    "Detalhes do cliente",
    `
      <div class="client-detail-header">

        <div class="detail-box">
          <small>Cliente</small>
          <strong>${escapeHtml(client.nome || "-")}</strong>
        </div>

        <div class="detail-box">
          <small>Tipo</small>
          <strong>${type}</strong>
        </div>

        ${
          isPJ && client.nome_fantasia
            ? `
              <div class="detail-box">
                <small>Nome fantasia</small>
                <strong>${escapeHtml(client.nome_fantasia)}</strong>
              </div>
            `
            : ""
        }

        <div class="detail-box">
          <small>CPF / CNPJ</small>
          <strong>${escapeHtml(
            client.cpf_cnpj || "Não informado"
          )}</strong>
        </div>

        <div class="detail-box">
          <small>Telefone</small>
          <strong>${escapeHtml(
            client.telefone || "Não informado"
          )}</strong>
        </div>

        <div class="detail-box">
          <small>Total comprado</small>
          <strong>${money(stats.total)}</strong>
        </div>

        <div class="detail-box">
          <small>Última compra</small>
          <strong>${lastPurchase}</strong>
        </div>

        <div class="detail-box">
          <small>Total de pedidos</small>
          <strong>${stats.quantity}</strong>
        </div>

        <div class="detail-box">
          <small>Endereço</small>
          <strong>${escapeHtml(address)}</strong>
        </div>

        ${
          isPJ
            ? `
              <div class="detail-box">
                <small>Inscrição Estadual</small>
                <strong>${escapeHtml(
                  client.inscricao_estadual || "Não informada"
                )}</strong>
              </div>

              <div class="detail-box">
                <small>Indicador de IE</small>
                <strong>${escapeHtml(
                  getIndicadorIeLabel(client.indicador_ie)
                )}</strong>
              </div>

              <div class="detail-box">
                <small>Inscrição Municipal</small>
                <strong>${escapeHtml(
                  client.inscricao_municipal || "Não informada"
                )}</strong>
              </div>
            `
            : ""
        }

      </div>

      <div class="client-history">

        <h3>Histórico de compras</h3>

        ${history}

      </div>

      <div class="modal-actions">

        <button
          class="btn btn-secondary"
          onclick="editClient(${client.id})"
        >
          Editar cliente
        </button>

        <button
          class="btn btn-primary"
          onclick="closeModal()"
        >
          Fechar
        </button>

      </div>
    `
  );

}
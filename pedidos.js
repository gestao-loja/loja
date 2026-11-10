let clients = [];
let products = [];
let variations = [];
let orders = [];
let currentOrderItems = [];
let editingOrderId = null;
let currentOrderFilter = "ativos"; // Filtro padrão ao abrir a página


/* ======================================================
   NÚMERO DO PEDIDO — sequencial POR LOJA
   ====================================================== */

async function proximaSequenciaPedido() {
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
   HELPERS GERAIS
   ====================================================== */

function orderMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function orderNumber(value) {
  return Number(value || 0);
}

function getNumberValue(id) {
  const element = document.getElementById(id);
  if (!element) return 0;
  return Number(String(element.value || "").replace(",", ".")) || 0;
}

function getToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function getCurrentUserId() {
  if (!currentUser) return null;
  return currentUser.id || currentUser.user?.id || null;
}


/* ======================================================
   HELPERS DE STATUS
   ====================================================== */

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isNew(order) {
  if (!order) return false;
  const status = normalizeStatus(order.status);
  return status === "novo" || status === "new";
}

function isPending(order) {
  if (!order) return false;
  const status = normalizeStatus(order.status);
  return status === "pendente" || status === "pending";
}

function isConfirmed(order) {
  if (!order) return false;
  const status = normalizeStatus(order.status);
  return status === "confirmado" || status === "confirmed";
}

function isOrcamento(order) {
  if (!order) return false;
  return normalizeStatus(order.status) === "orçamento";
}

function isRejected(order) {
  if (!order) return false;
  return normalizeStatus(order.status) === "recusado";
}

function isCancelled(order) {
  if (!order) return false;
  return normalizeStatus(order.status) === "cancelado";
}

function orderStatusClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "novo" || normalized === "new") return "status-novo";
  if (normalized === "pendente" || normalized === "pending") return "status-pendente";
  if (normalized === "confirmado" || normalized === "confirmed") return "status-confirmado";
  if (normalized === "orçamento") return "status-orcamento";
  if (normalized === "recusado") return "status-recusado";
  if (normalized === "cancelado") return "status-cancelado";
  return "";
}


/* ======================================================
   HELPERS DE CLIENTE PJ
   ====================================================== */

function isPessoaJuridica(client) {
  if (!client) return false;
  const tipo = String(client.tipo_cliente || "").trim().toLowerCase();
  if (["juridico", "jurídica", "juridica", "pj", "pessoa_juridica", "pessoa jurídica"].includes(tipo)) return true;
  const doc = String(client.cpf_cnpj || "").replace(/\D/g, "");
  return doc.length === 14;
}

function getIndicadorIeLabel(value) {
  const labels = { "1": "1 - Contribuinte ICMS", "2": "2 - Contribuinte isento", "9": "9 - Não contribuinte" };
  return labels[String(value)] || "9 - Não contribuinte";
}


/* ======================================================
   HELPERS DE TIPO DE ENTREGA E DATA
   ====================================================== */

function isRetirada(order) {
  if (!order) return false;
  if (String(order.tipo_entrega || "").toLowerCase() === "retirada") return true;
  return String(order.endereco_entrega || "").trim().toLowerCase() === "retirada na loja";
}

function getTipoEntregaFromForm() {
  const selected = document.querySelector('input[name="tipo_entrega"]:checked');
  return selected ? selected.value : "entrega";
}

function calcularDataPrevisao() {
  const dataPedido = document.getElementById("orderDate").value;
  const prazo = document.getElementById("orderDeliveryDeadline").value;
  const display = document.getElementById("previsaoDisplay");

  if (!display) return null;
  if (!dataPedido || !prazo) { display.textContent = ''; return null; }

  const match = prazo.match(/\d+/);
  if (match) {
    const dias = parseInt(match[0]);
    const data = new Date(dataPedido + 'T12:00:00');
    data.setDate(data.getDate() + dias);
    
    const yyyy = data.getFullYear();
    const mm = String(data.getMonth() + 1).padStart(2, '0');
    const dd = String(data.getDate()).padStart(2, '0');
    const dataIso = `${yyyy}-${mm}-${dd}`;

    display.innerHTML = `➡️ Previsão: <strong>${data.toLocaleDateString('pt-BR')}</strong>`;
    return dataIso;
  }
  display.textContent = '';
  return null;
}

/* ======================================================
   HELPERS DE DESCONTO POR ITEM
   ====================================================== */

/**
 * Calcula o desconto REAL em reais de um item, respeitando o modo:
 * - modo "unidade": o valor informado é o desconto POR UNIDADE (× quantidade)
 * - modo "total":   o valor informado é o desconto TOTAL do item (uma vez)
 * - tipo "R$" ou "%" se aplica sobre a base correspondente.
 */
function calcularDescontoItem(item) {
  const quantidade = Number(item.quantidade) || 0;
  const preco = Number(item.preco_unitario) || 0;
  const bruto = quantidade * preco;
  const descontoValor = Number(item.desconto) || 0;
  const tipo = item.desconto_tipo || "R$";
  const modo = item.desconto_modo || "total";

  if (bruto <= 0 || descontoValor <= 0) return 0;

  let baseCalculo = bruto;
  if (modo === "unidade") {
    baseCalculo = preco; // base é o valor de UMA unidade
  }

  let descontoReal = 0;
  if (tipo === "%") {
    descontoReal = (baseCalculo * descontoValor) / 100;
    if (modo === "unidade") descontoReal = descontoReal * quantidade;
  } else {
    descontoReal = descontoValor;
    if (modo === "unidade") descontoReal = descontoReal * quantidade;
  }

  return Math.min(descontoReal, bruto);
}

/**
 * Subtotal final do item (já com desconto aplicado).
 */
function calcularSubtotalItem(item) {
  const quantidade = Number(item.quantidade) || 0;
  const preco = Number(item.preco_unitario) || 0;
  const bruto = quantidade * preco;
  return Math.max(bruto - calcularDescontoItem(item), 0);
}

/**
 * Valor unitário final (com desconto rateado por unidade).
 */
function calcularValorUnitarioFinal(item) {
  const quantidade = Number(item.quantidade) || 0;
  if (quantidade <= 0) return 0;
  return calcularSubtotalItem(item) / quantidade;
}


/* ======================================================
   CARREGAMENTOS
   ====================================================== */

async function loadClients() {
  const { data, error } = await db.from("gestao_loja_clientes").select("*").eq("id_loja", currentStore.id_loja).eq("ativo", true).order("nome");
  if (error) throw error;
  clients = data || [];
}

async function loadProducts() {
  const { data, error } = await db.from("gestao_loja_produtos").select("*").eq("id_loja", currentStore.id_loja).eq("ativo", true).order("nome");
  if (error) throw error;
  products = data || [];
}

async function loadVariations() {
  const { data, error } = await db.from("gestao_loja_produtos_variacoes").select("*").eq("id_loja", currentStore.id_loja).eq("ativo", true).order("nome");
  if (error) throw error;
  variations = data || [];
}

async function loadOrders() {
  const { data, error } = await db.from("gestao_loja_pedidos").select(`
      *, gestao_loja_clientes (id, nome, telefone, whatsapp, email, cpf_cnpj, tipo_cliente, inscricao_estadual, indicador_ie, inscricao_municipal)
    `).eq("id_loja", currentStore.id_loja).order("id", { ascending: false });

  if (error) throw error;
  orders = data || [];

  window.__notasPorPedido = {};
  if (orders.length) {
    const orderIds = orders.map(order => order.id);
    const { data: notas, error: notasError } = await db.from("gestao_loja_notas_fiscais").select("id, pedido_id, numero, serie, chave, status, pdf_url, xml_url").eq("id_loja", currentStore.id_loja).in("pedido_id", orderIds);
    if (!notasError && notas) {
      notas.forEach(nota => {
        const atual = window.__notasPorPedido[nota.pedido_id];
        if (!atual || Number(nota.id) > Number(atual.id)) window.__notasPorPedido[nota.pedido_id] = nota;
      });
    }
  }

  await loadPagamentosPedidos(orders.map(order => order.id));
  renderOrders();
}


/* ======================================================
   LISTAGEM
   ====================================================== */

/* ======================================================
   FILTROS DA LISTAGEM
   ====================================================== */

function setOrderFilter(filter) {
  currentOrderFilter = filter;
  
  // Atualiza a aparência dos botões
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-filter') === filter) {
      btn.classList.add('active');
    }
  });

  // Re-renderiza a lista com o novo filtro
  renderOrders();
}

function orderMatchesFilter(order) {
  const status = normalizeStatus(order.status);
  
  if (currentOrderFilter === "todos") return true;
  
  if (currentOrderFilter === "inativos") {
    return status === "cancelado" || status === "recusado";
  }
  
  if (currentOrderFilter === "ativos") {
    return status !== "cancelado" && status !== "recusado";
  }
  
  if (currentOrderFilter === "pendentes") {
    return status === "pendente" || status === "novo";
  }
  
  if (currentOrderFilter === "confirmados") {
    return status === "confirmado";
  }
  
  if (currentOrderFilter === "orcamentos") {
    return status === "orçamento";
  }
  
  return true;
}

function renderOrders() {
  const container = document.getElementById("ordersContainer");
  if (!container) return;

  // Aplica o filtro selecionado na tela
  const filteredOrders = orders.filter(orderMatchesFilter);

  if (!filteredOrders.length) {
    container.innerHTML = `<div class="card"><h3>Nenhum pedido encontrado</h3><p class="muted">Não há pedidos com o filtro selecionado no momento.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="card" style="padding:0;overflow:auto;">
      <table class="table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Cliente</th>
            <th>Data</th>
            <th>Previsão</th>
            <th>Entrega</th>
            <th>Status</th>
            <th>Valor</th>
            <th>NF-e</th>
            <th>Pagamento</th>
            <th style="text-align:right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filteredOrders.map(order => {
            const client = order.gestao_loja_clientes;
            const clientName = client?.nome || "Cliente não informado";
            const isPJ = isPessoaJuridica(client);
            const clientLabel = clientName + (isPJ && client?.inscricao_estadual ? ` · IE ${client.inscricao_estadual}` : "");

            let entregaCell = `<span class="muted">Entrega</span>`;
            if (isRetirada(order)) {
              entregaCell = `<span style="display:inline-block;padding:3px 8px;border-radius:12px;background:#ede9fe;color:#5145cd;font-size:11px;font-weight:600;">🏬 Retirada</span>`;
            }

            const status = order.status || "Pendente";
            const nota = (window.__notasPorPedido || {})[order.id];
            let nfCell = "<span class='muted'>—</span>";
            
            if (nota) {
              let cor = "#b06a00";
              if (nota.status === "autorizada") cor = "#0a7d28";
              else if (nota.status === "cancelada") cor = "#6b6b6b";
              else if (nota.status === "rejeitada" || nota.status === "erro") cor = "#a80000";
              nfCell = `<span style="color:${cor};font-weight:600;cursor:pointer;" title="Clique para ver detalhes da NF-e" onclick="viewOrder(${order.id})">${escapeHtml(nota.numero || "s/nº")} · ${escapeHtml(nota.status || "")}</span>`;
            }

            const pagInfo = getPagamentoInfo(order);
            let pagCell = `<span style="color:${pagInfo.cor};font-weight:600;font-size:12px;">${escapeHtml(pagInfo.texto)}</span>`;

            if ((isPending(order) || isConfirmed(order)) && pagInfo.restante > 0) {
              pagCell += `
                <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;">
                  <button class="btn btn-secondary" style="font-size:11px;padding:3px 6px;" onclick="openPaymentForm(${order.id}, 'adiantamento')" title="Registrar adiantamento">+ Adiantar</button>
                  <button class="btn btn-primary" style="font-size:11px;padding:3px 6px;" onclick="openPaymentForm(${order.id}, 'restante')" title="Pagar valor restante">✓ Pagar restante</button>
                </div>
              `;
            }

            const previsaoCell = order.data_previsao_entrega 
              ? `<span style="color:#0284c7;font-weight:600;">${formatDate(order.data_previsao_entrega)}</span>` 
              : `<span class="muted">—</span>`;

            return `
              <tr>
                <td><strong>#${order.numero}</strong></td>
                <td>${escapeHtml(clientLabel)}</td>
                <td>${formatDate(order.data_pedido)}</td>
                <td>${previsaoCell}</td>
                <td>${entregaCell}</td>
                <td><span class="status ${orderStatusClass(status)}">${escapeHtml(status)}</span></td>
                <td><strong>${orderMoney(order.valor_total)}</strong></td>
                <td>${nfCell}</td>
                <td>${pagCell}</td>
                <td style="text-align:right;">
                  <button class="btn btn-secondary" onclick="viewOrder(${order.id})">Visualizar</button>
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
   OPÇÕES DE SELECT
   ====================================================== */

function buildClientOptions(selectedId = "") {
  return `<option value="">Selecione o cliente</option>` + clients.map(c => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("");
}

function buildProductOptions(selectedId = "") {
  return `<option value="">Selecione o produto</option>` + products.map(p => `<option value="${p.id}" ${String(p.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(p.nome)}</option>`).join("");
}


/* ======================================================
   CADASTRO DE CLIENTE
   ====================================================== */

function openClientForm() {
  openModal("Cadastrar cliente", clientFormFromOrder());
  toggleClientTypeFieldsOrder();
}

function clientFormFromOrder() {
  return `
    <div class="form-grid">
      <div class="form-section-title">Identificação</div>
      <div class="form-group">
        <label>Tipo de cliente *</label>
        <select id="c_tipo_cliente" onchange="toggleClientTypeFieldsOrder()">
          <option value="Pessoa Física">Pessoa Física</option>
          <option value="Pessoa Jurídica">Pessoa Jurídica</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="c_ativo"><option value="true" selected>Ativo</option><option value="false">Inativo</option></select>
      </div>
      <div class="form-group full"><label>Nome / Razão social *</label><input type="text" id="c_nome" placeholder="Nome completo ou razão social"></div>
      <div class="form-group full pj-field hidden-field"><label>Nome fantasia</label><input type="text" id="c_nome_fantasia" placeholder="Nome fantasia da empresa"></div>
      <div class="form-group"><label>CPF / CNPJ</label><input type="text" id="c_cpf_cnpj" placeholder="Somente números"></div>
      <div class="form-group pj-field hidden-field"><label>Inscrição Estadual</label><input type="text" id="c_inscricao_estadual" placeholder="IE ou ISENTO"><small class="form-hint">Use ISENTO se não contribuinte</small></div>
      <div class="form-group pj-field hidden-field">
        <label>Indicador de IE</label>
        <select id="c_indicador_ie"><option value="1">1 - Contribuinte ICMS</option><option value="2">2 - Contribuinte isento</option><option value="9" selected>9 - Não contribuinte</option></select>
      </div>
      <div class="form-group pj-field hidden-field"><label>Inscrição Municipal</label><input type="text" id="c_inscricao_municipal" placeholder="Opcional"></div>
      <div class="form-section-title">Contato</div>
      <div class="form-group"><label>E-mail</label><input type="email" id="c_email" placeholder="cliente@email.com"></div>
      <div class="form-group"><label>Telefone</label><input type="text" id="c_telefone" placeholder="Telefone"></div>
      <div class="form-group"><label>WhatsApp</label><input type="text" id="c_whatsapp" placeholder="WhatsApp"></div>
      <div class="form-section-title">Endereço</div>
      <div class="form-group"><label>CEP</label><input type="text" id="c_cep" placeholder="00000-000"></div>
      <div class="form-group"><label>Endereço</label><input type="text" id="c_endereco" placeholder="Rua, avenida..."></div>
      <div class="form-group"><label>Número</label><input type="text" id="c_numero" placeholder="Número"></div>
      <div class="form-group"><label>Complemento</label><input type="text" id="c_complemento" placeholder="Complemento"></div>
      <div class="form-group"><label>Bairro</label><input type="text" id="c_bairro" placeholder="Bairro"></div>
      <div class="form-group"><label>Cidade</label><input type="text" id="c_cidade" placeholder="Cidade"></div>
      <div class="form-group"><label>Estado (UF)</label><input type="text" id="c_estado" maxlength="2" placeholder="MG" style="text-transform:uppercase;"></div>
      <div class="form-section-title">Observações</div>
      <div class="form-group full"><label>Observações</label><textarea id="c_observacoes" placeholder="Observações internas"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" type="button" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" type="button" onclick="saveClientFromOrder()" id="saveClientFromOrderButton">Salvar cliente</button>
    </div>
  `;
}

function toggleClientTypeFieldsOrder() {
  const type = document.getElementById("c_tipo_cliente")?.value || "";
  const isPJ = isPessoaJuridica({ tipo_cliente: type });
  document.querySelectorAll(".pj-field").forEach(field => { field.classList.toggle("hidden-field", !isPJ); });
}

async function saveClientFromOrder() {
  const name = document.getElementById("c_nome").value.trim();
  if (!name) { alert("Informe o nome do cliente."); return; }
  if (!currentStore || !currentStore.id_loja) { alert("Loja não identificada."); return; }

  const tipoCliente = document.getElementById("c_tipo_cliente").value;
  const isPJ = isPessoaJuridica({ tipo_cliente: tipoCliente });
  const cpfCnpj = (document.getElementById("c_cpf_cnpj").value || "").replace(/\D/g, "");

  if (isPJ) {
    if (cpfCnpj && cpfCnpj.length !== 14) { alert("O CNPJ deve ter 14 dígitos.\n\nValor informado: " + cpfCnpj); return; }
    const ie = (document.getElementById("c_inscricao_estadual")?.value || "").trim().toUpperCase();
    if (!ie) {
      const continuar = confirm("A Inscrição Estadual não foi informada.\n\nSem ela, o cliente será tratado como não contribuinte (indicador 9).\n\nDeseja continuar?");
      if (!continuar) return;
    }
  } else {
    if (cpfCnpj && cpfCnpj.length !== 11) { alert("O CPF deve ter 11 dígitos.\n\nValor informado: " + cpfCnpj); return; }
  }

  const payload = {
    id_loja: currentStore.id_loja, tipo_cliente: tipoCliente, nome: name,
    razao_social: isPJ ? name : null,
    nome_fantasia: isPJ ? (document.getElementById("c_nome_fantasia")?.value.trim() || null) : null,
    cpf_cnpj: cpfCnpj || null,
    inscricao_estadual: isPJ ? (document.getElementById("c_inscricao_estadual")?.value.trim() || null) : null,
    indicador_ie: isPJ ? (document.getElementById("c_indicador_ie")?.value || "9") : "9",
    inscricao_municipal: isPJ ? (document.getElementById("c_inscricao_municipal")?.value.trim() || null) : null,
    email: document.getElementById("c_email").value.trim() || null,
    telefone: document.getElementById("c_telefone").value.trim() || null,
    whatsapp: document.getElementById("c_whatsapp").value.trim() || null,
    cep: document.getElementById("c_cep").value.trim() || null,
    endereco: document.getElementById("c_endereco").value.trim() || null,
    numero: document.getElementById("c_numero").value.trim() || null,
    complemento: document.getElementById("c_complemento").value.trim() || null,
    bairro: document.getElementById("c_bairro").value.trim() || null,
    cidade: document.getElementById("c_cidade").value.trim() || null,
    estado: document.getElementById("c_estado").value.trim().toUpperCase() || null,
    observacoes: document.getElementById("c_observacoes").value.trim() || null,
    ativo: document.getElementById("c_ativo").value === "true"
  };

  const button = document.getElementById("saveClientFromOrderButton");
  if (button) { button.disabled = true; button.textContent = "Salvando..."; }

  try {
    const result = await db.from("gestao_loja_clientes").insert(payload).select().single();
    if (result.error) throw result.error;
    const newClient = result.data;
    clients.push(newClient);
    clients.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    closeModal();
    const orderSelect = document.getElementById("orderClient");
    if (orderSelect) { orderSelect.innerHTML = buildClientOptions(newClient.id); changeOrderClient(newClient.id); }
    alert("Cliente cadastrado com sucesso.");
  } catch (error) {
    alert("Erro ao cadastrar cliente:\n" + error.message);
  } finally {
    if (button) { button.disabled = false; button.textContent = "Salvar cliente"; }
  }
}

function changeTipoEntrega(tipo) {
  const enderecoBlock = document.getElementById("orderAddressBlock");
  const freteInput = document.getElementById("orderFreight");
  if (enderecoBlock) enderecoBlock.style.display = tipo === "retirada" ? "none" : "block";
  if (freteInput) {
    if (tipo === "retirada") { freteInput.value = "0"; freteInput.disabled = true; }
    else { freteInput.disabled = false; }
  }
  updateOrderSummary();
}


/* ======================================================
   FORMULÁRIO DO PEDIDO
   ====================================================== */

function buildOrderForm() {
  return `
    <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:15px;">
      <div>
        <label>Cliente</label>
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <div style="flex:1;"><select id="orderClient" onchange="changeOrderClient(this.value)">${buildClientOptions()}</select></div>
          <button type="button" class="btn btn-secondary" onclick="openClientForm()">+ Cadastrar cliente</button>
        </div>
      </div>
      <div>
        <label>Data do pedido</label>
        <input type="date" id="orderDate">
      </div>
    </div>

    <div class="entrega-toggle" style="margin-top:20px;">
      <strong style="font-size:13px;color:#555d6d;">Tipo de entrega:</strong>
      <label><input type="radio" name="tipo_entrega" value="entrega" checked onchange="changeTipoEntrega(this.value)"> Entrega no endereço</label>
      <label><input type="radio" name="tipo_entrega" value="retirada" onchange="changeTipoEntrega(this.value)"> Retirada na loja</label>
    </div>

    <div id="orderAddressBlock" style="padding:15px;border:1px solid #ddd;border-radius:8px;margin-bottom:15px;">
      <strong>Endereço de entrega</strong>
      <div class="muted" style="font-size:13px;margin-top:4px;margin-bottom:15px;">O endereço será preenchido automaticamente pelo cadastro do cliente e poderá ser editado.</div>
      <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:15px;">
        <div><label>CEP</label><input type="text" id="orderCep" placeholder="00000-000"></div>
        <div><label>Endereço</label><input type="text" id="orderAddress" placeholder="Rua, avenida..."></div>
        <div><label>Número</label><input type="text" id="orderNumber"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;margin-top:15px;">
        <div><label>Complemento</label><input type="text" id="orderComplement"></div>
        <div><label>Bairro</label><input type="text" id="orderNeighborhood"></div>
        <div><label>Cidade</label><input type="text" id="orderCity"></div>
      </div>
      <div style="width:150px;margin-top:15px;"><label>Estado</label><input type="text" id="orderState" maxlength="2" placeholder="MG"></div>
    </div>

    <div style="margin-top:25px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
        <h3 style="margin:0;">Produtos do pedido</h3>
        <button type="button" class="btn btn-primary" onclick="addOrderItem()">+ Adicionar produto</button>
      </div>
      <div id="orderItems"></div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:15px; margin-top:20px;">
      <div>
        <label>Prazo de entrega</label>
        <input type="text" id="orderDeliveryDeadline" placeholder="Ex.: 5 dias" oninput="calcularDataPrevisao()">
        <div id="previsaoDisplay" style="margin-top:5px; font-size:13px; color:#0284c7; font-weight:600;"></div>
      </div>
      <div>
        <label>Forma de pagamento</label>
        <input type="text" id="orderPayment" placeholder="Ex.: PIX, dinheiro...">
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-top:20px;">
      <div><label>Desconto</label><input type="number" id="orderDiscount" value="0" min="0" step="0.01" oninput="updateOrderSummary()"></div>
      <div><label>Acréscimo</label><input type="number" id="orderIncrease" value="0" min="0" step="0.01" oninput="updateOrderSummary()"></div>
      <div><label>Mão de obra</label><input type="number" id="orderLabor" value="0" min="0" step="0.01" oninput="updateOrderSummary()"></div>
      <div><label>Frete</label><input type="number" id="orderFreight" value="0" min="0" step="0.01" oninput="updateOrderSummary()"></div>
    </div>

    <div style="margin-top:20px;">
      <label>Observações</label>
      <textarea id="orderNotes" rows="4" placeholder="Observações do pedido..."></textarea>
    </div>

    <div style="margin-top:20px;padding:20px;background:#f5f5f5;border-radius:8px;">
      <div class="order-summary-row"><span>Subtotal</span><strong id="summarySubtotal">R$ 0,00</strong></div>
      <div class="order-summary-row"><span>Mão de obra</span><strong id="summaryLabor">R$ 0,00</strong></div>
      <div class="order-summary-row"><span>Frete</span><strong id="summaryFreight">R$ 0,00</strong></div>
      <div class="order-summary-row"><span>Acréscimo</span><strong id="summaryIncrease">R$ 0,00</strong></div>
      <div class="order-summary-row"><span>Desconto</span><strong id="summaryDiscount">R$ 0,00</strong></div>
      <hr>
      <div class="order-summary-row" style="font-size:20px;"><strong>Total</strong><strong id="summaryTotal">R$ 0,00</strong></div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:25px;">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="button" class="btn btn-primary" onclick="saveOrder()">Salvar pedido</button>
    </div>
  `;
}

function openNewOrder() {
  editingOrderId = null;
  currentOrderItems = [];
  const modal = document.getElementById("modal");
  modal.classList.remove("hidden");
  document.querySelector(".modal-card").style.maxWidth = "900px";
  document.getElementById("modalTitle").textContent = "Novo pedido";
  document.getElementById("modalContent").innerHTML = buildOrderForm();
  document.getElementById("orderDate").value = getToday();
  changeTipoEntrega("entrega");
  renderOrderItems();
  updateOrderSummary();
}

function changeOrderClient(clientId) {
  const client = clients.find(item => String(item.id) === String(clientId));
  const ids = ["orderCep","orderAddress","orderNumber","orderComplement","orderNeighborhood","orderCity","orderState"];
  if (!client) { ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; }); return; }
  if (getTipoEntregaFromForm() === "retirada") return;
  document.getElementById("orderCep").value = client.cep || "";
  document.getElementById("orderAddress").value = client.endereco || "";
  document.getElementById("orderNumber").value = client.numero || "";
  document.getElementById("orderComplement").value = client.complemento || "";
  document.getElementById("orderNeighborhood").value = client.bairro || "";
  document.getElementById("orderCity").value = client.cidade || "";
  document.getElementById("orderState").value = client.estado || "";
}


/* ======================================================
   ITENS DO PEDIDO E RESUMO
   ====================================================== */

function addOrderItem() {
  currentOrderItems.push({
    produto_id: "", variacao_id: "", quantidade: 1, preco_unitario: 0,
    desconto: 0, desconto_tipo: "R$", desconto_modo: "total", observacao: ""
  });
  renderOrderItems();
  updateOrderSummary();
}

function removeOrderItem(index) {
  currentOrderItems.splice(index, 1);
  renderOrderItems();
  updateOrderSummary();
}

function changeItemDiscountMode(index, value) {
  if (!currentOrderItems[index]) return;
  currentOrderItems[index].desconto_modo = value === "unidade" ? "unidade" : "total";
  renderOrderItems();
  updateOrderSummary();
}

function renderOrderItems() {
  const container = document.getElementById("orderItems");
  if (!container) return;
  if (!currentOrderItems.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;border:1px dashed #ccc;border-radius:8px;"><span class="muted">Nenhum produto adicionado ao pedido.</span></div>`;
    return;
  }
  container.innerHTML = currentOrderItems.map((item, index) => {
    const productVariations = variations.filter(v => String(v.produto_id) === String(item.produto_id));
    const itemSubtotalBruto = (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);
    const itemSubtotal = calcularSubtotalItem(item);
    const descontoReal = calcularDescontoItem(item);
    const unitarioFinal = calcularValorUnitarioFinal(item);
    const tipoDesc = item.desconto_tipo || "R$";
    const modoDesc = item.desconto_modo || "total";
    const temDesconto = descontoReal > 0.005;
    const qtd = Number(item.quantidade) || 0;

    return `
      <div style="padding:15px;border:1px solid #ddd;border-radius:8px;margin-bottom:15px;">
        <div style="display:grid;grid-template-columns:2fr 2fr 1fr 1fr auto;gap:10px;align-items:end;">
          <div><label>Produto</label><select onchange="changeItemProduct(${index}, this.value)">${buildProductOptions(item.produto_id)}</select></div>
          <div><label>Variação</label><select onchange="changeItemVariation(${index}, this.value)" ${!productVariations.length ? "disabled" : ""}><option value="">${productVariations.length ? "Selecione" : "Sem variação"}</option>${productVariations.map(v => `<option value="${v.id}" ${String(v.id) === String(item.variacao_id) ? "selected" : ""}>${escapeHtml(v.nome)}</option>`).join("")}</select></div>
          <div><label>Quantidade</label><input type="number" min="0.001" step="0.001" value="${item.quantidade}" onchange="changeItemQuantity(${index}, this.value)"></div>
          <div><label>Preço unitário</label><input type="number" min="0" step="0.01" value="${item.preco_unitario}" onchange="changeItemPrice(${index}, this.value)"></div>
          <button type="button" class="btn btn-danger" onclick="removeOrderItem(${index})">×</button>
        </div>

        <!-- LINHA DE DESCONTO POR ITEM -->
        <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #e5e8ed;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr 1.2fr;gap:10px;align-items:end;">

            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#555d6d;margin-bottom:4px;">Modo do desconto</label>
              <select onchange="changeItemDiscountMode(${index}, this.value)" style="width:100%;padding:10px;border:1px solid #d8dce5;border-radius:7px;background:#fff;">
                <option value="total" ${modoDesc === "total" ? "selected" : ""}>Total do item</option>
                <option value="unidade" ${modoDesc === "unidade" ? "selected" : ""}>Por unidade</option>
              </select>
            </div>

            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#555d6d;margin-bottom:4px;">Desconto</label>
              <div style="display:flex;gap:5px;">
                <input type="number" min="0" step="0.01" value="${item.desconto || 0}" onchange="changeItemDiscountValue(${index}, this.value)" style="flex:1;">
                <select onchange="changeItemDiscountType(${index}, this.value)" style="width:60px;border:1px solid #d8dce5;border-radius:7px;padding:0 5px;font-weight:600;background:#fff;">
                  <option value="R$" ${tipoDesc === "R$" ? "selected" : ""}>R$</option>
                  <option value="%" ${tipoDesc === "%" ? "selected" : ""}>%</option>
                </select>
              </div>
            </div>

            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:#555d6d;margin-bottom:4px;">Valor final unitário</label>
              <div style="padding:10px;background:${temDesconto ? "#ecfdf3" : "#f8f9fb"};border:1px solid ${temDesconto ? "#a7f3d0" : "#e1e4ea"};border-radius:7px;font-weight:600;color:${temDesconto ? "#067647" : "#343a46"};">
                ${orderMoney(unitarioFinal)} <span style="font-weight:400;font-size:11px;color:#6b7280;">/un${qtd !== 1 ? ` × ${orderNumber(qtd)}` : ""}</span>
              </div>
            </div>

            <div style="text-align:right;">
              ${temDesconto ? `
                <div style="font-size:11px;color:#6b7280;">Bruto: <s>${orderMoney(itemSubtotalBruto)}</s></div>
                <div style="font-size:11px;color:#067647;font-weight:600;">Desconto aplicado: ${orderMoney(descontoReal)}${modoDesc === "unidade" && qtd > 1 ? ` <span style="font-weight:400;">(${orderMoney(descontoReal / qtd)}/un)</span>` : ""}</div>
              ` : `<div style="font-size:11px;color:#9ca3af;">Sem desconto</div>`}
              <div style="font-size:14px;margin-top:4px;"><strong>Subtotal: ${orderMoney(itemSubtotal)}</strong></div>
            </div>

          </div>
        </div>

        <div style="margin-top:10px;"><label>Observação do item</label><input type="text" value="${escapeHtml(item.observacao || "")}" onchange="changeItemObservation(${index}, this.value)" placeholder="Observação..."></div>
      </div>
    `;
  }).join("");
}

function changeItemProduct(index, productId) {
  const item = currentOrderItems[index];
  if (!item) return;
  item.produto_id = productId;
  item.variacao_id = "";
  const product = products.find(p => String(p.id) === String(productId));
  item.preco_unitario = product ? Number(product.preco_venda) || 0 : 0;
  renderOrderItems(); updateOrderSummary();
}

function changeItemVariation(index, variationId) {
  const item = currentOrderItems[index];
  if (!item) return;
  item.variacao_id = variationId;
  if (variationId) {
    const v = variations.find(v => String(v.id) === String(variationId));
    if (v) item.preco_unitario = Number(v.preco_venda) || 0;
  } else {
    const p = products.find(p => String(p.id) === String(item.produto_id));
    if (p) item.preco_unitario = Number(p.preco_venda) || 0;
  }
  renderOrderItems(); updateOrderSummary();
}

function changeItemQuantity(index, value) {
  if (!currentOrderItems[index]) return;
  currentOrderItems[index].quantidade = Number(value) || 0;
  renderOrderItems(); updateOrderSummary();
}

function changeItemPrice(index, value) {
  if (!currentOrderItems[index]) return;
  currentOrderItems[index].preco_unitario = Number(value) || 0;
  renderOrderItems(); updateOrderSummary();
}

function changeItemObservation(index, value) {
  if (!currentOrderItems[index]) return;
  currentOrderItems[index].observacao = value;
}

/* NOVOS HANDLERS — DESCONTO POR ITEM */
function changeItemDiscountValue(index, value) {
  if (!currentOrderItems[index]) return;
  currentOrderItems[index].desconto = Number(value) || 0;
  renderOrderItems(); updateOrderSummary();
}

function changeItemDiscountType(index, value) {
  if (!currentOrderItems[index]) return;
  currentOrderItems[index].desconto_tipo = value === "%" ? "%" : "R$";
  renderOrderItems(); updateOrderSummary();
}

function updateOrderSummary() {
  let subtotal = 0;
  currentOrderItems.forEach(item => {
    subtotal += calcularSubtotalItem(item);
  });
  const discount = getNumberValue("orderDiscount");
  const increase = getNumberValue("orderIncrease");
  const labor = getNumberValue("orderLabor");
  const frete = getNumberValue("orderFreight");
  const total = subtotal + labor + frete + increase - discount;

  const values = { summarySubtotal: subtotal, summaryLabor: labor, summaryFreight: frete, summaryIncrease: increase, summaryDiscount: discount, summaryTotal: Math.max(total, 0) };
  Object.keys(values).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = orderMoney(values[id]);
  });
}

function getDeliveryAddress() {
  if (getTipoEntregaFromForm() === "retirada") return "Retirada na loja";
  const cep = document.getElementById("orderCep")?.value.trim() || "";
  const address = document.getElementById("orderAddress")?.value.trim() || "";
  const number = document.getElementById("orderNumber")?.value.trim() || "";
  const complement = document.getElementById("orderComplement")?.value.trim() || "";
  const neighborhood = document.getElementById("orderNeighborhood")?.value.trim() || "";
  const city = document.getElementById("orderCity")?.value.trim() || "";
  const state = document.getElementById("orderState")?.value.trim() || "";

  const lines = [];
  if (cep) lines.push(`CEP: ${cep}`);
  if (address) lines.push(`Endereço: ${address}${number ? `, Nº ${number}` : ""}`);
  if (complement) lines.push(`Complemento: ${complement}`);
  if (neighborhood) lines.push(`Bairro: ${neighborhood}`);
  if (city || state) lines.push(`Cidade: ${city}${state ? " - " + state : ""}`);
  return lines.join("\n");
}


/* ======================================================
   SALVAR PEDIDO
   ====================================================== */

async function saveOrder() {
  if (!currentOrderItems.length) { alert("Adicione pelo menos um produto ao pedido."); return; }
  const clientId = document.getElementById("orderClient").value;
  if (!clientId) { alert("Selecione um cliente."); return; }

  for (const item of currentOrderItems) {
    if (!item.produto_id) { alert("Selecione o produto de todos os itens."); return; }
    if (!item.quantidade || Number(item.quantidade) <= 0) { alert("Informe uma quantidade válida para todos os produtos."); return; }
  }

  const dataPrevisao = calcularDataPrevisao();

  const subtotal = currentOrderItems.reduce((total, item) => {
    return total + calcularSubtotalItem(item);
  }, 0);

  const desconto = getNumberValue("orderDiscount");
  const acrescimo = getNumberValue("orderIncrease");
  const maoDeObra = getNumberValue("orderLabor");
  const frete = getNumberValue("orderFreight");

  const valorTotal = Math.max(subtotal - desconto + acrescimo + frete + maoDeObra, 0);
  const subtotalFinal = Number(subtotal.toFixed(2));
  const descontoFinal = Number(desconto.toFixed(2));
  const acrescimoFinal = Number(acrescimo.toFixed(2));
  const freteFinal = Number(frete.toFixed(2));
  const maoDeObraFinal = Number(maoDeObra.toFixed(2));
  const valorTotalFinal = Number(valorTotal.toFixed(2));

  const baseOrderData = {
    id_loja: currentStore.id_loja,
    cliente_id: Number(clientId),
    data_pedido: document.getElementById("orderDate").value,
    tipo_entrega: getTipoEntregaFromForm(),
    subtotal: subtotalFinal,
    desconto: descontoFinal,
    acrescimo: acrescimoFinal,
    frete: freteFinal,
    mao_de_obra: maoDeObraFinal,
    valor_total: valorTotalFinal,
    prazo_entrega: document.getElementById("orderDeliveryDeadline").value.trim(),
    data_previsao_entrega: dataPrevisao,
    forma_pagamento: document.getElementById("orderPayment").value.trim(),
    endereco_entrega: getDeliveryAddress(),
    observacoes: document.getElementById("orderNotes").value.trim()
  };

  if (editingOrderId) {
    const orderData = { ...baseOrderData, status: "Pendente" };
    const { data: updatedOrder, error: orderError } = await db.from("gestao_loja_pedidos").update(orderData).eq("id", editingOrderId).eq("id_loja", currentStore.id_loja).select().single();
    if (orderError) { alert("Erro ao atualizar pedido:\n" + orderError.message); return; }

    const { error: deleteItemsError } = await db.from("gestao_loja_pedidos_itens").delete().eq("pedido_id", editingOrderId);
    if (deleteItemsError) { alert("Erro ao atualizar os itens:\n" + deleteItemsError.message); return; }

    const itemsData = currentOrderItems.map(item => {
      const quantidade = Number(item.quantidade) || 0;
      const precoUnitario = Number(item.preco_unitario) || 0;
      const descontoReal = calcularDescontoItem(item);
      const subtotalItem = calcularSubtotalItem(item);

      return {
        id_loja: currentStore.id_loja, pedido_id: updatedOrder.id, produto_id: Number(item.produto_id),
        variacao_id: item.variacao_id ? Number(item.variacao_id) : null, quantidade: quantidade,
        preco_unitario: precoUnitario, desconto: Number(descontoReal.toFixed(2)), subtotal: Number(subtotalItem.toFixed(2)), observacao: item.observacao || null
      };
    });

    const { error: itemsError } = await db.from("gestao_loja_pedidos_itens").insert(itemsData);
    if (itemsError) { alert("Erro ao salvar os itens do pedido:\n" + itemsError.message); return; }

    editingOrderId = null; currentOrderItems = [];
    closeModal(); await loadOrders();
    alert("Pedido atualizado com sucesso.\n\nTotal: R$ " + valorTotalFinal.toFixed(2).replace(".", ","));
    return;
  }

  try {
    const numeroPedido = await proximaSequenciaPedido();
    const orderData = { ...baseOrderData, numero: numeroPedido, status: "Pendente" };
    const { data: order, error } = await db.from("gestao_loja_pedidos").insert(orderData).select().single();
    if (error) { alert("Erro ao salvar pedido:\n" + error.message); return; }

    const itemsData = currentOrderItems.map(item => {
      const quantidade = Number(item.quantidade) || 0;
      const precoUnitario = Number(item.preco_unitario) || 0;
      const descontoReal = calcularDescontoItem(item);
      const subtotalItem = calcularSubtotalItem(item);

      return {
        id_loja: currentStore.id_loja, pedido_id: order.id, produto_id: Number(item.produto_id),
        variacao_id: item.variacao_id ? Number(item.variacao_id) : null, quantidade: quantidade,
        preco_unitario: precoUnitario, desconto: Number(descontoReal.toFixed(2)), subtotal: Number(subtotalItem.toFixed(2)), observacao: item.observacao || null
      };
    });

    const { error: itemsError } = await db.from("gestao_loja_pedidos_itens").insert(itemsData);
    if (itemsError) {
      await db.from("gestao_loja_pedidos").delete().eq("id", order.id);
      alert("Erro ao salvar os itens do pedido:\n" + itemsError.message);
      return;
    }

    closeModal(); await loadOrders();
    alert("Pedido salvo com sucesso.\n\nNúmero: #" + numeroPedido + "\nTotal: R$ " + valorTotalFinal.toFixed(2).replace(".", ","));
  } catch (error) {
    alert("Erro ao salvar pedido:\n" + (error.message || "Erro desconhecido."));
  }
}


/* ======================================================
   VISUALIZAR, EDITAR, ACEITAR, ETC.
   ====================================================== */

async function viewOrder(orderId) {
  const { data: order, error: orderError } = await db.from("gestao_loja_pedidos").select(`*, gestao_loja_clientes (*)`).eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (orderError) { alert("Erro ao carregar pedido:\n" + orderError.message); return; }

  const { data: items, error: itemsError } = await db.from("gestao_loja_pedidos_itens").select(`*, gestao_loja_produtos (*), gestao_loja_produtos_variacoes (*)`).eq("pedido_id", orderId).order("id");
  if (itemsError) { alert("Erro ao carregar itens:\n" + itemsError.message); return; }

  const { data: nota } = await db.from("gestao_loja_notas_fiscais").select("*").eq("pedido_id", orderId).eq("id_loja", currentStore.id_loja).order("id", { ascending: false }).limit(1).maybeSingle();
  const { data: pagamentos } = await db.from("gestao_loja_movimentos_financeiros").select("*").eq("pedido_id", orderId).eq("id_loja", currentStore.id_loja).eq("tipo", "Entrada").eq("status", "Registrado").order("id");

  const client = order.gestao_loja_clientes;
  const isPJ = isPessoaJuridica(client);
  const canEmitNFe = isConfirmed(order) && isPJ && !nota;
  const pedidoRetirada = isRetirada(order);
  const listaPagamentos = pagamentos || [];
  const totalPago = listaPagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
  const valorTotalPedido = Number(order.valor_total || 0);
  const restante = Math.max(valorTotalPedido - totalPago, 0);
  const totalmentePago = restante <= 0.005;
  const status = order.status || "Pendente";

  document.getElementById("modal").classList.remove("hidden");
  document.querySelector(".modal-card").style.maxWidth = "1100px";
  document.getElementById("modalTitle").textContent = `Pedido #${order.numero}`;

  const itemsHtml = (items || []).map(item => {
    const product = item.gestao_loja_produtos;
    const variation = item.gestao_loja_produtos_variacoes;
    const descontoItem = Number(item.desconto || 0);
    return `
      <tr>
        <td>${escapeHtml(product?.nome || "-")}${variation?.nome ? `<br><small class="muted">${escapeHtml(variation.nome)}</small>` : ""}</td>
        <td>${orderNumber(item.quantidade)}</td>
        <td>${orderMoney(item.preco_unitario)}</td>
        <td>${descontoItem > 0.005 ? `<span style="color:#dc2626;">- ${orderMoney(descontoItem)}</span>` : `<span class="muted">—</span>`}</td>
        <td>${orderMoney(item.subtotal)}</td>
        <td>${escapeHtml(item.observacao || "")}</td>
      </tr>
    `;
  }).join("");

  let nfBlock = "";
  if (nota) {
    let cor = "#b06a00";
    if (nota.status === "autorizada") cor = "#0a7d28";
    else if (nota.status === "cancelada") cor = "#6b6b6b";
    else if (nota.status === "rejeitada" || nota.status === "erro") cor = "#a80000";

    nfBlock = `
      <div class="card" style="margin-top:20px;border-left:4px solid ${cor};">
        <h3 style="margin-top:0;">🧾 Nota Fiscal</h3>
        <p><strong>Número:</strong> ${escapeHtml(nota.numero || "-")} / Série ${escapeHtml(nota.serie || "-")}</p>
        <p><strong>Chave:</strong> <small>${escapeHtml(nota.chave || "-")}</small></p>
        <p><strong>Status:</strong> <span style="color:${cor};font-weight:600;">${escapeHtml(nota.status || "-")}</span></p>
        <p><strong>Emitida em:</strong> ${formatDateTime(nota.created_at)}</p>
        ${nota.mensagem ? `<p><strong>Mensagem:</strong> ${escapeHtml(nota.mensagem)}</p>` : ""}
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px;">
          ${nota.pdf_url ? `<button class="btn btn-secondary" onclick="openNfeFile('${nota.pdf_url}')">📄 Abrir DANFE (PDF)</button>` : ""}
          ${nota.xml_url ? `<button class="btn btn-secondary" onclick="openNfeFile('${nota.xml_url}')">📥 Baixar XML</button>` : ""}
          <button class="btn btn-secondary" onclick="refreshNfeStatus(${order.id})">🔄 Atualizar status</button>
          ${nota.status === "autorizada" ? `<button class="btn btn-danger" onclick="cancelNfe(${order.id})">✖ Cancelar NF-e</button>` : ""}
        </div>
      </div>
    `;
  }

  let pagamentosBlock = "";
  if (isConfirmed(order) || isPending(order) || listaPagamentos.length > 0) {
    const pagamentosHtml = listaPagamentos.length
      ? listaPagamentos.map(p => {
          const tipo = getTipoPagamento(p);
          const rotulo = tipo === "adiantamento" ? "Adiantamento" : tipo === "restante" ? "Pagamento do restante" : "Pagamento";
          return `
            <tr>
              <td>${formatDateTime(p.data_movimento || p.criado_em)}</td>
              <td>${escapeHtml(rotulo)}</td>
              <td>${escapeHtml(p.descricao || "-")}</td>
              <td>${escapeHtml(p.forma_pagamento || "-")}</td>
              <td><strong>${orderMoney(p.valor)}</strong></td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="5" class="muted" style="text-align:center;">Nenhum pagamento registrado.</td></tr>`;

    pagamentosBlock = `
      <div class="card" style="margin-top:20px;border-left:4px solid ${totalmentePago ? "#0a7d28" : "#b06a00"};">
        <h3 style="margin-top:0;">💰 Pagamentos</h3>
        <div class="order-summary-row"><span>Valor total do pedido</span><strong>${orderMoney(valorTotalPedido)}</strong></div>
        <div class="order-summary-row"><span>Total pago</span><strong style="color:#0a7d28;">${orderMoney(totalPago)}</strong></div>
        <div class="order-summary-row"><span>Restante</span><strong style="color:${totalmentePago ? "#0a7d28" : "#a80000"};">${orderMoney(restante)}</strong></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px;">
          ${!totalmentePago ? `
            <button class="btn btn-secondary" onclick="openPaymentForm(${order.id}, 'adiantamento')">+ Registrar adiantamento</button>
            <button class="btn btn-primary" onclick="openPaymentForm(${order.id}, 'restante')">✓ Pagar restante (${orderMoney(restante)})</button>
          ` : `<span style="color:#0a7d28;font-weight:600;padding:8px 0;">✓ Pedido totalmente pago</span>`}
        </div>
        ${listaPagamentos.length ? `
          <table class="table" style="margin-top:20px;">
            <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th>Valor</th></tr></thead>
            <tbody>${pagamentosHtml}</tbody>
          </table>
        ` : ""}
      </div>
    `;
  }

  const entregaBlock = pedidoRetirada
    ? `<div class="card" style="margin-top:20px;border-left:4px solid #5145cd;background:#f5f3ff;"><h3 style="margin-top:0;">🏬 Retirada na loja</h3><p class="muted" style="margin:8px 0 0;">Este pedido será retirado diretamente no estabelecimento. Não há endereço de entrega nem frete.</p></div>`
    : `<div class="card" style="margin-top:20px;"><h3>Endereço de entrega</h3><div style="white-space:pre-wrap;margin-top:10px;">${escapeHtml(String(order.endereco_entrega || "Endereço não informado.").trim())}</div></div>`;

  const recusaBlock = isRejected(order) && order.motivo_recusa
    ? `<div class="card" style="margin-top:20px;border-left:4px solid #b42318;background:#fdecec;"><h3 style="margin-top:0;color:#b42318;">❌ Pedido recusado</h3><p style="white-space:pre-wrap;margin:8px 0 0;"><strong>Motivo:</strong> ${escapeHtml(order.motivo_recusa)}</p>${order.recusado_em ? `<p class="muted" style="margin:6px 0 0;font-size:12px;">Recusado em ${formatDateTime(order.recusado_em)}</p>` : ""}</div>`
    : "";

  document.getElementById("modalContent").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="card">
        <h3>Dados do pedido</h3>
        <p><strong>Número:</strong> #${order.numero}</p>
        <p><strong>Data do Pedido:</strong> ${formatDate(order.data_pedido)}</p>
        <p><strong>Previsão de Entrega:</strong> <span style="color:#0284c7; font-weight:bold;">${order.data_previsao_entrega ? formatDate(order.data_previsao_entrega) : "-"}</span></p>
        <p><strong>Status:</strong> <span class="status ${orderStatusClass(status)}">${escapeHtml(status)}</span></p>
        <p><strong>Forma de pagamento:</strong> ${escapeHtml(order.forma_pagamento || "-")}</p>
        <p><strong>Prazo Informado:</strong> ${escapeHtml(order.prazo_entrega || "-")}</p>
      </div>
      <div class="card">
        <h3>Cliente</h3>
        <p><strong>${escapeHtml(client?.nome || "Cliente não informado")}</strong></p>
        ${isPJ && client?.nome_fantasia ? `<p><strong>Nome fantasia:</strong> ${escapeHtml(client.nome_fantasia)}</p>` : ""}
        <p><strong>${isPJ ? "CNPJ" : "CPF"}:</strong> ${escapeHtml(client?.cpf_cnpj || "-")}</p>
        ${isPJ ? `
          <p><strong>Inscrição Estadual:</strong> ${escapeHtml(client?.inscricao_estadual || "Não informada")}</p>
          <p><strong>Indicador de IE:</strong> ${escapeHtml(getIndicadorIeLabel(client?.indicador_ie))}</p>
          <p><strong>Inscrição Municipal:</strong> ${escapeHtml(client?.inscricao_municipal || "Não informada")}</p>
        ` : ""}
        <p><strong>Telefone:</strong> ${escapeHtml(client?.telefone || client?.whatsapp || "-")}</p>
        <p><strong>E-mail:</strong> ${escapeHtml(client?.email || "-")}</p>
        <p class="muted" style="margin-top:8px;font-size:12px;">Tipo: ${isPJ ? "Pessoa Jurídica" : "Pessoa Física"}</p>
      </div>
    </div>
    ${recusaBlock}
    ${entregaBlock}
    <div class="card" style="margin-top:20px;overflow:auto;">
      <h3>Produtos</h3>
      <table class="table" style="margin-top:15px;">
        <thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Desconto item</th><th>Subtotal</th><th>Observação</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
    <div class="card" style="margin-top:20px;max-width:500px;margin-left:auto;">
      <div class="order-summary-row"><span>Subtotal</span><strong>${orderMoney(order.subtotal)}</strong></div>
      <div class="order-summary-row"><span>Mão de obra</span><strong>${orderMoney(order.mao_de_obra)}</strong></div>
      <div class="order-summary-row"><span>Frete</span><strong>${orderMoney(order.frete)}</strong></div>
      <div class="order-summary-row"><span>Acréscimo</span><strong>${orderMoney(order.acrescimo)}</strong></div>
      <div class="order-summary-row"><span>Desconto</span><strong>${orderMoney(order.desconto)}</strong></div>
      <hr>
      <div class="order-summary-row" style="font-size:20px;"><strong>Total</strong><strong>${orderMoney(order.valor_total)}</strong></div>
    </div>
    ${nfBlock}
    ${pagamentosBlock}
    ${order.observacoes ? `<div class="card" style="margin-top:20px;"><h3>Observações</h3><div style="margin-top:8px;white-space:pre-wrap;">${escapeHtml(String(order.observacoes).trim())}</div></div>` : ""}
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:30px;flex-wrap:wrap;">
      <button class="btn btn-secondary" onclick="generateOrderPDF(${order.id})">📄 Gerar PDF</button>
      ${canEmitNFe ? `<button class="btn btn-primary" onclick="openInvoiceForm(${order.id})">🧾 Emitir NF-e</button>` : ""}
      ${isNew(order) ? `
        <button class="btn btn-primary" onclick="acceptOrder(${order.id})">✓ Aceitar pedido</button>
        <button class="btn btn-danger" onclick="rejectNewOrder(${order.id})">✖ Recusar pedido</button>
        <button class="btn btn-secondary" onclick="cancelOrder(${order.id})">Cancelar pedido</button>
      ` : isOrcamento(order) ? `
        <button class="btn btn-secondary" onclick="editOrder(${order.id})">Editar</button>
        <button class="btn btn-primary" onclick="approveOrcamento(${order.id})">✓ Aprovar orçamento</button>
        <button class="btn btn-danger" onclick="rejectOrcamento(${order.id})">✖ Recusar orçamento</button>
      ` : isPending(order) ? `
        <button class="btn btn-secondary" onclick="editOrder(${order.id})">Editar</button>
        <button class="btn btn-primary" onclick="confirmOrder(${order.id})">Confirmar pedido</button>
        <button class="btn btn-danger" onclick="cancelOrder(${order.id})">Cancelar pedido</button>
      ` : ""}
      <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
    </div>
  `;
}

async function acceptOrder(orderId) {
  const { data: order, error: orderError } = await db.from("gestao_loja_pedidos").select("*").eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (orderError) { alert("Erro ao carregar pedido:\n" + orderError.message); return; }
  if (!order) { alert("Pedido não encontrado."); return; }
  if (!isNew(order)) { alert("Este pedido já foi aceito.\n\nStatus atual: " + (order.status || "não informado")); return; }

  const confirmed = confirm(`Deseja aceitar o pedido #${order.numero}?\n\nValor: ${orderMoney(order.valor_total)}\n\nAo aceitar, o pedido passará para "Pendente".`);
  if (!confirmed) return;

  const { error } = await db.from("gestao_loja_pedidos").update({ status: "Pendente", aprovado_em: new Date().toISOString(), aprovado_por: getCurrentUserId(), recusado_em: null, recusado_por: null, motivo_recusa: null }).eq("id", orderId).eq("id_loja", currentStore.id_loja);
  if (error) { alert("Erro ao aceitar pedido:\n" + error.message); return; }

  closeModal(); await loadOrders();
  alert("Pedido aceito com sucesso.\n\nAgora você pode editá-lo ou confirmá-lo.");
}

async function editOrder(orderId) {
  const { data: order, error: orderError } = await db.from("gestao_loja_pedidos").select("*").eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (orderError) { alert("Erro ao carregar pedido:\n" + orderError.message); return; }
  if (!isPending(order) && !isOrcamento(order)) { alert("Somente pedidos pendentes ou orçamentos podem ser editados."); return; }

  const { data: items, error: itemsError } = await db.from("gestao_loja_pedidos_itens").select("*").eq("pedido_id", orderId).order("id");
  if (itemsError) { alert("Erro ao carregar itens:\n" + itemsError.message); return; }

  editingOrderId = orderId;
  currentOrderItems = (items || []).map(item => ({
  produto_id: item.produto_id,
  variacao_id: item.variacao_id || "",
  quantidade: Number(item.quantidade),
  preco_unitario: Number(item.preco_unitario),
  desconto: Number(item.desconto || 0),
  desconto_tipo: "R$",
  desconto_modo: "total",
  observacao: item.observacao || ""
}));

  document.getElementById("modal").classList.remove("hidden");
  document.querySelector(".modal-card").style.maxWidth = "900px";
  document.getElementById("modalTitle").textContent = `Editar pedido #${order.numero}`;
  document.getElementById("modalContent").innerHTML = buildOrderForm();

  document.getElementById("orderClient").value = order.cliente_id || "";
  document.getElementById("orderDate").value = order.data_pedido || "";
  document.getElementById("orderDeliveryDeadline").value = order.prazo_entrega || "";
  document.getElementById("orderPayment").value = order.forma_pagamento || "";
  document.getElementById("orderDiscount").value = Number(order.desconto || 0);
  document.getElementById("orderIncrease").value = Number(order.acrescimo || 0);
  document.getElementById("orderLabor").value = Number(order.mao_de_obra || 0);
  document.getElementById("orderFreight").value = Number(order.frete || 0);
  document.getElementById("orderNotes").value = order.observacoes || "";

  calcularDataPrevisao();

  const tipoEntrega = order.tipo_entrega || (isRetirada(order) ? "retirada" : "entrega");
  const radioTipo = document.querySelector(`input[name="tipo_entrega"][value="${tipoEntrega}"]`);
  if (radioTipo) radioTipo.checked = true;

  changeTipoEntrega(tipoEntrega);
  changeOrderClient(order.cliente_id);
  renderOrderItems();
  updateOrderSummary();
}

async function confirmOrder(orderId) {
  const { data: order, error: orderError } = await db.from("gestao_loja_pedidos").select("*").eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (orderError) { alert("Erro ao carregar pedido:\n" + orderError.message); return; }
  if (!order) { alert("Pedido não encontrado."); return; }
  if (!isPending(order)) { alert("Este pedido não está pendente.\n\nStatus atual: " + (order.status || "não informado")); return; }

  const msgEstoque = currentStore.utiliza_estoque !== false ? "Ao confirmar, o estoque será movimentado." : "Esta loja não utiliza controle de estoque, então nenhuma quantidade será deduzida.";
  const confirmed = confirm(`Deseja confirmar o pedido #${order.numero}?\n\nValor: ${orderMoney(order.valor_total)}\n\n` + msgEstoque);
  if (!confirmed) return;

  try {
    if (currentStore.utiliza_estoque !== false) {
      const { error: rpcError } = await db.rpc("gestao_loja_confirmar_pedido", { p_pedido_id: Number(orderId) });
      if (rpcError) { alert("Erro ao confirmar pedido:\n" + rpcError.message); return; }
    } else {
      const { error: updateError } = await db.from("gestao_loja_pedidos").update({ status: "Confirmado" }).eq("id", orderId).eq("id_loja", currentStore.id_loja);
      if (updateError) { alert("Erro ao confirmar pedido:\n" + updateError.message); return; }
    }

    closeModal(); await loadOrders();
    alert("Pedido confirmado com sucesso!\n\n" + (currentStore.utiliza_estoque !== false ? "O estoque foi atualizado." : "Nenhuma alteração de estoque foi feita (opção desabilitada)."));
  } catch (error) {
    alert("Erro inesperado ao confirmar pedido:\n" + error.message);
  }
}

async function cancelOrder(orderId) {
  const { data: order, error: orderError } = await db.from("gestao_loja_pedidos").select("*").eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (orderError) { alert("Erro ao carregar pedido:\n" + orderError.message); return; }
  if (!order) { alert("Pedido não encontrado."); return; }
  if (!isPending(order) && !isNew(order)) { alert("Somente pedidos novos ou pendentes podem ser cancelados.\n\nStatus atual: " + (order.status || "não informado")); return; }

  const confirmed = confirm(`Deseja cancelar o pedido #${order.numero}?`);
  if (!confirmed) return;

  const { error } = await db.from("gestao_loja_pedidos").update({ status: "Cancelado" }).eq("id", orderId).eq("id_loja", currentStore.id_loja);
  if (error) { alert("Erro ao cancelar pedido:\n" + error.message); return; }

  closeModal(); await loadOrders();
  alert("Pedido cancelado.");
}


/* ======================================================
   APROVAR / RECUSAR ORÇAMENTO E PEDIDO NOVO
   ====================================================== */

async function approveOrcamento(orderId) {
  const { data: order, error } = await db.from("gestao_loja_pedidos").select("id, numero, status, valor_total").eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (error) { alert("Erro ao carregar orçamento:\n" + error.message); return; }
  if (!isOrcamento(order)) { alert("Somente orçamentos podem ser aprovados."); return; }

  const confirmed = confirm(`Aprovar o orçamento #${order.numero}?\n\nValor: ${orderMoney(order.valor_total)}\n\nAo aprovar, ele passará para PENDENTE e poderá ser confirmado na tela de pedidos.`);
  if (!confirmed) return;

  const { error: updateError } = await db.from("gestao_loja_pedidos").update({ status: "Pendente", aprovado_em: new Date().toISOString(), aprovado_por: getCurrentUserId(), recusado_em: null, recusado_por: null, motivo_recusa: null }).eq("id", orderId).eq("id_loja", currentStore.id_loja);
  if (updateError) { alert("Erro ao aprovar orçamento:\n" + updateError.message); return; }

  closeModal(); await loadOrders();
  alert("Orçamento aprovado.\n\nAgora ele está como PENDENTE e pode ser confirmado.");
}

async function rejectOrcamento(orderId) {
  const { data: order, error } = await db.from("gestao_loja_pedidos").select("id, numero, status, valor_total").eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (error) { alert("Erro ao carregar orçamento:\n" + error.message); return; }
  if (!isOrcamento(order)) { alert("Somente orçamentos podem ser recusados por aqui."); return; }
  openRejectOrderModal(order);
}

async function rejectNewOrder(orderId) {
  const { data: order, error } = await db.from("gestao_loja_pedidos").select("id, numero, status, valor_total").eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (error) { alert("Erro ao carregar pedido:\n" + error.message); return; }
  if (!isNew(order)) { alert("Somente pedidos novos podem ser recusados por aqui."); return; }
  openRejectOrderModal(order);
}

function openRejectOrderModal(order) {
  const modal = document.getElementById("modal");
  modal.classList.remove("hidden");
  document.querySelector(".modal-card").style.maxWidth = "520px";
  document.getElementById("modalTitle").textContent = `Recusar #${order.numero}`;

  document.getElementById("modalContent").innerHTML = `
    <p class="muted" style="margin-top:0;">Informe o motivo da recusa. O cliente verá esta observação.</p>
    <div class="form-group full">
      <label>Motivo da recusa *</label>
      <textarea id="rejectReason" rows="5" placeholder="Ex.: Produto indisponível em estoque, prazo inviável, dados incompletos..."></textarea>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Voltar</button>
      <button type="button" class="btn btn-danger" onclick="confirmRejectOrder(${order.id})">Confirmar recusa</button>
    </div>
  `;

  setTimeout(() => { document.getElementById("rejectReason")?.focus(); }, 50);
}

async function confirmRejectOrder(orderId) {
  const reason = (document.getElementById("rejectReason")?.value || "").trim();
  if (!reason) { alert("Informe o motivo da recusa."); return; }
  if (reason.length < 5) { alert("O motivo da recusa precisa ter pelo menos 5 caracteres."); return; }

  const { error } = await db.from("gestao_loja_pedidos").update({ status: "Recusado", motivo_recusa: reason, recusado_em: new Date().toISOString(), recusado_por: getCurrentUserId(), aprovado_em: null, aprovado_por: null }).eq("id", orderId).eq("id_loja", currentStore.id_loja);
  if (error) { alert("Erro ao recusar:\n" + error.message); return; }

  closeModal(); await loadOrders();
  alert("Recusa registrada. O cliente poderá ver o motivo.");
}


/* ======================================================
   PDF (com desconto por item)
   ====================================================== */

async function generateOrderPDF(orderId) {
  const { data: order, error: orderError } = await db.from("gestao_loja_pedidos").select(`*, gestao_loja_clientes (*)`).eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (orderError) { alert("Erro ao gerar PDF:\n" + orderError.message); return; }

  const { data: items, error: itemsError } = await db.from("gestao_loja_pedidos_itens").select(`*, gestao_loja_produtos (*), gestao_loja_produtos_variacoes (*)`).eq("pedido_id", orderId).order("id");
  if (itemsError) { alert("Erro ao carregar itens para o PDF:\n" + itemsError.message); return; }

  const client = order.gestao_loja_clientes;
  const isPJ = isPessoaJuridica(client);
  const pedidoRetirada = isRetirada(order);
  const storeName = escapeHtml(currentStore?.nome_fantasia || currentStore?.nome || "Gestão Loja");
  const storeDocument = escapeHtml(currentStore?.cnpj || "");
  
  const address = escapeHtml(String(order.endereco_entrega || "-").trim()).replace(/\n/g, "<br>");
  const obs = order.observacoes ? escapeHtml(String(order.observacoes).trim()).replace(/\n/g, "<br>") : "";

  const itemsHtml = (items || []).map(item => {
    const descontoItem = Number(item.desconto || 0);
    return `
      <tr>
        <td>${escapeHtml(item.gestao_loja_produtos?.nome || "-")} ${item.gestao_loja_produtos_variacoes?.nome ? `<br><small>${escapeHtml(item.gestao_loja_produtos_variacoes.nome)}</small>` : ""}</td>
        <td>${orderNumber(item.quantidade)}</td>
        <td>${orderMoney(item.preco_unitario)}</td>
        <td>${descontoItem > 0.005 ? `<span style="color:#dc2626;">- ${orderMoney(descontoItem)}</span>` : "-"}</td>
        <td>${orderMoney(item.subtotal)}</td>
      </tr>
    `;
  }).join("");

  const recusaPdfBlock = isRejected(order) && order.motivo_recusa
    ? `<div class="section" style="padding:12px;background:#fdecec;border-left:4px solid #b42318;border-radius:6px;"><strong style="color:#b42318;">PEDIDO RECUSADO</strong><br><span style="font-weight:bold;">Motivo:</span> ${escapeHtml(order.motivo_recusa)}</div>`
    : "";

  const pdfWindow = window.open("", "_blank", "width=900,height=700");
  if (!pdfWindow) { alert("O navegador bloqueou a janela do PDF. Permita pop-ups para este site."); return; }

  pdfWindow.document.open();
  pdfWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Pedido #${order.numero}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 30px; color: #222; font-size: 13px; line-height: 1.4; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #222; padding-bottom: 15px; margin-bottom: 20px; }
        .store { font-size: 22px; font-weight: bold; }
        .title { text-align: right; font-size: 22px; font-weight: bold; }
        .section { margin-top: 20px; page-break-inside: avoid; }
        .section-title { font-weight: bold; font-size: 15px; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 10px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; align-items: start; }
        .info-grid > div { text-align: left; page-break-inside: avoid; margin: 0; padding: 0; line-height: 1.4; }
        .info-label { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f2f2f2; }
        .totals { width: 350px; margin-left: auto; margin-top: 20px; page-break-inside: avoid; }
        .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .grand-total { font-size: 20px; font-weight: bold; border-top: 2px solid #222; margin-top: 8px; padding-top: 10px; }
        .observations { white-space: normal; line-height: 1.4; text-align: left; margin: 0; padding: 0; page-break-inside: avoid; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ccc; text-align: center; font-size: 11px; color: #666; }
        @media print {
          body { padding: 10px; }
          .info-grid > div, tr, td, .observations, .section { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="store">${storeName}</div>
          <div>${storeDocument}</div>
        </div>
        <div class="title">PEDIDO <div>#${order.numero}</div></div>
      </div>

      <div class="section">
        <div class="section-title">Dados do pedido</div>
        <div class="info-grid">
          <div><span class="info-label">Cliente:</span> ${escapeHtml(client?.nome || "-")}</div>
          <div><span class="info-label">Data do Pedido:</span> ${formatDate(order.data_pedido)}</div>
          <div><span class="info-label">Previsão de Entrega:</span> <strong>${order.data_previsao_entrega ? formatDate(order.data_previsao_entrega) : "-"}</strong></div>
          <div><span class="info-label">Status:</span> ${escapeHtml(order.status || "-")}</div>
          <div><span class="info-label">Telefone:</span> ${escapeHtml(client?.telefone || "-")}</div>
          <div><span class="info-label">Forma de Pagamento:</span> ${escapeHtml(order.forma_pagamento || "-")}</div>
          <div><span class="info-label">Prazo:</span> ${escapeHtml(order.prazo_entrega || "-")}</div>
          <div><span class="info-label">CPF/CNPJ:</span> ${escapeHtml(client?.cpf_cnpj || "-")}</div>
          ${isPJ ? `
            <div><span class="info-label">Inscrição Estadual:</span> ${escapeHtml(client?.inscricao_estadual || "-")}</div>
            <div><span class="info-label">Indicador de IE:</span> ${escapeHtml(getIndicadorIeLabel(client?.indicador_ie))}</div>
            <div><span class="info-label">Inscrição Municipal:</span> ${escapeHtml(client?.inscricao_municipal || "-")}</div>
          ` : ""}
        </div>
      </div>

      ${recusaPdfBlock}

      ${pedidoRetirada ? `
        <div class="section">
          <div class="section-title">Tipo de entrega</div>
          <div style="padding:10px;background:#f5f3ff;border-radius:6px;">
            <strong>RETIRADA NA LOJA</strong><br>
            <small>Este pedido não possui endereço de entrega nem frete.</small>
          </div>
        </div>
      ` : `
        <div class="section">
          <div class="section-title">Endereço de entrega</div>
          <div style="margin:0; padding:0; line-height: 1.4;">${address}</div>
        </div>
      `}

      <div class="section">
        <div class="section-title">Produtos</div>
        <table>
          <thead><tr><th>Produto</th><th>Qtd.</th><th>Valor unit.</th><th>Desconto</th><th>Subtotal</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>

      <div class="totals">
        <div class="total-row"><span>Subtotal</span><strong>${orderMoney(order.subtotal)}</strong></div>
        <div class="total-row"><span>Mão de obra</span><strong>${orderMoney(order.mao_de_obra)}</strong></div>
        <div class="total-row"><span>Frete</span><strong>${orderMoney(order.frete)}</strong></div>
        <div class="total-row"><span>Acréscimo</span><strong>${orderMoney(order.acrescimo)}</strong></div>
        <div class="total-row"><span>Desconto</span><strong>${orderMoney(order.desconto)}</strong></div>
        <div class="total-row grand-total"><span>TOTAL</span><span>${orderMoney(order.valor_total)}</span></div>
      </div>

      ${obs ? `
        <div class="section">
          <div class="section-title">Observações</div>
          <div class="observations">${obs}</div>
        </div>
      ` : ""}

      <div class="footer">Documento gerado pelo Gestão Loja</div>
    </body>
    </html>
  `);
  pdfWindow.document.close();
  setTimeout(() => { pdfWindow.focus(); pdfWindow.print(); }, 500);
}


/* ======================================================
   NF-e
   ====================================================== */

async function openInvoiceForm(orderId) {
  const { data: order, error: orderError } = await db.from("gestao_loja_pedidos").select(`*, gestao_loja_clientes (*)`).eq("id", orderId).eq("id_loja", currentStore.id_loja).single();
  if (orderError) { alert("Erro ao carregar pedido:\n" + orderError.message); return; }

  const client = order.gestao_loja_clientes;
  if (!isConfirmed(order)) { alert("Somente pedidos confirmados podem emitir NF-e."); return; }
  if (!isPessoaJuridica(client)) { alert("Este cliente não é Pessoa Jurídica.\n\nNF-e disponível apenas para clientes PJ."); return; }

  const { data: items, error: itemsError } = await db.from("gestao_loja_pedidos_itens").select(`*, gestao_loja_produtos (*), gestao_loja_produtos_variacoes (*)`).eq("pedido_id", orderId).order("id");
  if (itemsError) { alert("Erro ao carregar itens:\n" + itemsError.message); return; }

  const itemsHtml = (items || []).map((item, idx) => {
    const p = item.gestao_loja_produtos || {};
    const v = item.gestao_loja_produtos_variacoes;
    return `
      <tr>
        <td>${escapeHtml(p.nome || "-")}${v?.nome ? `<br><small class="muted">${escapeHtml(v.nome)}</small>` : ""}</td>
        <td>${orderNumber(item.quantidade)}</td>
        <td>${orderMoney(item.preco_unitario)}</td>
        <td><input type="text" id="ncm_${idx}" value="${escapeHtml(p.ncm || "")}" maxlength="8" placeholder="00000000" style="width:110px;"></td>
        <td><input type="text" id="cfop_${idx}" value="${escapeHtml(p.cfop || "5102")}" maxlength="4" placeholder="5102" style="width:80px;"></td>
        <td><input type="text" id="unidade_${idx}" value="${escapeHtml(p.unidade || "UN")}" maxlength="6" style="width:70px;"></td>
      </tr>
    `;
  }).join("");

  openModal(`Emitir NF-e — Pedido #${order.numero}`, `
    <div class="card" style="margin-bottom:15px;">
      <p><strong>Cliente:</strong> ${escapeHtml(client.nome)}</p>
      ${client.nome_fantasia ? `<p><strong>Nome fantasia:</strong> ${escapeHtml(client.nome_fantasia)}</p>` : ""}
      <p><strong>CNPJ:</strong> ${escapeHtml(client.cpf_cnpj || "-")}</p>
      <p><strong>Inscrição Estadual:</strong> ${escapeHtml(client.inscricao_estadual || "Não informada")}</p>
      <p><strong>Indicador de IE:</strong> ${escapeHtml(getIndicadorIeLabel(client.indicador_ie))}</p>
      <p><strong>Total do pedido:</strong> ${orderMoney(order.valor_total)}</p>
    </div>
    <p class="muted" style="font-size:13px;">Confira os dados fiscais dos itens. NCM (8 dígitos) e CFOP são obrigatórios.</p>
    <div style="overflow:auto;">
      <table class="table">
        <thead><tr><th>Produto</th><th>Qtd</th><th>Valor unit.</th><th>NCM</th><th>CFOP</th><th>Un.</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
    <div class="form-grid" style="margin-top:20px;">
      <div class="form-group"><label>Natureza da operação</label><input type="text" id="nf_natureza" value="Venda de mercadoria"></div>
      <div class="form-group">
        <label>Modalidade do frete</label>
        <select id="nf_frete">
          <option value="9">Sem frete (9)</option>
          <option value="0">Por conta do emitente (0)</option>
          <option value="1">Por conta do destinatário (1)</option>
          <option value="2">Por conta de terceiros (2)</option>
        </select>
      </div>
      <div class="form-group full"><label>Informações complementares</label><textarea id="nf_info" placeholder="Pedido interno, observações fiscais..."></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="nfEmitButton" onclick="emitInvoice(${order.id}, ${(items || []).length})">Emitir NF-e</button>
    </div>
  `);
}

async function emitInvoice(orderId, itemCount) {
  const button = document.getElementById("nfEmitButton");
  const itensFiscais = [];

  for (let i = 0; i < itemCount; i++) {
    const ncm = document.getElementById(`ncm_${i}`)?.value.trim() || "";
    const cfop = document.getElementById(`cfop_${i}`)?.value.trim() || "";
    const unidade = document.getElementById(`unidade_${i}`)?.value.trim() || "UN";
    if (!ncm || ncm.replace(/\D/g, "").length !== 8) { alert(`Preencha um NCM válido (8 dígitos) para o item ${i + 1}.`); return; }
    itensFiscais.push({ index: i, ncm: ncm.replace(/\D/g, ""), cfop: cfop.replace(/\D/g, "") || "5102", unidade });
  }

  const confirmed = confirm("Confirma a emissão da NF-e?\n\nApós autorizada pela SEFAZ, a nota só poderá ser cancelada dentro do prazo legal.");
  if (!confirmed) return;

  if (button) { button.disabled = true; button.textContent = "Emitindo..."; }

  try {
    const { data, error } = await db.functions.invoke("emitir-nfe", {
      body: {
        pedido_id: orderId, id_loja: currentStore.id_loja,
        natureza_operacao: document.getElementById("nf_natureza").value.trim(),
        modalidade_frete: Number(document.getElementById("nf_frete").value),
        informacoes_complementares: document.getElementById("nf_info").value.trim(),
        itens_fiscais: itensFiscais
      }
    });

    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || "Falha ao emitir NF-e.");

    alert("NF-e enviada com sucesso!\n\nNúmero: " + (data.numero || "processando") + "\nStatus: " + (data.status || "processando") + "\n" + (data.chave ? "Chave: " + data.chave + "\n" : "") + "\nSe o status não estiver 'autorizada', use o botão 'Atualizar status'.");
    closeModal(); await loadOrders(); await viewOrder(orderId);
  } catch (err) {
    alert("Erro ao emitir NF-e:\n" + (err.message || "Erro desconhecido."));
  } finally {
    if (button) { button.disabled = false; button.textContent = "Emitir NF-e"; }
  }
}

async function refreshNfeStatus(orderId) {
  try {
    const { data, error } = await db.functions.invoke("consultar-nfe", { body: { pedido_id: orderId, id_loja: currentStore.id_loja } });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || "Falha ao consultar NF-e.");

    alert("Status atualizado!\n\nStatus: " + (data.status || "-") + "\nNúmero: " + (data.numero || "-") + "\n" + (data.mensagem ? "Mensagem: " + data.mensagem : ""));
    await loadOrders(); await viewOrder(orderId);
  } catch (err) {
    alert("Erro ao consultar NF-e:\n" + (err.message || "Erro desconhecido."));
  }
}

async function cancelNfe(orderId) {
  const justificativa = prompt("Justificativa do cancelamento (mínimo 15 caracteres):");
  if (justificativa === null) return;
  if (!justificativa || justificativa.trim().length < 15) { alert("A justificativa precisa ter pelo menos 15 caracteres."); return; }
  const confirmed = confirm("Confirma o cancelamento da NF-e?");
  if (!confirmed) return;

  try {
    const { data, error } = await db.functions.invoke("emitir-nfe", {
      body: { action: "cancelar", pedido_id: orderId, id_loja: currentStore.id_loja, justificativa: justificativa.trim() }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || "Falha ao cancelar NF-e.");
    alert("NF-e cancelada com sucesso.");
    await loadOrders(); await viewOrder(orderId);
  } catch (err) {
    alert("Erro ao cancelar NF-e:\n" + (err.message || "Erro desconhecido."));
  }
}

function openNfeFile(url) { if (url) window.open(url, "_blank"); }


/* ======================================================
   PAGAMENTOS
   ====================================================== */

window.__pagamentosPorPedido = {};

async function loadPagamentosPedidos(orderIds) {
  window.__pagamentosPorPedido = {};
  if (!orderIds || !orderIds.length) return;

  const { data, error } = await db.from("gestao_loja_movimentos_financeiros").select("*").eq("id_loja", currentStore.id_loja).eq("tipo", "Entrada").eq("status", "Registrado").in("pedido_id", orderIds).order("id");
  if (error) { console.error("Erro ao carregar pagamentos:", error); return; }

  (data || []).forEach(mov => {
    if (!window.__pagamentosPorPedido[mov.pedido_id]) window.__pagamentosPorPedido[mov.pedido_id] = [];
    window.__pagamentosPorPedido[mov.pedido_id].push(mov);
  });
}

function getTipoPagamento(mov) {
  const desc = String(mov.descricao || "").toLowerCase();
  if (desc.includes("adiantamento")) return "adiantamento";
  if (desc.includes("restante")) return "restante";
  return "pagamento";
}

function getPagamentoInfo(order) {
  const pagamentos = (window.__pagamentosPorPedido || {})[order.id] || [];
  const totalPago = pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
  const valorTotal = Number(order.valor_total || 0);
  const restante = Math.max(valorTotal - totalPago, 0);

  let texto = ""; let cor = "#666";
  if (valorTotal <= 0) { texto = "—"; cor = "#666"; }
  else if (totalPago <= 0.005) { texto = "Não pago"; cor = "#a80000"; }
  else if (restante <= 0.005) { texto = "Pago"; cor = "#0a7d28"; }
  else { texto = `Pago ${orderMoney(totalPago)} · Falta ${orderMoney(restante)}`; cor = "#b06a00"; }

  return { totalPago, restante, texto, cor, pagamentos };
}

function openPaymentForm(orderId, tipo = "adiantamento") {
  const order = orders.find(o => String(o.id) === String(orderId));
  if (!order) { alert("Pedido não encontrado."); return; }
  if (!isConfirmed(order) && !isPending(order)) { alert("Só é possível registrar pagamentos em pedidos pendentes ou confirmados."); return; }

  const info = getPagamentoInfo(order);
  if (tipo === "restante" && info.restante <= 0.005) { alert("Este pedido já está totalmente pago."); return; }

  const valorSugerido = tipo === "restante" ? info.restante.toFixed(2) : "";
  const titulo = tipo === "restante" ? `Pagar restante — Pedido #${order.numero}` : `Adiantamento — Pedido #${order.numero}`;

  openModal(titulo, `
    <div class="card" style="margin-bottom:15px;">
      <p><strong>Cliente:</strong> ${escapeHtml(order.gestao_loja_clientes?.nome || "-")}</p>
      <p><strong>Valor total do pedido:</strong> ${orderMoney(order.valor_total)}</p>
      <p><strong>Já pago:</strong> <span style="color:#0a7d28;font-weight:600;">${orderMoney(info.totalPago)}</span></p>
      <p><strong>Restante:</strong> <span style="color:#b06a00;font-weight:600;">${orderMoney(info.restante)}</span></p>
    </div>
    <div class="form-grid">
      <div class="form-group"><label>Valor do pagamento *</label><input type="number" id="pag_valor" min="0.01" step="0.01" value="${valorSugerido}" placeholder="0,00"></div>
      <div class="form-group"><label>Data do pagamento</label><input type="date" id="pag_data" value="${getToday()}"></div>
      <div class="form-group">
        <label>Forma de pagamento</label>
        <select id="pag_forma">
          <option value="PIX">PIX</option><option value="Dinheiro">Dinheiro</option><option value="Cartão de crédito">Cartão de crédito</option>
          <option value="Cartão de débito">Cartão de débito</option><option value="Transferência">Transferência</option><option value="Boleto">Boleto</option><option value="Outro">Outro</option>
        </select>
      </div>
      <div class="form-group"><label>Descrição (opcional)</label><input type="text" id="pag_descricao" placeholder="Ex.: entrada, sinal, parcela..."></div>
      <div class="form-group full"><label>Observações</label><textarea id="pag_observacoes" placeholder="Observações sobre o pagamento..."></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" type="button" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" type="button" id="pagSaveButton" onclick="savePayment(${order.id}, '${tipo}')">Confirmar pagamento</button>
    </div>
  `);
}

async function savePayment(orderId, tipo) {
  const order = orders.find(o => String(o.id) === String(orderId));
  if (!order) { alert("Pedido não encontrado."); return; }
  if (!isConfirmed(order) && !isPending(order)) { alert("Só é possível registrar pagamentos em pedidos pendentes ou confirmados."); return; }

  const info = getPagamentoInfo(order);
  const valor = getNumberValue("pag_valor");
  if (!valor || valor <= 0) { alert("Informe um valor de pagamento válido."); return; }
  if (tipo === "restante" && valor > info.restante + 0.005) { alert("O valor informado é maior que o restante do pedido.\n\nRestante: " + orderMoney(info.restante)); return; }

  const forma = document.getElementById("pag_forma")?.value || "";
  const descricaoExtra = document.getElementById("pag_descricao")?.value.trim() || "";
  const observacoes = document.getElementById("pag_observacoes")?.value.trim() || null;
  const dataPagamento = document.getElementById("pag_data")?.value || getToday();
  const numeroPedido = order.numero;

  const descricaoBase = tipo === "restante" ? `Restante do pagamento do pedido #${numeroPedido}` : `Adiantamento do pagamento do pedido #${numeroPedido}`;
  let descricao = descricaoExtra ? `${descricaoBase} — ${descricaoExtra}` : descricaoBase;
  if (observacoes) descricao += `\nObs.: ${observacoes}`;

  const button = document.getElementById("pagSaveButton");
  if (button) { button.disabled = true; button.textContent = "Salvando..."; }

  try {
    const dataMovimento = dataPagamento ? new Date(dataPagamento + "T12:00:00").toISOString() : new Date().toISOString();
    const payload = {
      id_loja: currentStore.id_loja, pedido_id: Number(orderId), tipo: "Entrada", categoria: "Venda",
      descricao: descricao, valor: Number(valor.toFixed(2)), forma_pagamento: forma || null, status: "Registrado", data_movimento: dataMovimento
    };

    const { error } = await db.from("gestao_loja_movimentos_financeiros").insert(payload).select().single();
    if (error) throw error;

    closeModal(); await loadOrders(); await viewOrder(orderId);
    alert("Pagamento registrado com sucesso!\n\nValor: " + orderMoney(valor) + "\nTipo: " + (tipo === "restante" ? "Pagamento do restante" : "Adiantamento"));
  } catch (err) {
    alert("Erro ao registrar pagamento:\n" + (err.message || "Erro desconhecido."));
  } finally {
    if (button) { button.disabled = false; button.textContent = "Confirmar pagamento"; }
  }
}


/* ======================================================
   BOOT
   ====================================================== */

document.addEventListener("DOMContentLoaded", async function() {
  try {
    const authenticated = await requireAuth();
    if (!authenticated) return;
    if (!currentUser) return;

    const contextLoaded = await loadUserContext();
    if (!contextLoaded) return;

    const subtitle = document.getElementById("pageSubtitle");
    if (subtitle) subtitle.textContent = "Gerencie os pedidos dos clientes";

    await Promise.all([loadClients(), loadProducts(), loadVariations()]);
    await loadOrders();
  } catch (error) {
    console.error("Erro na página de pedidos:", error);
    const container = document.getElementById("ordersContainer");
    if (container) {
      container.innerHTML = `<div class="card"><h3>Erro ao carregar a página</h3><p>${escapeHtml(error.message || "Erro desconhecido.")}</p></div>`;
    }
  }
});
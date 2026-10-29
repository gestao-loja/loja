let dashboardPeriod = "7";

let dashboardOrders = [];
let dashboardProducts = [];
let dashboardVariations = [];
let dashboardMovements = [];
let dashboardClients = [];
let dashboardOrderItems = []; 

document.addEventListener("DOMContentLoaded", async () => {

  const authenticated =
    await requireAuth();

  if (!authenticated) {
    return;
  }

  if (!currentUser) {
    return;
  }

  if (!currentStore) {
    const loaded =
      await loadUserContext();

    if (!loaded) {
      return;
    }
  }

  await loadDashboard();

});

async function loadDashboard() {
  if (!currentStore || !currentStore.id_loja) return;

  try {
    const [
      ordersResult,
      productsResult,
      variationsResult,
      movementsResult,
      clientsResult,
      orderItemsResult
    ] = await Promise.all([

      db.from("gestao_loja_pedidos")
        .select("id,numero,cliente_id,data_pedido,status,valor_total")
        .eq("id_loja", currentStore.id_loja)
        .order("data_pedido", { ascending: false }),

      db.from("gestao_loja_produtos")
        .select("id,nome,estoque,estoque_minimo,ativo")
        .eq("id_loja", currentStore.id_loja),

      db.from("gestao_loja_produtos_variacoes")
        .select("id,produto_id,nome,estoque,estoque_minimo,ativo")
        .eq("id_loja", currentStore.id_loja),

      db.from("gestao_loja_movimentacoes_estoque")
        .select("id,produto_id,variacao_id,tipo,entrada,quantidade,created_at")
        .eq("id_loja", currentStore.id_loja)
        .order("created_at", { ascending: false }),

      db.from("gestao_loja_clientes")
        .select("id,nome")
        .eq("id_loja", currentStore.id_loja),

      // BUSCA DOS ITENS DIRETAMENTE DA TABELA (Sem depender da View)
      db.from("gestao_loja_pedidos_itens")
        .select("pedido_id, produto_id, variacao_id, quantidade, subtotal")
        .eq("id_loja", currentStore.id_loja)
    ]);

    if (ordersResult.error) console.error("Erro pedidos:", ordersResult.error);
    if (productsResult.error) console.error("Erro produtos:", productsResult.error);
    if (variationsResult.error) console.error("Erro variações:", variationsResult.error);
    if (movementsResult.error) console.error("Erro movimentações:", movementsResult.error);
    if (clientsResult.error) console.error("Erro clientes:", clientsResult.error);
    if (orderItemsResult.error) console.error("Erro itens:", orderItemsResult.error);

    dashboardOrders = ordersResult.data || [];
    dashboardProducts = productsResult.data || [];
    dashboardVariations = variationsResult.data || [];
    dashboardMovements = movementsResult.data || [];
    dashboardClients = clientsResult.data || [];
    dashboardOrderItems = orderItemsResult.data || []; // Salva os itens

    renderDashboard();

  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);
  }
}

function changeDashboardPeriod() {

  dashboardPeriod =
    $("dashboardPeriod")?.value ||
    "7";

  renderDashboard();

}

function renderDashboard() {

  renderSummary();

  renderSales();

  renderStatusChart();

  renderStockChart();

  renderTopProducts();

  renderRecentOrders();

}

function getPeriodDates() {

  const now =
    new Date();

  let start =
    new Date();

  if (
    dashboardPeriod ===
    "today"
  ) {

    start.setHours(
      0,
      0,
      0,
      0
    );

  } else if (
    dashboardPeriod ===
    "month"
  ) {

    start =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

  } else {

    const days =
      Number(
        dashboardPeriod
      );

    start.setDate(
      now.getDate() -
      (days - 1)
    );

    start.setHours(
      0,
      0,
      0,
      0
    );

  }

  const end =
    new Date(now);

  end.setHours(
    23,
    59,
    59,
    999
  );

  return {
    start,
    end
  };

}

function getOrdersInPeriod() {

  const {
    start,
    end
  } =
    getPeriodDates();

  return dashboardOrders.filter(
    order => {

      if (!order.data_pedido) {
        return false;
      }

      const date =
        new Date(
          order.data_pedido
        );

      return (
        date >= start &&
        date <= end
      );

    }
  );

}

function getConfirmedOrders() {

  return dashboardOrders.filter(
    order => {

      const status =
        String(
          order.status ||
          ""
        )
          .trim()
          .toLowerCase();

      return (
        status ===
          "confirmado" ||
        status ===
          "confirmada"
      );

    }
  );

}

function renderSales() {

  const periodOrders =
    getOrdersInPeriod();

  const confirmed =
    periodOrders.filter(
      order => {

        const status =
          String(
            order.status ||
            ""
          )
            .trim()
            .toLowerCase();

        return (
          status ===
            "confirmado" ||
          status ===
            "confirmada"
        );

      }
    );

  const total =
    confirmed.reduce(
      (
        sum,
        order
      ) =>
        sum +
        Number(
          order.valor_total ||
          0
        ),
      0
    );

  if ($("dashboardSales")) {

    $("dashboardSales")
      .textContent =
      money(total);

  }

  if ($("dashboardOrders")) {

    $("dashboardOrders")
      .textContent =
      confirmed.length.toLocaleString(
        "pt-BR"
      );

  }

  if ($("dashboardOrdersDetail")) {

    $("dashboardOrdersDetail")
      .textContent =
      "no período";

  }

  const comparison =
    getPreviousPeriodSales();

  if ($("dashboardSalesComparison")) {

    if (
      comparison.previous ===
      0
    ) {

      $("dashboardSalesComparison")
        .textContent =
        "Sem período anterior";

    } else {

      const variation =
        (
          (
            total -
            comparison.previous
          ) /
          comparison.previous
        ) *
        100;

      const sign =
        variation >= 0
          ? "+"
          : "";

      $("dashboardSalesComparison")
        .textContent =
        `${sign}${variation.toFixed(
          1
        )}% vs. período anterior`;

    }

  }

}

function getPreviousPeriodSales() {

  const {
    start
  } =
    getPeriodDates();

  const currentDays =
    dashboardPeriod ===
    "today"
      ? 1
      : dashboardPeriod ===
        "month"
        ? new Date(
            start.getFullYear(),
            start.getMonth() + 1,
            0
          ).getDate()
        : Number(
            dashboardPeriod
          );

  const previousEnd =
    new Date(start);

  previousEnd.setMilliseconds(
    -1
  );

  const previousStart =
    new Date(
      previousEnd
    );

  previousStart.setDate(
    previousStart.getDate() -
    currentDays +
    1
  );

  previousStart.setHours(
    0,
    0,
    0,
    0
  );

  const previous =
    dashboardOrders.filter(
      order => {

        if (
          !order.data_pedido
        ) {
          return false;
        }

        const date =
          new Date(
            order.data_pedido
          );

        const status =
          String(
            order.status ||
            ""
          )
            .trim()
            .toLowerCase();

        return (
          date >=
            previousStart &&
          date <=
            previousEnd &&
          (
            status ===
              "confirmado" ||
            status ===
              "confirmada"
          )
        );

      }
    );

  const value =
    previous.reduce(
      (
        sum,
        order
      ) =>
        sum +
        Number(
          order.valor_total ||
          0
        ),
      0
    );

  return {
    previous: value
  };

}

function renderSummary() {

  const activeProducts =
    dashboardProducts.filter(
      product =>
        product.ativo !== false
    );

  const activeVariations =
    dashboardVariations.filter(
      variation =>
        variation.ativo !== false
    );

  const productStock =
    dashboardProducts.reduce(
      (
        sum,
        product
      ) =>
        sum +
        Number(
          product.estoque ||
          0
        ),
      0
    );

  const variationStock =
    dashboardVariations.reduce(
      (
        sum,
        variation
      ) =>
        sum +
        Number(
          variation.estoque ||
          0
        ),
      0
    );

  const lowProducts =
    activeProducts.filter(
      product =>
        Number(
          product.estoque ||
          0
        ) <=
        Number(
          product.estoque_minimo ||
          0
        ) &&
        Number(
          product.estoque ||
          0
        ) > 0
    );

  const lowVariations =
    activeVariations.filter(
      variation =>
        Number(
          variation.estoque ||
          0
        ) <=
        Number(
          variation.estoque_minimo ||
          0
        ) &&
        Number(
          variation.estoque ||
          0
        ) > 0
    );

  const outProducts =
    activeProducts.filter(
      product =>
        Number(
          product.estoque ||
          0
        ) <= 0
    );

  const outVariations =
    activeVariations.filter(
      variation =>
        Number(
          variation.estoque ||
          0
        ) <= 0
    );

  if ($("summaryProducts")) {

    $("summaryProducts")
      .textContent =
      activeProducts.length
        .toLocaleString(
          "pt-BR"
        );

  }

  if ($("summaryVariations")) {

    $("summaryVariations")
      .textContent =
      activeVariations.length
        .toLocaleString(
          "pt-BR"
        );

  }

  if ($("summaryClients")) {

    $("summaryClients")
      .textContent =
      dashboardClients.length
        .toLocaleString(
          "pt-BR"
        );

  }

  if ($("summaryStock")) {

    $("summaryStock")
      .textContent =
      (
        productStock +
        variationStock
      ).toLocaleString(
        "pt-BR",
        {
          maximumFractionDigits: 3
        }
      );

  }

  if ($("dashboardLowStock")) {

    $("dashboardLowStock")
      .textContent =
      (
        lowProducts.length +
        lowVariations.length
      ).toLocaleString(
        "pt-BR"
      );

  }

  if ($("dashboardOutOfStock")) {

    $("dashboardOutOfStock")
      .textContent =
      (
        outProducts.length +
        outVariations.length
      ).toLocaleString(
        "pt-BR"
      );

  }

}

function renderStatusChart() {

  const periodOrders =
    getOrdersInPeriod();

  const statusCount = {
    Confirmado: 0,
    Pendente: 0,
    Cancelado: 0,
    Outros: 0
  };

  periodOrders.forEach(
    order => {

      const status =
        String(
          order.status ||
          ""
        )
          .trim()
          .toLowerCase();

      if (
        status ===
          "confirmado" ||
        status ===
          "confirmada"
      ) {

        statusCount.Confirmado++;

      } else if (
        status ===
          "pendente"
      ) {

        statusCount.Pendente++;

      } else if (
        status ===
          "cancelado" ||
        status ===
          "cancelada"
      ) {

        statusCount.Cancelado++;

      } else {

        statusCount.Outros++;

      }

    }
  );

  const total =
    periodOrders.length;

  if ($("statusTotal")) {

    $("statusTotal")
      .textContent =
      total.toLocaleString(
        "pt-BR"
      );

  }

  if ($("ordersTotal")) {

    $("ordersTotal")
      .textContent =
      `Total: ${total}`;

  }

  const colors = [
    "#16834b",
    "#8b5cf6",
    "#f59e0b",
    "#dc3545"
  ];

  const values = [
    statusCount.Confirmado,
    statusCount.Pendente,
    statusCount.Cancelado,
    statusCount.Outros
  ];

  const names = [
    "Concluídos",
    "Pendentes",
    "Cancelados",
    "Outros"
  ];

  let current =
    0;

  const segments = [];

  values.forEach(
    value => {

      const percentage =
        total > 0
          ? (
              value /
              total
            ) *
            100
          : 0;

      const start =
        current;

      current +=
        percentage;

      if (
        percentage > 0
      ) {

        segments.push(
          `${colors[segments.length]} ${start}% ${current}%`
        );

      }

    }
  );

  const donut =
    $("statusDonut");

  if (donut) {

    donut.style.background =
      segments.length
        ? `conic-gradient(${segments.join(
            ", "
          )})`
        : "#e9edf2";

  }

  const legend =
    $("statusLegend");

  if (!legend) {
    return;
  }

  legend.innerHTML =
    names
      .map(
        (
          name,
          index
        ) => {

          const value =
            values[index];

          const percentage =
            total > 0
              ? (
                  value /
                  total
                ) *
                100
              : 0;

          return `
            <div class="status-legend-item">

              <span
                class="status-dot"
                style="
                  background:${colors[index]};
                "
              ></span>

              <span>
                ${name}
              </span>

              <span class="status-percent">
                ${percentage.toFixed(
                  1
                )}%
              </span>

            </div>
          `;

        }
      )
      .join("");

}

function renderStockChart() {

  const now =
    new Date();

  const days = [];

  for (
    let i = 6;
    i >= 0;
    i--
  ) {

    const date =
      new Date(now);

    date.setDate(
      now.getDate() -
      i
    );

    date.setHours(
      0,
      0,
      0,
      0
    );

    days.push(
      date
    );

  }

  const values =
    days.map(
      date => {

        const next =
          new Date(date);

        next.setDate(
          date.getDate() +
          1
        );

        return dashboardMovements
          .filter(
            movement => {

              const movementDate =
                new Date(
                  movement.created_at
                );

              return (
                movementDate >=
                  date &&
                movementDate <
                  next
              );

            }
          )
          .reduce(
            (
              sum,
              movement
            ) =>
              sum +
              Number(
                movement.quantidade ||
                0
              ),
            0
          );

      }
    );

  const max =
    Math.max(
      ...values,
      1
    );

  const chart =
    $("stockChart");

  if (!chart) {
    return;
  }

  chart.innerHTML =
    days
      .map(
        (
          date,
          index
        ) => {

          const value =
            values[index];

          const height =
            value > 0
              ? Math.max(
                  5,
                  (
                    value /
                    max
                  ) *
                  100
                )
              : 3;

          const label =
            date.toLocaleDateString(
              "pt-BR",
              {
                weekday: "short"
              }
            )
              .replace(
                ".",
                ""
              );

          return `
            <div class="stock-day">

              <div
                class="stock-day-value"
              >
                ${value}
              </div>

              <div class="stock-bar-area">

                <div
                  class="stock-bar"
                  style="
                    height:${height}%;
                  "
                  title="${value} movimentações"
                ></div>

              </div>

              <div
                class="stock-day-label"
              >
                ${label}
              </div>

            </div>
          `;

        }
      )
      .join("");

}

function renderTopProducts() {
  const container = $("topProducts");
  if (!container) return;

  // Filtra os pedidos válidos (Confirmados e no período selecionado)
  const { start, end } = getPeriodDates();
  
  const validOrderIds = dashboardOrders.filter(order => {
    const status = String(order.status || "").trim().toLowerCase();
    const isConfirmed = status === "confirmado" || status === "confirmada";
    
    if (!isConfirmed || !order.data_pedido) return false;
    
    const date = new Date(order.data_pedido);
    return date >= start && date <= end;
  }).map(order => order.id);

  // Pega os itens apenas desses pedidos
  const validItems = dashboardOrderItems.filter(item => validOrderIds.includes(item.pedido_id));

  if (!validItems.length) {
    container.innerHTML = `
      <div class="dashboard-empty">
        Nenhuma venda confirmada no período.
      </div>
    `;
    return;
  }

  // Agrupa e cruza com os nomes dos produtos
  const grouped = {};
  
  validItems.forEach(item => {
    const pId = item.produto_id;
    const vId = item.variacao_id || 'null';
    const key = `${pId}_${vId}`;
    
    const produtoObj = dashboardProducts.find(p => Number(p.id) === Number(pId));
    const variacaoObj = item.variacao_id ? dashboardVariations.find(v => Number(v.id) === Number(item.variacao_id)) : null;

    const pNome = produtoObj ? produtoObj.nome : "Produto";
    const vNome = variacaoObj ? variacaoObj.nome : "";

    if (!grouped[key]) {
      grouped[key] = {
        produto: pNome,
        variacao: vNome,
        quantidade_vendida: 0,
        valor_vendido: 0
      };
    }
    
    grouped[key].quantidade_vendida += Number(item.quantidade || 0);
    grouped[key].valor_vendido += Number(item.subtotal || 0);
  });

  // Transforma em array e ordena pelos mais vendidos
  const top = Object.values(grouped).sort((a, b) => {
    return Number(b.quantidade_vendida || 0) - Number(a.quantidade_vendida || 0);
  }).slice(0, 5);

  // Renderiza o HTML na tela
  container.innerHTML = top.map((item, index) => {
    const nome = (item.variacao && item.variacao !== "Padrão") 
      ? `${item.produto} — ${item.variacao}` 
      : item.produto;

    const qtd = Number(item.quantidade_vendida || 0).toLocaleString("pt-BR");
    const receita = money(item.valor_vendido || 0);

    return `
      <div class="ranking-item">
        <div class="ranking-position">${index + 1}</div>
        <div class="ranking-name">
          ${escapeHtml(nome)}
          <div class="muted" style="font-size:10px;">${receita}</div>
        </div>
        <div class="ranking-quantity">${qtd} un</div>
      </div>
    `;
  }).join("");
}

function renderRecentOrders() {

  const container =
    $("recentOrders");

  if (!container) {
    return;
  }

  const orders =
    dashboardOrders
      .slice(
        0,
        5
      );

  if (!orders.length) {

    container.innerHTML = `
      <div class="dashboard-empty">
        Nenhum pedido encontrado.
      </div>
    `;

    return;

  }

  container.innerHTML =
    orders
      .map(
        order => {

          const client =
            dashboardClients.find(
              client =>
                Number(
                  client.id
                ) ===
                Number(
                  order.cliente_id
                )
            );

          const status =
            order.status ||
            "Sem status";

          return `
            <div class="recent-order">

              <div>

                <div
                  class="recent-order-number"
                >
                  Pedido #${escapeHtml(
                    String(
                      order.numero ||
                      order.id
                    )
                  )}
                </div>

                <div
                  class="recent-order-client"
                >
                  ${escapeHtml(
                    client?.nome ||
                    "Cliente não informado"
                  )}

                  •

                  ${formatDashboardDate(
                    order.data_pedido
                  )}
                </div>

              </div>

              <div>

                <div
                  class="recent-order-value"
                >
                  ${money(
                    order.valor_total
                  )}
                </div>

                <div
                  class="recent-order-status"
                >
                  ${escapeHtml(
                    status
                  )}
                </div>

              </div>

            </div>
          `;

        }
      )
      .join("");

}

function formatDashboardDate(
  value
) {

  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleDateString(
    "pt-BR"
  );

}
let catalogStoreId = null;

let catalogStore = null;

let catalogProducts = [];

let catalogCart = [];

let selectedProduct = null;

let selectedVariation = null;

let selectedQuantity = 1;

/*
 * Hierarquia de tamanhos por letras.
 * Quanto menor o número, mais cedo aparece.
 */
const VARIATION_SIZE_ORDER = {
  "PP": 1,
  "P": 2,
  "M": 3,
  "G": 4,
  "GG": 5,
  "XG": 5,
  "EG": 5,
  "G1": 6,
  "XGG": 6,
  "G2": 7,
  "G3": 8,
  "G4": 9,
  "G5": 10,
  "G6": 11
};

/*
 * Extrai o "token" que representa o tamanho/numeração
 * do final do nome da variação.
 *
 * Exemplos:
 *   "Branco Gola Redonda - GG"  -> "GG"
 *   "Branco Gola Redonda G2"    -> "G2"
 *   "Branco 4"                  -> "4"
 *   "Branco 12"                 -> "12"
 *   "Azul"                      -> ""  (não reconhece)
 */
function extractVariationSizeToken(nome) {
  const s = String(nome || "").trim();

  if (!s) {
    return "";
  }

  const match = s.match(/[\s\-\/]+([A-Za-z]+\d*|\d+)$/);

  if (match) {
    return match[1];
  }

  return "";
}

/*
 * Extrai a "base" do nome da variação: tudo antes do
 * token de tamanho. Essa base é usada para agrupar
 * variações da mesma cor/modelo.
 *
 * Exemplos:
 *   "Branco Gola Redonda - GG"  -> "branco gola redonda"
 *   "Branco 4"                  -> "branco"
 *   "Cinza 5"                   -> "cinza"
 *   "Azul"                      -> "azul"
 */
function extractVariationBase(nome) {
  const s = String(nome || "").trim();

  if (!s) {
    return "";
  }

  const base = s.replace(/[\s\-\/]+([A-Za-z]+\d*|\d+)$/, "").trim();

  return (base || s).toLowerCase();
}

/*
 * Gera uma chave de ordenação para uma variação:
 *   base:     texto "cor/modelo" (para agrupar)
 *   group:    0 = letras (P, M, G...), 1 = números, 2 = outros
 *   rank:     valor numérico para desempate dentro do grupo
 *   original: nome completo em minúsculas
 */
function variationSortKey(nome) {
  const token = extractVariationSizeToken(nome).toUpperCase();

  const base = extractVariationBase(nome);

  const original = String(nome || "").toLowerCase();

  let group = 2;
  let rank = 0;

  if (
    token &&
    Object.prototype.hasOwnProperty.call(
      VARIATION_SIZE_ORDER,
      token
    )
  ) {
    group = 0;
    rank = VARIATION_SIZE_ORDER[token];
  } else if (token && /^\d+$/.test(token)) {
    group = 1;
    rank = Number(token);
  }

  return {
    base: base,
    group: group,
    rank: rank,
    original: original
  };
}

/*
 * Comparador usado pelo Array.sort().
 *
 * Ordem final:
 *   1) Cor / modelo (base do nome)
 *   2) Grupo (letras / números / outros)
 *   3) Posição do tamanho (P, M, G, GG... ou 4, 5, 6...)
 *   4) Nome completo (alfabético, como desempate final)
 */
function compareVariations(a, b) {
  const ka = variationSortKey(a?.nome);
  const kb = variationSortKey(b?.nome);

  if (ka.base !== kb.base) {
    return ka.base.localeCompare(
      kb.base,
      "pt-BR",
      { sensitivity: "base" }
    );
  }

  if (ka.group !== kb.group) {
    return ka.group - kb.group;
  }

  if (ka.rank !== kb.rank) {
    return ka.rank - kb.rank;
  }

  return ka.original.localeCompare(
    kb.original,
    "pt-BR",
    { sensitivity: "base" }
  );
}

/*
 * Retorna uma cópia da lista de variações ordenada.
 */
function sortVariations(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return [...list].sort(compareVariations);
}

async function getCatalogStoreId() {
  const params = new URLSearchParams(
    window.location.search
  );

  const urlStoreId =
    params.get("loja") ||
    params.get("id_loja");

  if (urlStoreId) {
    const id = Number(urlStoreId);

    if (Number.isInteger(id) && id > 0) {
      return id;
    }
  }

  const sessionResult =
    await db.auth.getSession();

  if (
    sessionResult.error ||
    !sessionResult.data.session
  ) {
    return null;
  }

  const userId =
    sessionResult.data.session.user.id;

  const userResult =
    await db
      .from("gestao_loja_usuarios")
      .select("id_loja")
      .eq("id", userId)
      .single();

  if (
    userResult.error ||
    !userResult.data
  ) {
    console.error(
      "Erro ao localizar loja do usuário:",
      userResult.error
    );

    return null;
  }

  return Number(
    userResult.data.id_loja
  );
}

async function setupCatalogAccess() {
  try {
    /*
     * Esconde o menu imediatamente ao carregar a página,
     * evitando qualquer "flash" antes de sabermos se o
     * visitante está autenticado.
     */
    const menu =
      document.getElementById("menu");

    if (menu) {
      menu.style.display = "none";
    }

    const sessionResult =
      await db.auth.getSession();

    const session =
      sessionResult.data?.session || null;

    if (session) {
      /*
       * Visitante autenticado (dono da loja / equipe):
       * define currentUser ANTES de qualquer chamada.
       */
      currentUser = session.user;

      if (menu) {
        menu.style.display = "";
      }

      /*
       * Cada bloco do menu tem try/catch próprio pra que
       * uma falha no menu NÃO impeça o catálogo de carregar.
       */
      try {
        if (
          typeof loadMenu === "function"
        ) {
          await loadMenu();
        }
      } catch (menuError) {
        console.warn(
          "Falha ao carregar menu (não bloqueia o catálogo):",
          menuError
        );
      }

      try {
        if (
          typeof loadUserContext === "function"
        ) {
          await loadUserContext();
        }
      } catch (contextError) {
        console.warn(
          "Falha ao carregar contexto (não bloqueia o catálogo):",
          contextError
        );
      }

      try {
        if (
          typeof setActiveNav === "function"
        ) {
          setActiveNav();
        }
      } catch (navError) {
        console.warn(
          "Falha ao marcar nav ativo:",
          navError
        );
      }
    } else {
      /*
       * Visitante NÃO autenticado (cliente do catálogo):
       * remove o menu do DOM, deixando apenas o catálogo.
       */
      if (menu) {
        menu.remove();
      }
    }

    catalogStoreId =
      await getCatalogStoreId();

    if (!catalogStoreId) {
      showCatalogMessage(
        "Não foi possível identificar a loja."
      );

      return false;
    }

    return true;

  } catch (error) {
    console.error(
      "Erro ao configurar catálogo:",
      error
    );

    showCatalogMessage(
      "Erro ao carregar o catálogo."
    );

    return false;
  }
}

async function loadCatalog() {
  try {
    console.log(
      "Carregando loja:",
      catalogStoreId
    );

    const result =
      await db.rpc(
        "gestao_loja_catalogo_publico",
        {
          p_id_loja:
            Number(catalogStoreId)
        }
      );

    console.log(
      "Resposta do catálogo:",
      result
    );

    if (result.error) {
      console.error(
        "Erro no RPC:",
        result.error
      );

      showCatalogMessage(
        result.error.message ||
        "Erro ao carregar os dados da loja."
      );

      return false;
    }

    let data =
      result.data;

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (error) {
        console.error(
          "Erro ao converter retorno:",
          error
        );

        showCatalogMessage(
          "Erro no formato dos dados recebidos."
        );

        return false;
      }
    }

    console.log(
      "Dados recebidos:",
      data
    );

    if (!data) {
      showCatalogMessage(
        "A loja não foi encontrada."
      );

      return false;
    }

    catalogStore =
      data.loja || null;

    catalogProducts =
      Array.isArray(data.produtos)
        ? data.produtos
        : [];

    /*
     * Ordena as variações de cada produto:
     *   1) Cor/modelo (base do nome)
     *   2) Tamanho (P, M, G, GG, G1... ou 4, 5, 6...)
     */
    catalogProducts.forEach(product => {
      if (Array.isArray(product.variacoes)) {
        product.variacoes =
          sortVariations(product.variacoes);
      }
    });

    if (!catalogStore) {
      showCatalogMessage(
        "Os dados da loja não foram encontrados."
      );

      return false;
    }

    renderStore();

    renderCatalog();

    return true;

  } catch (error) {
    console.error(
      "Erro ao carregar catálogo:",
      error
    );

    showCatalogMessage(
      "Não foi possível carregar o catálogo."
    );

    return false;
  }
}

function renderStore() {
  const storeName =
    catalogStore.nome_fantasia ||
    catalogStore.nome ||
    "Catálogo";

  const logoUrl =
    catalogStore.logo ||
    catalogStore.logo_url ||
    catalogStore.imagem_logo ||
    catalogStore.url_logo ||
    "";

  /* Nome da loja */
  const nameElement =
    document.getElementById(
      "catalogStoreName"
    );

  if (nameElement) {
    nameElement.textContent =
      storeName;
  }

  /* Logo da loja — aparece ao lado do nome */
  const logoContainer =
    document.getElementById(
      "catalogStoreLogo"
    );

  if (logoContainer) {
    if (logoUrl) {
      logoContainer.innerHTML = `
        <img
          src="${escapeHtml(logoUrl)}"
          alt="${escapeHtml(storeName)}"
          class="catalog-store-logo-image"
          onerror="this.parentElement.style.display='none';"
        >
      `;

      logoContainer.style.display =
        "flex";
    } else {
      logoContainer.innerHTML = "";
      logoContainer.style.display =
        "none";
    }
  }

  document.title =
    storeName + " - Catálogo";
}

function renderCatalog() {
  const container =
    document.getElementById(
      "catalogProducts"
    );

  if (!container) {
    console.error(
      "Elemento catalogProducts não encontrado."
    );

    return;
  }

  const searchElement =
    document.getElementById(
      "catalogSearch"
    );

  const search =
    searchElement
      ? searchElement.value
          .trim()
          .toLowerCase()
      : "";

  const filteredProducts =
    catalogProducts.filter(
      product => {
        if (!search) {
          return true;
        }

        const name =
          String(
            product.nome || ""
          ).toLowerCase();

        const description =
          String(
            product.descricao || ""
          ).toLowerCase();

        const sku =
          String(
            product.sku || ""
          ).toLowerCase();

        return (
          name.includes(search) ||
          description.includes(search) ||
          sku.includes(search)
        );
      }
    );

  if (!filteredProducts.length) {
    container.innerHTML = `
      <div class="catalog-empty">
        Nenhum produto encontrado.
      </div>
    `;

    return;
  }

  container.innerHTML =
    filteredProducts
      .map(product => {
        const image =
          product.imagem_principal || "";

        const price =
          product.preco_venda;

        const hasPrice =
          price !== null &&
          price !== undefined;

        return `
          <div class="catalog-product">

            ${
              image
                ? `
                  <img
                    src="${escapeHtml(image)}"
                    alt="${escapeHtml(
                      product.nome || ""
                    )}"
                    class="catalog-product-image"
                  >
                `
                : `
                  <div class="catalog-product-no-image">
                    Sem imagem
                  </div>
                `
            }

            <div class="catalog-product-body">

              <div class="catalog-product-name">
                ${escapeHtml(
                  product.nome || ""
                )}
              </div>

              <div class="catalog-product-description">
                ${escapeHtml(
                  product.descricao || ""
                )}
              </div>

              ${
                hasPrice
                  ? `
                    <div class="catalog-product-price">
                      ${money(price)}
                    </div>
                  `
                  : `
                    <div class="catalog-product-price">
                      Consulte
                    </div>
                  `
              }

              <button
                type="button"
                class="catalog-product-action"
                onclick="openProduct(${Number(
                  product.id
                )})"
              >
                Ver produto
              </button>

            </div>
          </div>
        `;
      })
      .join("");
}

function openProduct(productId) {
  const product =
    catalogProducts.find(
      p =>
        String(p.id) ===
        String(productId)
    );

  if (!product) {
    console.error(
      "Produto não encontrado:",
      productId
    );

    return;
  }

  selectedProduct =
    product;

  selectedVariation =
    null;

  selectedQuantity =
    1;

  const modal =
    document.getElementById(
      "productModal"
    );

  const title =
    document.getElementById(
      "productModalTitle"
    );

  const content =
    document.getElementById(
      "productModalContent"
    );

  if (
    !modal ||
    !title ||
    !content
  ) {
    console.error(
      "Elementos do modal do produto não encontrados."
    );

    return;
  }

  title.textContent =
    product.nome ||
    "Produto";

  /*
   * Reforça a ordenação em runtime, garantindo que
   * mesmo que algo mude depois do loadCatalog, a lista
   * apareça agrupada por cor e por tamanho.
   */
  const variations =
    Array.isArray(product.variacoes)
      ? sortVariations(product.variacoes)
      : [];

  const mainImage =
    product.imagem_principal ||
    "";

  content.innerHTML = `
    <div class="catalog-product-detail">

      <div class="catalog-product-image">

        ${
          mainImage
            ? `
              <img
                id="selectedProductImage"
                src="${escapeHtml(mainImage)}"
                alt="${escapeHtml(
                  product.nome || ""
                )}"
              >
            `
            : `
              <div class="catalog-no-image">
                Sem imagem
              </div>
            `
        }

      </div>

      <div class="catalog-product-info">

        <h2>
          ${escapeHtml(
            product.nome || ""
          )}
        </h2>

        ${
          product.descricao
            ? `
              <p class="muted">
                ${escapeHtml(
                  product.descricao
                )}
              </p>
            `
            : ""
        }

        ${
          variations.length > 0
            ? `
              <div class="catalog-form-group">

                <label>
                  Variação
                </label>

                <select
                  id="catalogVariationSelect"
                  onchange="selectCatalogVariation(this.value)"
                >

                  <option value="">
                    Selecione uma variação
                  </option>

                  ${variations
                    .map(
                      variation => `
                        <option
                          value="${variation.id}"
                        >
                          ${escapeHtml(
                            variation.nome ||
                            "Variação"
                          )}

                          ${
                            variation.preco_venda !== null &&
                            variation.preco_venda !== undefined
                              ? " - " +
                                money(
                                  variation.preco_venda
                                )
                              : ""
                          }

                        </option>
                      `
                    )
                    .join("")}

                </select>

              </div>
            `
            : ""
        }

        <div
          id="catalogSelectedVariationImage"
        ></div>

        <div id="catalogSelectedPrice">

          ${
            product.preco_venda !== null &&
            product.preco_venda !== undefined
              ? `
                <strong>
                  ${money(
                    product.preco_venda
                  )}
                </strong>
              `
              : `
                <span class="muted">
                  Consulte
                </span>
              `
          }

        </div>

        <div class="catalog-form-group">

          <label>
            Quantidade
          </label>

          <div class="catalog-quantity">

            <button
              type="button"
              onclick="changeCatalogQuantity(-1)"
            >
              −
            </button>

            <span id="catalogQuantity">
              1
            </span>

            <button
              type="button"
              onclick="changeCatalogQuantity(1)"
            >
              +
            </button>

          </div>

        </div>

        <div class="catalog-form-group">

          <label>
            Observação do pedido
          </label>

          <textarea
            id="catalogItemObservation"
            rows="4"
            placeholder="Ex.: qual arte deseja, cor, tamanho, detalhes do pedido..."
          ></textarea>

        </div>

        <button
          type="button"
          class="btn btn-primary catalog-primary"
          onclick="addCatalogItem()"
        >
          Adicionar ao carrinho
        </button>

      </div>

    </div>
  `;

  modal.classList.remove(
    "hidden"
  );
}

function selectCatalogVariation(
  variationId
) {
  if (!selectedProduct) {
    return;
  }

  const variation =
    (
      selectedProduct.variacoes ||
      []
    ).find(
      item =>
        String(item.id) ===
        String(variationId)
    );

  selectedVariation =
    variation || null;

  const imageElement =
    document.getElementById(
      "selectedProductImage"
    );

  const imageContainer =
    document.getElementById(
      "catalogSelectedVariationImage"
    );

  const priceContainer =
    document.getElementById(
      "catalogSelectedPrice"
    );

  if (!variation) {
    if (
      imageElement &&
      selectedProduct.imagem_principal
    ) {
      imageElement.src =
        selectedProduct.imagem_principal;
    }

    if (imageContainer) {
      imageContainer.innerHTML = "";
    }

    if (priceContainer) {
      priceContainer.innerHTML =
        selectedProduct.preco_venda !== null &&
        selectedProduct.preco_venda !== undefined
          ? `
            <strong>
              ${money(
                selectedProduct.preco_venda
              )}
            </strong>
          `
          : `
            <span class="muted">
              Consulte
            </span>
          `;
    }

    return;
  }

  const variationImage =
    variation.imagem ||
    "";

  if (variationImage) {
    if (imageElement) {
      imageElement.src =
        variationImage;
    }

    if (imageContainer) {
      imageContainer.innerHTML = "";
    }
  } else {
    if (
      imageElement &&
      selectedProduct.imagem_principal
    ) {
      imageElement.src =
        selectedProduct.imagem_principal;
    }

    if (imageContainer) {
      imageContainer.innerHTML = "";
    }
  }

  if (priceContainer) {
    if (
      variation.preco_venda !== null &&
      variation.preco_venda !== undefined
    ) {
      priceContainer.innerHTML = `
        <strong>
          ${money(
            variation.preco_venda
          )}
        </strong>
      `;
    } else if (
      selectedProduct.preco_venda !== null &&
      selectedProduct.preco_venda !== undefined
    ) {
      priceContainer.innerHTML = `
        <strong>
          ${money(
            selectedProduct.preco_venda
          )}
        </strong>
      `;
    } else {
      priceContainer.innerHTML = `
        <span class="muted">
          Consulte
        </span>
      `;
    }
  }
}

function closeProductModal() {
  const modal =
    document.getElementById(
      "productModal"
    );

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }

  selectedProduct =
    null;

  selectedVariation =
    null;

  selectedQuantity =
    1;
}

function changeCatalogQuantity(
  amount
) {
  const element =
    document.getElementById(
      "catalogQuantity"
    );

  if (!element) {
    return;
  }

  let quantity =
    Number(
      element.textContent
    ) || 1;

  quantity +=
    Number(amount);

  if (quantity < 1) {
    quantity = 1;
  }

  element.textContent =
    quantity;

  selectedQuantity =
    quantity;
}

function changeCatalogVariation() {
  const select =
    document.getElementById(
      "catalogVariationSelect"
    );

  if (!select) {
    return;
  }

  selectCatalogVariation(
    select.value
  );
}

function addCatalogItem() {
  if (!selectedProduct) {
    return;
  }

  const quantityElement =
    document.getElementById("catalogQuantity");

  const quantity =
    Number(
      quantityElement?.textContent || 1
    );

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    alert(
      "Informe uma quantidade válida."
    );
    return;
  }

  const variations =
    Array.isArray(
      selectedProduct.variacoes
    )
      ? selectedProduct.variacoes
      : [];

  /*
   * Se o produto possui variações,
   * obriga o cliente a selecionar uma.
   */
  if (
    variations.length > 0 &&
    !selectedVariation
  ) {
    alert(
      "Selecione uma variação antes de adicionar o produto ao carrinho."
    );
    return;
  }

  const observationElement =
    document.getElementById(
      "catalogItemObservation"
    );

  const observation =
    observationElement?.value.trim() ||
    "";

  const variation =
    selectedVariation;

  const price =
    variation?.preco_venda ??
    selectedProduct.preco_venda;

  if (
    price === null ||
    price === undefined
  ) {
    alert(
      "Este produto não possui preço disponível para compra."
    );
    return;
  }

  catalogCart.push({
    produto_id:
      Number(
        selectedProduct.id
      ),

    variacao_id:
      variation
        ? Number(
            variation.id
          )
        : null,

    nome_produto:
      selectedProduct.nome,

    nome_variacao:
      variation?.nome || "",

    imagem:
      variation?.imagem ||
      selectedProduct.imagem_principal ||
      "",

    quantidade:
      quantity,

    preco_unitario:
      Number(price),

    observacao:
      observation
  });

  updateCartCount();

  closeProductModal();

  alert(
    "Produto adicionado ao carrinho."
  );
}

function updateCartCount() {
  const count =
    catalogCart.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.quantidade || 0
        ),
      0
    );

  const element =
    document.getElementById(
      "cartCount"
    );

  if (element) {
    element.textContent =
      count;
  }
}

function openCart() {
  renderCart();

  const modal =
    document.getElementById(
      "cartModal"
    );

  if (modal) {
    modal.classList.remove(
      "hidden"
    );
  }
}

function closeCart() {
  const modal =
    document.getElementById(
      "cartModal"
    );

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }
}

function renderCart() {
  const content =
    document.getElementById(
      "cartContent"
    );

  if (!content) {
    return;
  }

  if (!catalogCart.length) {
    content.innerHTML = `
      <div
        style="
          padding:40px 20px;
          text-align:center;
          color:#7b8391;
        "
      >
        Seu carrinho está vazio.
      </div>
    `;

    return;
  }

  let total = 0;

  content.innerHTML =
    catalogCart
      .map(
        (
          item,
          index
        ) => {
          const subtotal =
            Number(
              item.quantidade
            ) *
            Number(
              item.preco_unitario
            );

          total +=
            subtotal;

          return `
            <div class="cart-item">

              ${
                item.imagem
                  ? `
                    <img
                      src="${escapeHtml(
                        item.imagem
                      )}"
                      class="cart-item-image"
                    >
                  `
                  : `
                    <div class="cart-item-image"></div>
                  `
              }

              <div>

                <div class="cart-item-name">
                  ${escapeHtml(
                    item.nome_produto ||
                    ""
                  )}
                </div>

                ${
                  item.nome_variacao
                    ? `
                      <div class="cart-item-variation">
                        Variação:
                        ${escapeHtml(
                          item.nome_variacao
                        )}
                      </div>
                    `
                    : ""
                }

                <div
                  style="
                    font-size:11px;
                    color:#7b8391;
                    margin-top:4px;
                  "
                >
                  Quantidade:
                  ${item.quantidade}
                </div>

                ${
                  item.observacao
                    ? `
                      <div class="cart-item-observation">
                        ${escapeHtml(
                          item.observacao
                        )}
                      </div>
                    `
                    : ""
                }

                <button
                  type="button"
                  class="cart-item-remove"
                  onclick="removeCartItem(${index})"
                >
                  Remover
                </button>

              </div>

              <div class="cart-item-price">
                ${money(subtotal)}
              </div>

            </div>
          `;
        }
      )
      .join("") +
    `
      <div class="cart-total">
        <span>Total</span>
        <span>${money(total)}</span>
      </div>

      <div class="cart-actions">

        <button
          type="button"
          class="catalog-primary"
          onclick="openCheckout()"
        >
          Finalizar pedido
        </button>

      </div>
    `;
}

function removeCartItem(index) {
  catalogCart.splice(
    index,
    1
  );

  updateCartCount();

  renderCart();
}

function openCheckout() {
  if (!catalogCart.length) {
    alert(
      "Adicione pelo menos um produto ao carrinho."
    );

    return;
  }

  closeCart();

  renderCheckout();

  const modal =
    document.getElementById(
      "checkoutModal"
    );

  if (modal) {
    modal.classList.remove(
      "hidden"
    );
  }
}

function closeCheckout() {
  const modal =
    document.getElementById(
      "checkoutModal"
    );

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }
}

function renderCheckout() {
  const content =
    document.getElementById(
      "checkoutContent"
    );

  if (!content) {
    return;
  }

  content.innerHTML = `
    <div class="checkout-section">

      <h3>
        Dados do cliente
      </h3>

      <div class="catalog-form-grid">

        <div class="catalog-form-group catalog-form-full">

          <label>
            Tipo de cliente
          </label>

          <select
            id="checkoutTipoCliente"
            onchange="toggleCheckoutPJ()"
          >

            <option value="Pessoa Física">
              Pessoa Física
            </option>

            <option value="Pessoa Jurídica">
              Pessoa Jurídica
            </option>

          </select>

        </div>

        <div class="catalog-form-group catalog-form-full">

          <label>
            Nome
            <span class="checkout-required">*</span>
          </label>

          <input
            id="checkoutNome"
            type="text"
          >

        </div>

        <div
          id="checkoutRazaoSocialGroup"
          class="catalog-form-group"
          style="display:none;"
        >

          <label>
            Razão social
            <span class="checkout-required">*</span>
          </label>

          <input
            id="checkoutRazaoSocial"
            type="text"
          >

        </div>

        <div
          id="checkoutNomeFantasiaGroup"
          class="catalog-form-group"
          style="display:none;"
        >

          <label>
            Nome fantasia
          </label>

          <input
            id="checkoutNomeFantasia"
            type="text"
          >

        </div>

        <div
          id="checkoutCnpjGroup"
          class="catalog-form-group"
          style="display:none;"
        >

          <label>
            CNPJ
            <span class="checkout-required">*</span>
          </label>

          <input
            id="checkoutCnpj"
            type="text"
            placeholder="00.000.000/0000-00"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            Telefone
            <span class="checkout-required">*</span>
          </label>

          <input
            id="checkoutTelefone"
            type="text"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            WhatsApp
          </label>

          <input
            id="checkoutWhatsapp"
            type="text"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            E-mail

            <span
              id="checkoutEmailRequired"
              class="checkout-required"
              style="display:none;"
            >
              *
            </span>

          </label>

          <input
            id="checkoutEmail"
            type="email"
          >

        </div>

      </div>

    </div>

    <div class="checkout-section">

      <h3>
        Endereço de entrega
      </h3>

      <div class="catalog-form-grid">

        <div class="catalog-form-group">

          <label>
            CEP

            <span
              id="checkoutCepRequired"
              class="checkout-required"
              style="display:none;"
            >
              *
            </span>

          </label>

          <input
            id="checkoutCep"
            type="text"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            Estado

            <span
              id="checkoutEstadoRequired"
              class="checkout-required"
              style="display:none;"
            >
              *
            </span>

          </label>

          <input
            id="checkoutEstado"
            type="text"
            maxlength="2"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            Cidade

            <span
              id="checkoutCidadeRequired"
              class="checkout-required"
              style="display:none;"
            >
              *
            </span>

          </label>

          <input
            id="checkoutCidade"
            type="text"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            Bairro

            <span
              id="checkoutBairroRequired"
              class="checkout-required"
              style="display:none;"
            >
              *
            </span>

          </label>

          <input
            id="checkoutBairro"
            type="text"
          >

        </div>

        <div class="catalog-form-group catalog-form-full">

          <label>
            Endereço

            <span
              id="checkoutEnderecoRequired"
              class="checkout-required"
              style="display:none;"
            >
              *
            </span>

          </label>

          <input
            id="checkoutEndereco"
            type="text"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            Número

            <span
              id="checkoutNumeroRequired"
              class="checkout-required"
              style="display:none;"
            >
              *
            </span>

          </label>

          <input
            id="checkoutNumero"
            type="text"
          >

        </div>

        <div class="catalog-form-group">

          <label>
            Complemento
          </label>

          <input
            id="checkoutComplemento"
            type="text"
          >

        </div>

      </div>

    </div>

    <div class="checkout-section">

      <h3>
        Pedido
      </h3>

      <div class="catalog-form-grid">

        <div class="catalog-form-group">

          <label>
            Data desejada para entrega
          </label>

          <input
            id="checkoutDataEntrega"
            type="date"
          >

        </div>

        <div class="catalog-form-group catalog-form-full">

          <label>
            Observações gerais
          </label>

          <textarea
            id="checkoutObservacoes"
            placeholder="Informações gerais sobre o pedido..."
          ></textarea>

        </div>

      </div>

    </div>

    <div class="checkout-footer">

      <div class="checkout-total">

        <span>
          Total
        </span>

        <span>
          ${money(
            calculateCartTotal()
          )}
        </span>

      </div>

      <button
        type="button"
        class="catalog-primary"
        onclick="finishCatalogOrder()"
      >
        Enviar pedido
      </button>

    </div>
  `;

  toggleCheckoutPJ();
}

function toggleCheckoutPJ() {
  const type =
    document.getElementById(
      "checkoutTipoCliente"
    )?.value;

  const isPJ =
    type === "Pessoa Jurídica";

  const groups = [
    "checkoutRazaoSocialGroup",
    "checkoutNomeFantasiaGroup",
    "checkoutCnpjGroup"
  ];

  groups.forEach(
    id => {
      const element =
        document.getElementById(id);

      if (element) {
        element.style.display =
          isPJ
            ? ""
            : "none";
      }
    }
  );

  const requiredElements = [
    "checkoutEmailRequired",
    "checkoutCepRequired",
    "checkoutEstadoRequired",
    "checkoutCidadeRequired",
    "checkoutBairroRequired",
    "checkoutEnderecoRequired",
    "checkoutNumeroRequired"
  ];

  requiredElements.forEach(
    id => {
      const element =
        document.getElementById(id);

      if (element) {
        element.style.display =
          isPJ
            ? "inline"
            : "none";
      }
    }
  );
}

function calculateCartTotal() {
  return catalogCart.reduce(
    (
      total,
      item
    ) =>
      total +
      (
        Number(
          item.quantidade
        ) *
        Number(
          item.preco_unitario
        )
      ),
    0
  );
}

function getCheckoutValue(id) {
  return (
    document.getElementById(id)
      ?.value
      ?.trim() || ""
  );
}

function normalizeDocument(value) {
  return String(
    value || ""
  ).replace(
    /\D/g,
    ""
  );
}

async function finishCatalogOrder() {
  if (!catalogCart.length) {
    alert(
      "O carrinho está vazio."
    );

    return;
  }

  const tipoCliente =
    getCheckoutValue(
      "checkoutTipoCliente"
    );

  const nome =
    getCheckoutValue(
      "checkoutNome"
    );

  const telefone =
    getCheckoutValue(
      "checkoutTelefone"
    );

  const whatsapp =
    getCheckoutValue(
      "checkoutWhatsapp"
    );

  const email =
    getCheckoutValue(
      "checkoutEmail"
    );

  const razaoSocial =
    getCheckoutValue(
      "checkoutRazaoSocial"
    );

  const nomeFantasia =
    getCheckoutValue(
      "checkoutNomeFantasia"
    );

  const cnpj =
    normalizeDocument(
      getCheckoutValue(
        "checkoutCnpj"
      )
    );

  const cep =
    getCheckoutValue(
      "checkoutCep"
    );

  const endereco =
    getCheckoutValue(
      "checkoutEndereco"
    );

  const numero =
    getCheckoutValue(
      "checkoutNumero"
    );

  const complemento =
    getCheckoutValue(
      "checkoutComplemento"
    );

  const bairro =
    getCheckoutValue(
      "checkoutBairro"
    );

  const cidade =
    getCheckoutValue(
      "checkoutCidade"
    );

  const estado =
    getCheckoutValue(
      "checkoutEstado"
    );

  const dataEntrega =
    getCheckoutValue(
      "checkoutDataEntrega"
    );

  const observacoes =
    getCheckoutValue(
      "checkoutObservacoes"
    );

  if (!nome) {
    alert(
      "Informe o nome."
    );

    return;
  }

  if (!telefone) {
    alert(
      "Informe o telefone."
    );

    return;
  }

  if (
    tipoCliente ===
    "Pessoa Jurídica"
  ) {
    if (!cnpj) {
      alert(
        "Informe o CNPJ."
      );

      return;
    }

    if (!razaoSocial) {
      alert(
        "Informe a razão social."
      );

      return;
    }

    if (!email) {
      alert(
        "Informe o e-mail."
      );

      return;
    }

    if (!cep) {
      alert(
        "Informe o CEP."
      );

      return;
    }

    if (!endereco) {
      alert(
        "Informe o endereço."
      );

      return;
    }

    if (!numero) {
      alert(
        "Informe o número."
      );

      return;
    }

    if (!bairro) {
      alert(
        "Informe o bairro."
      );

      return;
    }

    if (!cidade) {
      alert(
        "Informe a cidade."
      );

      return;
    }

    if (!estado) {
      alert(
        "Informe o estado."
      );

      return;
    }
  }

  const cliente = {
    tipo_cliente:
      tipoCliente,

    nome:
      nome,

    razao_social:
      razaoSocial || null,

    nome_fantasia:
      nomeFantasia || null,

    cpf_cnpj:
      cnpj || null,

    email:
      email || null,

    telefone:
      telefone,

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
      estado || null
  };

  const itens =
    catalogCart.map(
      item => ({
        produto_id:
          Number(
            item.produto_id
          ),

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

        observacao:
          item.observacao || ""
      })
    );

  try {
    const button =
      document.querySelector(
        "#checkoutContent .catalog-primary"
      );

    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Enviando pedido...";
    }

    const result =
      await db.rpc(
        "gestao_loja_criar_pedido_catalogo",
        {
          p_id_loja:
            Number(
              catalogStoreId
            ),

          p_cliente:
            cliente,

          p_itens:
            itens,

          p_data_entrega:
            dataEntrega
              ? formatDateBR(
                  dataEntrega
                )
              : null,

          p_observacoes:
            observacoes ||
            null
        }
      );

    console.log(
      "Resultado do pedido:",
      result
    );

    if (result.error) {
      console.error(
        "Erro ao criar pedido:",
        result.error
      );

      alert(
        result.error.message ||
        "Não foi possível enviar o pedido."
      );

      if (button) {
        button.disabled =
          false;

        button.textContent =
          "Enviar pedido";
      }

      return;
    }

    let data =
      result.data;

    if (typeof data === "string") {
      try {
        data =
          JSON.parse(data);
      } catch (error) {
        console.error(
          "Erro ao interpretar resposta:",
          error
        );
      }
    }

    catalogCart = [];

    updateCartCount();

    closeCheckout();

    showOrderSuccess(
      data
    );

  } catch (error) {
    console.error(
      "Erro ao finalizar pedido:",
      error
    );

    alert(
      "Ocorreu um erro ao enviar o pedido."
    );
  }
}

function formatDateBR(date) {
  const parts =
    date.split("-");

  if (
    parts.length !== 3
  ) {
    return date;
  }

  return (
    parts[2] +
    "/" +
    parts[1] +
    "/" +
    parts[0]
  );
}

function showOrderSuccess(data) {
  const number =
    data?.numero ||
    data?.pedido_numero ||
    data?.pedido_id ||
    "";

  const content =
    document.getElementById(
      "checkoutContent"
    );

  const modal =
    document.getElementById(
      "checkoutModal"
    );

  if (modal) {
    modal.classList.remove(
      "hidden"
    );
  }

  if (!content) {
    alert(
      "Pedido enviado com sucesso!"
    );

    return;
  }

  content.innerHTML = `
    <div
      style="
        padding:45px 25px;
        text-align:center;
      "
    >

      <div
        style="
          font-size:50px;
          margin-bottom:15px;
        "
      >
        ✓
      </div>

      <h2>
        Pedido enviado!
      </h2>

      <p
        class="muted"
        style="
          margin-top:10px;
        "
      >
        Recebemos seu pedido e a loja irá analisá-lo.
      </p>

      ${
        number
          ? `
            <p
              style="
                margin-top:20px;
                font-weight:700;
              "
            >
              Pedido nº
              ${escapeHtml(
                String(number)
              )}
            </p>
          `
          : ""
      }

      <button
        type="button"
        class="catalog-primary"
        style="
          margin-top:20px;
        "
        onclick="closeCheckout()"
      >
        Fechar
      </button>

    </div>
  `;
}

function showCatalogMessage(message) {
  const container =
    document.getElementById(
      "catalogProducts"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="catalog-empty">
      ${escapeHtml(message)}
    </div>
  `;
}

window.openProduct =
  openProduct;

window.closeProductModal =
  closeProductModal;

window.changeCatalogQuantity =
  changeCatalogQuantity;

window.changeCatalogVariation =
  changeCatalogVariation;

window.selectCatalogVariation =
  selectCatalogVariation;

window.addCatalogItem =
  addCatalogItem;

window.updateCartCount =
  updateCartCount;

window.openCart =
  openCart;

window.closeCart =
  closeCart;

window.removeCartItem =
  removeCartItem;

window.openCheckout =
  openCheckout;

window.closeCheckout =
  closeCheckout;

window.toggleCheckoutPJ =
  toggleCheckoutPJ;

window.finishCatalogOrder =
  finishCatalogOrder;

window.renderCatalog =
  renderCatalog;

document.addEventListener(
  "DOMContentLoaded",
  async function () {
    const ready =
      await setupCatalogAccess();

    if (!ready) {
      return;
    }

    await loadCatalog();

    updateCartCount();
  }
);
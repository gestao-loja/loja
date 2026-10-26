/* ============================================
   ESTADO
   ============================================ */

let machines = [];
let machineConfigs = [];
let allConfigs = [];
let allGlobalConfigs = [];

let currentMachine = null;
let editingMachineId = null;
let editingConfigId = null;

let currentTab = "maquinas";

/* ID da loja matriz (global) */
const LOJA_MATRIZ_ID = 1;

/* ============================================
   HELPERS
   ============================================ */

function machineNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const n = Number(value);

  return Number.isNaN(n) ? String(value) : n;
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* Retorna true se o usuário atual pertence à loja matriz */
function isLojaMatriz() {
  return (
    currentStore &&
    Number(currentStore.id_loja) === LOJA_MATRIZ_ID
  );
}

/* ============================================
   TABS
   ============================================ */

function switchTab(tab) {
  currentTab = tab;

  const tabMaquinas = document.getElementById("tabMaquinas");
  const tabConsulta = document.getElementById("tabConsulta");
  const tabGlobais = document.getElementById("tabGlobais");

  const viewMaquinas = document.getElementById("viewMaquinas");
  const viewConsulta = document.getElementById("viewConsulta");
  const viewGlobais = document.getElementById("viewGlobais");

  // Remove active de todas
  tabMaquinas?.classList.remove("active");
  tabConsulta?.classList.remove("active");
  tabGlobais?.classList.remove("active");

  // Esconde todas as views
  if (viewMaquinas) viewMaquinas.style.display = "none";
  if (viewConsulta) viewConsulta.style.display = "none";
  if (viewGlobais) viewGlobais.style.display = "none";

  if (tab === "consulta") {
    tabConsulta?.classList.add("active");
    if (viewConsulta) viewConsulta.style.display = "";

    loadAllConfigs();
  } else if (tab === "globais") {
    tabGlobais?.classList.add("active");
    if (viewGlobais) viewGlobais.style.display = "";

    loadGlobalConfigs();
  } else {
    tabMaquinas?.classList.add("active");
    if (viewMaquinas) viewMaquinas.style.display = "";

    renderMachines();
  }
}

/* ============================================
   LOADERS
   ============================================ */

async function loadMachines() {
  const { data, error } = await db
    .from("gestao_loja_maquinas")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (error) throw error;

  machines = data || [];
}

async function loadMachineConfigs(machineId) {
  const { data, error } = await db
    .from("gestao_loja_maquinas_configuracoes")
    .select("*")
    .eq("id_loja", currentStore.id_loja)
    .eq("maquina_id", machineId)
    .order("nome");

  if (error) throw error;

  machineConfigs = data || [];
}

async function loadAllConfigs() {
  const container = document.getElementById("consultaList");

  if (container) {
    container.innerHTML = `
      <div class="consulta-vazio">
        Carregando...
      </div>
    `;
  }

  const { data, error } = await db
    .from("gestao_loja_maquinas_configuracoes")
    .select(`
      *,
      gestao_loja_maquinas (
        id,
        nome,
        tipo,
        marca,
        modelo
      )
    `)
    .eq("id_loja", currentStore.id_loja)
    .order("nome");

  if (error) {
    if (container) {
      container.innerHTML = `
        <div class="message error">
          ${escapeHtml(error.message)}
        </div>
      `;
    }
    return;
  }

  allConfigs = data || [];

  renderConsulta();
}

/*
 * Carrega SOMENTE as configurações globais:
 *   - pertencem à loja matriz (id_loja = 1)
 *   - têm a flag global = true
 */
async function loadGlobalConfigs() {
  const container = document.getElementById("globaisList");

  if (container) {
    container.innerHTML = `
      <div class="consulta-vazio">
        Carregando...
      </div>
    `;
  }

  const { data, error } = await db
    .from("gestao_loja_maquinas_configuracoes")
    .select(`
      *,
      gestao_loja_maquinas (
        id,
        nome,
        tipo,
        marca,
        modelo
      )
    `)
    .eq("id_loja", LOJA_MATRIZ_ID)
    .eq("global", true)
    .order("nome");

  if (error) {
    if (container) {
      container.innerHTML = `
        <div class="message error">
          ${escapeHtml(error.message)}
        </div>
      `;
    }
    return;
  }

  allGlobalConfigs = data || [];

  renderGlobais();
}

/* ============================================
   RENDER — LISTA DE MÁQUINAS
   ============================================ */

async function renderMachines() {
  try {
    await loadMachines();
  } catch (e) {
    document.getElementById("machinesList").innerHTML =
      '<div class="message error">' +
      escapeHtml(e.message) +
      "</div>";
    return;
  }

  const container = document.getElementById("machinesList");

  if (!container) return;

  if (!machines.length) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma máquina cadastrada.
      </div>
    `;
    return;
  }

  container.innerHTML = machines
    .map(function (m) {
      return `
        <div
          class="card"
          style="
            margin-bottom:15px;
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:15px;
            flex-wrap:wrap;
          "
        >

          <div>

            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">

              <strong style="font-size:18px;">
                ${escapeHtml(m.nome)}
              </strong>

              <span
                class="badge ${
                  m.ativo ? "badge-green" : "badge-red"
                }"
              >
                ${m.ativo ? "Ativa" : "Inativa"}
              </span>

            </div>

            <div class="muted" style="margin-top:5px;">

              ${m.tipo ? escapeHtml(m.tipo) : "-"}

              ${m.marca ? " • " + escapeHtml(m.marca) : ""}

              ${m.modelo ? " " + escapeHtml(m.modelo) : ""}

            </div>

          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">

            <button
              class="btn btn-primary"
              onclick="openMachineConfigs(${m.id})"
            >
              Configurações
            </button>

            <button
              class="btn btn-secondary"
              onclick="editMachine(${m.id})"
            >
              Editar
            </button>

            <button
              class="btn btn-danger"
              onclick="deleteMachine(${m.id})"
            >
              Excluir
            </button>

          </div>

        </div>
      `;
    })
    .join("");
}

/* ============================================
   RENDER — CONSULTA (configs da própria loja)
   ============================================ */

function renderConsulta() {
  const container = document.getElementById("consultaList");

  if (!container) return;

  const searchEl = document.getElementById("consultaBusca");

  const search = normalizeSearch(
    searchEl ? searchEl.value : ""
  );

  const filtered = search
    ? allConfigs.filter(function (c) {
        const machineName = c.gestao_loja_maquinas?.nome || "";

        const fields = [
          c.nome,
          c.material,
          c.prensa,
          c.pressao,
          c.observacoes,
          machineName
        ];

        return fields.some(function (f) {
          return normalizeSearch(f).includes(search);
        });
      })
    : allConfigs;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="consulta-vazio">
        Nenhuma configuração encontrada.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map(function (c) {
      const m = c.gestao_loja_maquinas;

      return renderConfigCard(c, m, false);
    })
    .join("");
}

/* ============================================
   RENDER — CONFIGURAÇÕES GERAIS (loja 1 + global)
   ============================================ */

function renderGlobais() {
  const container = document.getElementById("globaisList");

  if (!container) return;

  const searchEl = document.getElementById("globaisBusca");

  const search = normalizeSearch(
    searchEl ? searchEl.value : ""
  );

  const filtered = search
    ? allGlobalConfigs.filter(function (c) {
        const machineName = c.gestao_loja_maquinas?.nome || "";

        const fields = [
          c.nome,
          c.material,
          c.prensa,
          c.pressao,
          c.observacoes,
          machineName
        ];

        return fields.some(function (f) {
          return normalizeSearch(f).includes(search);
        });
      })
    : allGlobalConfigs;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="consulta-vazio">
        Nenhuma configuração global cadastrada pela matriz.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map(function (c) {
      const m = c.gestao_loja_maquinas;

      return renderConfigCard(c, m, true);
    })
    .join("");
}

/* ============================================
   RENDER — CARD DE CONFIGURAÇÃO (reutilizável)
   ============================================ */

function renderConfigCard(c, machine, showGlobalTag) {
  return `
    <div class="consulta-card">

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:10px;
          flex-wrap:wrap;
        "
      >

        <div>
          <div class="consulta-card-title">
            ${escapeHtml(c.nome)}
            ${showGlobalTag ? '<span class="tag-global">Global</span>' : ''}
          </div>

          ${c.prensa
            ? `<div class="consulta-card-prensa">
                 Prensa: ${escapeHtml(c.prensa)}
               </div>`
            : ""}
        </div>

        ${machine
          ? `<span class="consulta-maquina-tag">
               ${escapeHtml(machine.nome)}
             </span>`
          : ""}

      </div>

      <div class="consulta-grid">

        ${
          c.material
            ? `
              <div>
                <div class="consulta-field-label">
                  Produto
                </div>
                <div class="consulta-field-value">
                  ${escapeHtml(c.material)}
                </div>
              </div>
            `
            : ""
        }

        ${
          c.temperatura !== null &&
          c.temperatura !== undefined
            ? `
              <div>
                <div class="consulta-field-label">
                  Temperatura
                </div>
                <div class="consulta-field-value">
                  ${machineNumber(c.temperatura)} °C
                </div>
              </div>
            `
            : ""
        }

        ${
          c.tempo !== null &&
          c.tempo !== undefined
            ? `
              <div>
                <div class="consulta-field-label">
                  Tempo
                </div>
                <div class="consulta-field-value">
                  ${machineNumber(c.tempo)} s
                </div>
              </div>
            `
            : ""
        }

        ${
          c.pressao
            ? `
              <div>
                <div class="consulta-field-label">
                  Pressão
                </div>
                <div class="consulta-field-value">
                  ${escapeHtml(c.pressao)}
                </div>
              </div>
            `
            : ""
        }

      </div>

      ${
        c.observacoes
          ? `
            <div
              class="muted"
              style="
                margin-top:14px;
                white-space:pre-wrap;
                font-size:12px;
                line-height:1.5;
              "
            >
              ${escapeHtml(c.observacoes)}
            </div>
          `
          : ""
      }

    </div>
  `;
}

/* ============================================
   FORMULÁRIO DA MÁQUINA
   ============================================ */

function machineForm(m = {}) {
  return `
    <form onsubmit="saveMachine(event, ${
      m.id ? "'" + m.id + "'" : "null"
    })">

      <div>
        <label>Nome *</label>
        <input
          id="m_nome"
          required
          value="${escapeHtml(m.nome || "")}"
          placeholder="Ex.: Prensa térmica 40x60"
        >
      </div>

      <div class="grid2" style="margin-top:15px;">

        <div>
          <label>Tipo de máquina</label>
          <select id="m_tipo">
            ${[
              "",
              "Prensa térmica (sublimação)",
              "Prensa térmica (DTF)",
              "Impressora DTF",
              "Impressora sublimática",
              "Plotter de recorte",
              "Máquina de bordado",
              "Laser",
              "Outra"
            ]
              .map(
                (opt) => `
                  <option
                    value="${escapeHtml(opt)}"
                    ${
                      String(m.tipo || "") === opt
                        ? "selected"
                        : ""
                    }
                  >
                    ${opt || "Selecione..."}
                  </option>
                `
              )
              .join("")}
          </select>
        </div>

        <div>
          <label>Marca</label>
          <input
            id="m_marca"
            value="${escapeHtml(m.marca || "")}"
          >
        </div>

      </div>

      <div class="grid2" style="margin-top:15px;">

        <div>
          <label>Modelo</label>
          <input
            id="m_modelo"
            value="${escapeHtml(m.modelo || "")}"
          >
        </div>

        <div>
          <label>Número de série</label>
          <input
            id="m_serie"
            value="${escapeHtml(m.numero_serie || "")}"
          >
        </div>

      </div>

      <div style="margin-top:15px;">
        <label>Observações</label>
        <textarea
          id="m_obs"
          rows="3"
        >${escapeHtml(m.observacoes || "")}</textarea>
      </div>

      <label style="margin-top:15px;display:block;">
        <input
          id="m_ativo"
          type="checkbox"
          style="width:auto"
          ${m.ativo !== false ? "checked" : ""}
        >
        Máquina ativa
      </label>

      <button
        class="btn btn-primary full"
        type="submit"
        style="margin-top:20px;"
      >
        Salvar máquina
      </button>

    </form>
  `;
}

function newMachine() {
  editingMachineId = null;
  openModal("Nova máquina", machineForm({ ativo: true }));
}

function editMachine(id) {
  const m = machines.find((x) => String(x.id) === String(id));
  if (!m) return;
  editingMachineId = id;
  openModal("Editar máquina", machineForm(m));
}

async function saveMachine(ev, id) {
  ev.preventDefault();

  const payload = {
    id_loja: currentStore.id_loja,
    nome: document.getElementById("m_nome").value.trim(),
    tipo: document.getElementById("m_tipo").value.trim() || null,
    marca: document.getElementById("m_marca").value.trim() || null,
    modelo: document.getElementById("m_modelo").value.trim() || null,
    numero_serie:
      document.getElementById("m_serie").value.trim() || null,
    observacoes:
      document.getElementById("m_obs").value.trim() || null,
    ativo: document.getElementById("m_ativo").checked
  };

  let result;

  if (id) {
    result = await db
      .from("gestao_loja_maquinas")
      .update(payload)
      .eq("id", id)
      .eq("id_loja", currentStore.id_loja);
  } else {
    result = await db.from("gestao_loja_maquinas").insert(payload);
  }

  if (result.error) {
    alert("Erro ao salvar máquina:\n" + result.error.message);
    return;
  }

  closeModal();
  await renderMachines();
}

async function deleteMachine(id) {
  const m = machines.find((x) => String(x.id) === String(id));
  if (!m) return;

  const confirmed = confirm(
    `Excluir a máquina "${m.nome}"?\n\n` +
      `Todas as configurações vinculadas também serão excluídas.`
  );

  if (!confirmed) return;

  const { error } = await db
    .from("gestao_loja_maquinas")
    .delete()
    .eq("id", id)
    .eq("id_loja", currentStore.id_loja);

  if (error) {
    alert("Erro ao excluir:\n" + error.message);
    return;
  }

  await renderMachines();
}

/* ============================================
   CONFIGURAÇÕES DA MÁQUINA
   ============================================ */

async function openMachineConfigs(machineId) {
  const m = machines.find((x) => String(x.id) === String(machineId));
  if (!m) return;

  currentMachine = m;

  try {
    await loadMachineConfigs(machineId);
  } catch (e) {
    alert("Erro ao carregar configurações:\n" + e.message);
    return;
  }

  renderConfigsModal();
}

function renderConfigsModal() {
  const m = currentMachine;

  const configsHtml = machineConfigs.length
    ? machineConfigs
        .map(function (c) {
          return `
            <div
              style="
                border:1px solid #ddd;
                border-radius:8px;
                padding:15px;
                margin-bottom:12px;
              "
            >

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  align-items:flex-start;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >

                <div>

                  <strong style="font-size:16px;">
                    ${escapeHtml(c.nome)}
                  </strong>

                  ${c.global ? '<span class="tag-global">Global</span>' : ''}

                  ${
                    c.prensa
                      ? `<div class="muted" style="margin-top:3px;">
                           Prensa: ${escapeHtml(c.prensa)}
                         </div>`
                      : ""
                  }

                </div>

                <div style="display:flex;gap:8px;">

                  <button
                    class="btn btn-secondary"
                    onclick="editConfig(${c.id})"
                  >
                    Editar
                  </button>

                  <button
                    class="btn btn-danger"
                    onclick="deleteConfig(${c.id})"
                  >
                    Excluir
                  </button>

                </div>

              </div>

              <div
                class="consulta-grid"
                style="margin-top:14px;"
              >

                ${
                  c.material
                    ? `<div>
                         <div class="consulta-field-label">
                           Produto
                         </div>
                         <div class="consulta-field-value">
                           ${escapeHtml(c.material)}
                         </div>
                       </div>`
                    : ""
                }

                ${
                  c.temperatura !== null &&
                  c.temperatura !== undefined
                    ? `<div>
                         <div class="consulta-field-label">
                           Temperatura
                         </div>
                         <div class="consulta-field-value">
                           ${machineNumber(c.temperatura)} °C
                         </div>
                       </div>`
                    : ""
                }

                ${
                  c.tempo !== null && c.tempo !== undefined
                    ? `<div>
                         <div class="consulta-field-label">
                           Tempo
                         </div>
                         <div class="consulta-field-value">
                           ${machineNumber(c.tempo)} s
                         </div>
                       </div>`
                    : ""
                }

                ${
                  c.pressao
                    ? `<div>
                         <div class="consulta-field-label">
                           Pressão
                         </div>
                         <div class="consulta-field-value">
                           ${escapeHtml(c.pressao)}
                         </div>
                       </div>`
                    : ""
                }

              </div>

              ${
                c.observacoes
                  ? `<div
                       class="muted"
                       style="
                         margin-top:12px;
                         white-space:pre-wrap;
                         font-size:12px;
                       "
                     >
                       ${escapeHtml(c.observacoes)}
                     </div>`
                  : ""
              }

            </div>
          `;
        })
        .join("")
    : `
      <div class="empty" style="padding:25px;">
        Nenhuma configuração cadastrada para esta máquina.
      </div>
    `;

  openModal(
    `Configurações — ${m.nome}`,
    `
      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:15px;
          gap:10px;
          flex-wrap:wrap;
        "
      >

        <div class="muted">
          ${machineConfigs.length} configuração(ões)
        </div>

        <button
          class="btn btn-primary"
          onclick="newConfig()"
        >
          + Nova configuração
        </button>

      </div>

      <div id="configsList">
        ${configsHtml}
      </div>
    `
  );
}

function configForm(c = {}) {
  /*
   * O checkbox "Configuração global" só é exibido
   * quando o usuário logado pertence à loja matriz (id_loja = 1).
   * Se quiser exibir para todos, remova o if (isLojaMatriz()) abaixo.
   */
  const mostrarGlobal = isLojaMatriz();

  const globalCheckbox = mostrarGlobal
    ? `
      <div
        style="
          margin-top:15px;
          padding:12px;
          background:#f8f9fa;
          border:1px solid #e5e8ed;
          border-radius:8px;
        "
      >
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;">
          <input
            id="c_global"
            type="checkbox"
            style="width:auto;margin:0;"
            ${c.global ? "checked" : ""}
          >
          <span>
            Configuração global
            <small class="muted" style="display:block;font-weight:400;">
              Visível para todas as lojas na aba "Configurações gerais".
            </small>
          </span>
        </label>
      </div>
    `
    : "";

  return `
    <form onsubmit="saveConfig(event, ${
      c.id ? "'" + c.id + "'" : "null"
    })">

      <div>
        <label>Nome da configuração *</label>
        <input
          id="c_nome"
          required
          value="${escapeHtml(c.nome || "")}"
          placeholder="Ex.: Caneca cerâmica branca"
        >
      </div>

      <div class="grid2" style="margin-top:15px;">

        <div>
          <label>Produto</label>
          <input
            id="c_material"
            value="${escapeHtml(c.material || "")}"
            placeholder="Ex.: Caneca cerâmica"
          >
        </div>

        <div>
          <label>Prensa</label>
          <input
            id="c_prensa"
            value="${escapeHtml(c.prensa || "")}"
            placeholder="Ex.: 40x60, 3D, Caneca..."
          >
        </div>

      </div>

      <div class="grid2" style="margin-top:15px;">

        <div>
          <label>Temperatura (°C)</label>
          <input
            id="c_temp"
            type="number"
            step="1"
            min="0"
            value="${c.temperatura ?? ""}"
          >
        </div>

        <div>
          <label>Tempo (segundos)</label>
          <input
            id="c_tempo"
            type="number"
            step="1"
            min="0"
            value="${c.tempo ?? ""}"
          >
        </div>

      </div>

      <div style="margin-top:15px;">
        <label>Pressão</label>
        <input
          id="c_pressao"
          value="${escapeHtml(c.pressao || "")}"
          placeholder="Ex.: Média, Leve, 4 bar..."
        >
      </div>

      <div style="margin-top:15px;">
        <label>Observações</label>
        <textarea
          id="c_obs"
          rows="3"
        >${escapeHtml(c.observacoes || "")}</textarea>
      </div>

      ${globalCheckbox}

      <button
        class="btn btn-primary full"
        type="submit"
        style="margin-top:20px;"
      >
        Salvar configuração
      </button>

    </form>
  `;
}

function newConfig() {
  editingConfigId = null;
  openModal("Nova configuração", configForm({}));
}

function editConfig(id) {
  const c = machineConfigs.find((x) => String(x.id) === String(id));
  if (!c) return;
  editingConfigId = id;
  openModal("Editar configuração", configForm(c));
}

async function saveConfig(ev, id) {
  ev.preventDefault();

  if (!currentMachine) return;

  const tempValue = document.getElementById("c_temp").value;
  const tempoValue = document.getElementById("c_tempo").value;

  /*
   * A flag global só é enviada se o usuário for da loja matriz.
   * Se não for, o payload NÃO inclui a chave (mantém o valor atual no banco).
   */
  const globalEl = document.getElementById("c_global");

  const payload = {
    id_loja: currentStore.id_loja,
    maquina_id: currentMachine.id,
    nome: document.getElementById("c_nome").value.trim(),
    material:
      document.getElementById("c_material").value.trim() || null,
    prensa:
      document.getElementById("c_prensa").value.trim() || null,
    temperatura: tempValue === "" ? null : Number(tempValue),
    tempo: tempoValue === "" ? null : Number(tempoValue),
    pressao:
      document.getElementById("c_pressao").value.trim() || null,
    observacoes:
      document.getElementById("c_obs").value.trim() || null
  };

  if (globalEl) {
    payload.global = globalEl.checked;
  }

  let result;

  if (id) {
    result = await db
      .from("gestao_loja_maquinas_configuracoes")
      .update(payload)
      .eq("id", id)
      .eq("id_loja", currentStore.id_loja);
  } else {
    result = await db
      .from("gestao_loja_maquinas_configuracoes")
      .insert(payload);
  }

  if (result.error) {
    alert("Erro ao salvar configuração:\n" + result.error.message);
    return;
  }

  closeModal();
  await loadMachineConfigs(currentMachine.id);
  renderConfigsModal();
}

async function deleteConfig(id) {
  const c = machineConfigs.find((x) => String(x.id) === String(id));
  if (!c) return;

  const confirmed = confirm(
    `Excluir a configuração "${c.nome}"?`
  );
  if (!confirmed) return;

  const { error } = await db
    .from("gestao_loja_maquinas_configuracoes")
    .delete()
    .eq("id", id)
    .eq("id_loja", currentStore.id_loja);

  if (error) {
    alert("Erro ao excluir:\n" + error.message);
    return;
  }

  await loadMachineConfigs(currentMachine.id);
  renderConfigsModal();
}

/* ============================================
   INIT
   ============================================ */

document.addEventListener("DOMContentLoaded", async function () {
  try {
    const authenticated = await requireAuth();
    if (!authenticated) return;

    if (!currentUser) return;

    const contextLoaded = await loadUserContext();
    if (!contextLoaded) return;

    try {
      if (typeof loadMenu === "function") {
        await loadMenu();
      }
    } catch (menuError) {
      console.warn("Falha ao carregar menu:", menuError);
    }

    try {
      if (typeof setActiveNav === "function") {
        setActiveNav();
      }
    } catch (navError) {
      console.warn("Falha ao marcar nav ativo:", navError);
    }

    const subtitle = document.getElementById("pageSubtitle");
    if (subtitle) {
      subtitle.textContent =
        "Máquinas e configurações de produção";
    }

    await renderMachines();
  } catch (error) {
    console.error("Erro na página de máquinas:", error);

    const container = document.getElementById("machinesList");
    if (container) {
      container.innerHTML = `
        <div class="card">
          <h3>Erro ao carregar a página</h3>
          <p>${escapeHtml(error.message || "Erro desconhecido.")}</p>
        </div>
      `;
    }
  }
});
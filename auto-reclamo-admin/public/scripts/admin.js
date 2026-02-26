/* ------------------------ ADMIN.JS – Bootstrap y constantes ------------------------ */
console.log('[admin] toasts cargados'); // debug: confirma que el archivo se cargó

function normalizeBaseUrl(raw) {
  return String(raw || '').trim().replace(/\/+$/, '');
}

function resolveApiBaseUrl() {
  const fromWindow = normalizeBaseUrl(window.__API_BASE_URL__);
  if (fromWindow) return fromWindow;

  const meta = document.querySelector('meta[name="api-base-url"]');
  const fromMeta = normalizeBaseUrl(meta ? meta.getAttribute('content') : '');
  if (fromMeta) return fromMeta;

  const host = String(location.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  if (host === 'siniestroya.com.ar' || host.endsWith('.siniestroya.com.ar')) {
    return 'https://api.siniestroya.com.ar';
  }

  return '';
}

const PUBLIC_BASE = resolveApiBaseUrl();
const BASE = PUBLIC_BASE ? `${PUBLIC_BASE}/api` : '/api';
const API = {
  clientes:    ()       => `${BASE}/clientes`,
  cliente:     id       => `${BASE}/clientes/${id}`,
  reclamos:    id       => `${BASE}/clientes/${id}/reclamos`,
  reclamo:     id       => `${BASE}/reclamos/${id}`,
  update:      (t, id)  => `${BASE}/${t}/${id}`,
  comentarios: id       => `${BASE}/reclamos/${id}/comentarios`
};

const LOGIN_PAGE = 'login.html';
const ALLOWED_NEXT_PAGES = new Set([
  'index.html',
  'clientes.html',
  'reclamos.html',
  'editar.html',
  'editar_cliente.html'
]);

function getCurrentPage() {
  return location.pathname.split('/').pop() || 'index.html';
}

function clearAdminState() {
  try {
    sessionStorage.removeItem('clienteId');
    sessionStorage.removeItem('clienteName');
  } catch {}
}

function normalizeNextPage(rawNext) {
  const fallback = 'index.html';
  const next = String(rawNext || '').trim();
  if (!next) return fallback;
  if (next.includes('://') || next.startsWith('//')) return fallback;

  const [pathPart, queryPart = ''] = next.split('?');
  const page = (pathPart.split('/').pop() || '').trim();
  if (!ALLOWED_NEXT_PAGES.has(page)) return fallback;

  return queryPart ? `${page}?${queryPart}` : page;
}

function redirectToLogin() {
  if (getCurrentPage() === LOGIN_PAGE) return;
  const current = `${getCurrentPage()}${location.search || ''}`;
  location.href = `${LOGIN_PAGE}?next=${encodeURIComponent(current || 'index.html')}`;
}

async function logoutAdmin() {
  try {
    await fetch(`${BASE}/admin/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch {}
  clearAdminState();
  redirectToLogin();
}

function ensureLogoutLink() {
  const menu = document.querySelector('.menu');
  if (!menu || menu.querySelector('[data-action="logout"]')) return;

  const link = document.createElement('a');
  link.href = '#';
  link.dataset.action = 'logout';
  link.innerHTML = `<i class="fas fa-right-from-bracket"></i><span>Salir</span>`;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    logoutAdmin();
  });
  menu.appendChild(link);
}

async function ensureAdminSession() {
  try {
    const r = await fetch(`${BASE}/admin/me`, {
      credentials: 'include'
    });
    if (!r.ok) {
      clearAdminState();
      redirectToLogin();
      return false;
    }
    return true;
  } catch {
    toast('No se pudo verificar la sesion del admin.', 'error');
    return false;
  }
}

/* ------------------------ UTIL – QueryString y navegación de retorno ------------------------ */
function getQS(name){
  const sp = new URLSearchParams(location.search);
  const v = sp.get(name);
  return v === null ? '' : v;
}

/* Vuelve a la pantalla de reclamos correcta tras editar (conserva filtros si venías de "todos") */
function goBackAfterEdit(){
  const from   = (getQS('from') || '').toLowerCase();
  const estado = getQS('estado') || '';
  const period = getQS('period') || getQS('mes') || '';
  const page   = getQS('page') || '';

  // Base: lista general o por cliente
  let url = (from === 'all') ? 'reclamos.html?mode=all' : 'reclamos.html';

  // Si venías de la general y había filtros, se preservan
  if (from === 'all') {
    const sp = new URLSearchParams();
    sp.set('mode', 'all');
    if (estado) sp.set('estado', estado);
    if (period) sp.set('period', period);
    if (/^\d+$/.test(page) && Number(page) > 1) sp.set('page', page);
    url = `reclamos.html?${sp.toString()}`;
  }

  location.href = url;
}

/* ------------------------ TOASTS – Helpers de notificaciones ------------------------ */
/* Asegura el contenedor de toasts y lo crea si no existe */
function ensureToastStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

/* Muestra un toast (success|error|info) con autodesaparición */
function toast(message, type = 'success', ms = 2200) {
  const stack = ensureToastStack();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    setTimeout(() => el.remove(), 250);
  }, ms);
}

/* ------------------------ MODAL CONFIRMAR ELIMINACION ------------------------ */
let deleteConfirmOpen = false;

function ensureDeleteConfirmModal() {
  let overlay = document.getElementById('confirm-delete-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'confirm-delete-overlay';
  overlay.className = 'confirm-overlay';
  overlay.setAttribute('hidden', 'hidden');
  overlay.innerHTML = `
    <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-message">
      <div class="confirm-dialog__icon" aria-hidden="true">
        <i class="fas fa-triangle-exclamation"></i>
      </div>
      <h3 id="confirm-delete-title">Eliminar cliente</h3>
      <p id="confirm-delete-message">Esta accion eliminara el cliente y todos sus reclamos.</p>
      <div class="confirm-dialog__actions">
        <button type="button" class="btn-hero outline alt confirm-cancel" id="confirm-delete-cancel">Cancelar</button>
        <button type="button" class="btn-hero solid confirm-accept" id="confirm-delete-accept">Si, eliminar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function askDeleteConfirm({
  title = 'Eliminar cliente',
  message = 'Esta accion eliminara el cliente y todos sus reclamos. Esta accion no se puede deshacer.'
} = {}) {
  if (deleteConfirmOpen) return Promise.resolve(false);
  deleteConfirmOpen = true;

  const overlay = ensureDeleteConfirmModal();
  const titleEl = overlay.querySelector('#confirm-delete-title');
  const msgEl = overlay.querySelector('#confirm-delete-message');
  const btnCancel = overlay.querySelector('#confirm-delete-cancel');
  const btnAccept = overlay.querySelector('#confirm-delete-accept');

  if (!titleEl || !msgEl || !btnCancel || !btnAccept) {
    deleteConfirmOpen = false;
    return Promise.resolve(false);
  }

  titleEl.textContent = title;
  msgEl.textContent = message;
  overlay.hidden = false;
  overlay.classList.add('is-open');

  return new Promise((resolve) => {
    const close = (accepted) => {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
      deleteConfirmOpen = false;
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeyDown);
      btnCancel.removeEventListener('click', onCancel);
      btnAccept.removeEventListener('click', onAccept);
      resolve(accepted);
    };

    const onCancel = () => close(false);
    const onAccept = () => close(true);
    const onOverlayClick = (e) => {
      if (e.target === overlay) close(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      }
    };

    btnCancel.addEventListener('click', onCancel);
    btnAccept.addEventListener('click', onAccept);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeyDown);

    btnCancel.focus();
  });
}

/* ------------------------ FETCH - Helper JSON con manejo de errores ------------------------ */
async function apiJson(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    credentials: 'include',
    headers: opts.headers || {}
  });
  if (r.status === 401) {
    clearAdminState();
    redirectToLogin();
    throw new Error('No autorizado');
  }
  if (!r.ok) {
    let msg = 'Error';
    try { msg = (await r.json()).error || (await r.text()); } catch {}
    throw new Error(msg || 'Error');
  }
  return r.status === 204 ? null : r.json();
}

/* ------------------------ DESCARGA ROBUSTA (NO navega) ------------------------ */
function forceDownload(url, filename){
  fetch(url, { credentials: 'include' })
    .then(r => {
      if (!r.ok) throw new Error('No se pudo descargar (HTTP ' + r.status + ')');
      return r.blob();
    })
    .then(blob => {
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = filename || 'archivo';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    })
    .catch(err => {
      console.error(err);
      toast('No se pudo descargar: ' + (err.message || 'Error'), 'error');
    });
}

/* Útil para debug: muestra en consola si la URL da 404 */
function debugImg(url){
  fetch(url, { method: 'HEAD', credentials: 'include' })
    .then(r => console.log('[IMG HEAD]', url, r.status))
    .catch(e => console.log('[IMG HEAD ERROR]', url, e));
}

function bindStaticNavButtons() {
  document.querySelectorAll('[data-nav-href]').forEach((btn) => {
    if (btn.dataset.navBound === '1') return;
    btn.dataset.navBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = String(btn.getAttribute('data-nav-href') || '').trim();
      if (!target || target.includes('://') || target.startsWith('//')) return;
      location.href = target;
    });
  });
}

/* ------------------------ ROUTER – Arranque por página ------------------------ */
document.addEventListener('DOMContentLoaded', async () => {
  const page = getCurrentPage();
  bindStaticNavButtons();

  if (page === LOGIN_PAGE) {
    initLoginPage();
    return;
  }

  const ok = await ensureAdminSession();
  if (!ok) return;

  ensureLogoutLink();

  if (!page || page === 'index.html') { actualizarEstadisticas(); }
  if (page === 'clientes.html')       { cargarClientes(); enlazarAccionesClientes(); }
  if (page === 'reclamos.html')       { routerReclamos(); }
  if (page === 'editar.html')         { cargarFormularioReclamo(); }
  if (page === 'editar_cliente.html') { cargarFormularioCliente(); }
});

async function initLoginPage() {
  const form = document.getElementById('admin-login-form');
  const emailInput = document.getElementById('admin-email');
  const passInput = document.getElementById('admin-password');
  const passToggleBtn = document.getElementById('admin-pass-toggle');
  const passToggleIcon = passToggleBtn?.querySelector('i');
  const errorBox = document.getElementById('admin-login-error');
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (!form || !emailInput || !passInput || !errorBox || !submitBtn) return;

  const next = normalizeNextPage(new URLSearchParams(location.search).get('next'));

  try {
    const r = await fetch(`${BASE}/admin/me`, { credentials: 'include' });
    if (r.ok) {
      location.href = next;
      return;
    }
  } catch {}

  const setInvalidInputs = (active) => {
    emailInput.classList.toggle('is-invalid', active);
    passInput.classList.toggle('is-invalid', active);
  };

  const showError = (message) => {
    errorBox.hidden = !message;
    errorBox.textContent = message || '';
    setInvalidInputs(Boolean(message));
  };

  const clearInlineError = () => {
    if (errorBox.hidden) return;
    errorBox.hidden = true;
    errorBox.textContent = '';
    setInvalidInputs(false);
  };

  emailInput.addEventListener('input', clearInlineError);
  passInput.addEventListener('input', clearInlineError);

  if (passToggleBtn) {
    passToggleBtn.addEventListener('click', () => {
      const isVisible = passInput.type === 'text';
      passInput.type = isVisible ? 'password' : 'text';
      passToggleBtn.setAttribute('aria-pressed', String(!isVisible));
      passToggleBtn.setAttribute('aria-label', isVisible ? 'Mostrar contrasena' : 'Ocultar contrasena');
      if (passToggleIcon) {
        passToggleIcon.classList.toggle('fa-eye', isVisible);
        passToggleIcon.classList.toggle('fa-eye-slash', !isVisible);
      }
      passInput.focus();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    const email = String(emailInput.value || '').trim();
    const password = String(passInput.value || '');
    if (!email || !password) {
      showError('Completa email y contrasena.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    const oldText = submitBtn.textContent.trim();
    submitBtn.textContent = 'INICIANDO...';

    try {
      const r = await fetch(`${BASE}/admin/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(payload?.error || 'Credenciales invalidas.');
      }

      location.href = next;
    } catch (err) {
      showError(err.message || 'No se pudo iniciar sesion.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
      submitBtn.textContent = oldText;
    }
  });
}

/* ------------------------ DASHBOARD – KPIs y conteos ------------------------ */
async function actualizarEstadisticas() {
  /* Total de clientes */
  try {
    const clientes = await apiJson(API.clientes());
    const elClientes = document.getElementById('total-clientes');
    if (elClientes) elClientes.textContent = Array.isArray(clientes) ? clientes.length : 0;
  } catch (err) {
    if (typeof toast === 'function') toast('No se pudo cargar el total de clientes', 'error');
    console.error(err);
  }

  /* Total reclamos y desglose por estado + reclamos del mes */
  try {
    const reclamos = await apiJson(`${BASE}/reclamos`);
    const total = Array.isArray(reclamos) ? reclamos.length : 0;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('total-reclamos', total);

    // Conteo por estado (normalizado sin tildes/guiones)
    const counts = {
      'ingresado': 0,
      'en revision': 0,
      'aprobacion': 0,
      'reclamacion': 0,
      'gestion de pago': 0,
      'reclamo finalizado': 0,
      'pendiente': 0
    };

    // Conteo del mes actual
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear  = now.getFullYear();
    let delMes = 0;

    for (const r of (reclamos || [])) {
      const k = normalizarEstado(r.estado);
      if (k in counts) counts[k]++;

      const df = parseFecha(r);
      if (df && df.getMonth() === curMonth && df.getFullYear() === curYear) delMes++;
    }

    setText('total-ingresado',    counts['ingresado']);
    setText('total-en-revision',  counts['en revision']);
    setText('total-aprobacion',   counts['aprobacion']);
    setText('total-reclamacion',  counts['reclamacion']);
    setText('total-gestion-pago', counts['gestion de pago']);
    setText('total-finalizado',   counts['reclamo finalizado']);
    setText('total-mes',          delMes);
  } catch (err) {
    if (typeof toast === 'function') toast('No se pudo cargar las estadísticas de reclamos', 'error');
    console.error(err);
  }
}

/* ------------------------ CLIENTES – Listado y acciones ------------------------ */
async function cargarClientes() {
  const tbody = document.getElementById('clients-tbody');
  const list  = await apiJson(API.clientes());

  // Renderiza filas
  tbody.innerHTML = list.map((c) => {
    const id = String(c.id ?? '');
    const nombre = String(c.nombre ?? '');
    const apellido = String(c.apellido ?? '');
    const dni = String(c.dni ?? '');
    const telefono = String(c.telefono ?? '-');
    const email = String(c.email ?? '');
    const nombreCompleto = `${nombre} ${apellido}`.trim();

    return `
      <tr>
        <td>${escapeHTML(id)}</td>
        <td>${escapeHTML(nombre)}</td>
        <td>${escapeHTML(apellido)}</td>
        <td>${escapeHTML(dni)}</td>
        <td>${escapeHTML(telefono)}</td>
        <td>${escapeHTML(email)}</td>
        <td>
          <div class="actions-group">
            <button type="button" class="btn-hero solid action"
                    data-action="reclamos" data-id="${escapeAttr(id)}"
                    data-name="${escapeAttr(nombreCompleto)}">
              Reclamos
            </button>
            <button type="button" class="btn-hero solid action"
                    data-action="editar-cliente" data-id="${escapeAttr(id)}">
              <i class="fas fa-edit"></i> Editar
            </button>
            <button type="button" class="btn-hero solid action"
                    data-action="eliminar" data-id="${escapeAttr(id)}">
              Eliminar
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* Delegación de eventos para las acciones de la tabla de clientes */
function enlazarAccionesClientes() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.action');
    if (!btn) return;

    const id   = btn.dataset.id;
    const name = btn.dataset.name || '';

    try {
      switch (btn.dataset.action) {
        case 'reclamos':
          // Guarda contexto y navega a reclamos del cliente
          sessionStorage.setItem('clienteId', id);
          sessionStorage.setItem('clienteName', name);
          location.href = 'reclamos.html';
          break;

        case 'editar-cliente':
          location.href = `editar_cliente.html?id=${id}`;
          break;

        case 'eliminar': {
          const okDelete = await askDeleteConfirm({
            title: 'Eliminar cliente',
            message: 'Se eliminara este cliente junto con todos sus reclamos. Esta accion no se puede deshacer.'
          });
          if (!okDelete) return;

          // Deshabilita botón mientras elimina
          const oldText = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Eliminando';

          try {
            await apiJson(API.cliente(id), { method: 'DELETE' });
            toast('Cliente eliminado', 'success');
            await cargarClientes(); // recarga tabla
          } catch (err) {
            toast(err.message || 'No se pudo eliminar', 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = oldText;
          }
          break;
        }
      }
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  });
}

/* ------------------------ RECLAMOS – Lista (por cliente) + Modal comentarios ------------------------ */
async function cargarReclamos() {
  const clienteId   = sessionStorage.getItem('clienteId');
  const clienteName = sessionStorage.getItem('clienteName') || 'Cliente';

  // Si no hay contexto, volvemos a clientes
  if (!clienteId) {
    location.href = 'clientes.html';
    return;
  }

  // Título contextual
  const title = document.getElementById('titulo-reclamos');
  if (title) title.textContent = `Reclamos de ${clienteName}`;

  // Carga y render
  const reclamos = await apiJson(API.reclamos(clienteId));
  const tbody    = document.querySelector('#tabla-reclamos tbody');
  const clienteNameSafe = escapeHTML(clienteName);

  tbody.innerHTML = reclamos.map((r) => {
    const id = String(r.id ?? '');
    const fecha = r.fecha_incidente ? new Date(r.fecha_incidente).toLocaleDateString('es-AR') : '-';
    const hora = String(r.hora_incidente ?? '-');
    const estado = String(r.estado ?? '-');

    return `
      <tr>
        <td>${escapeHTML(id)}</td>
        <td>${clienteNameSafe}</td>
        <td>${escapeHTML(fecha)}</td>
        <td>${escapeHTML(hora)}</td>
        <td>${escapeHTML(estado)}</td>
        <td>
          <div class="actions-group">
            <button class="btn-hero solid small btn-editar" data-id="${escapeAttr(id)}">
              Detalles
            </button>
            <button class="btn-hero solid small btn-comentarios" data-id="${escapeAttr(id)}">
              Comentarios
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Navegar a edición
  tbody.querySelectorAll('.btn-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      location.href = `editar.html?id=${id}`;
    });
  });

  // Abrir modal de comentarios
  tbody.querySelectorAll('.btn-comentarios').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      abrirModalComentarios(id);
    });
  });
}

/* ------------------------ RECLAMOS – Formulario de edición ------------------------ */
async function cargarFormularioReclamo() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('id');
  if (!id) {
    location.href = 'reclamos.html';
    return;
  }

  // Carga datos y los vuelca a inputs por id coincidente
  const r = await apiJson(API.reclamo(id));

  Object.entries(r).forEach(([k, v]) => {
    const el = document.getElementById(k);
    if (el) el.value = v;
  });

  // Cargar imágenes UNA sola vez
  cargarImagenesReclamoAdmin(id).catch(err => {
    console.error(err);
    const info = document.getElementById('imagenes-info');
    if (info) info.textContent = 'No se pudieron cargar imágenes.';
  });

  // Guardado
  document.getElementById('form-editar').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));

    try {
      await apiJson(API.update('reclamos', id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast('Reclamo actualizado', 'success');
      setTimeout(() => goBackAfterEdit(), 800);
    } catch (err) {
      toast('Error al actualizar: ' + err.message, 'error');
    }
  });
}

/* ------------------------ CLIENTE – Formulario de edición ------------------------ */
async function cargarFormularioCliente() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('id');
  if (!id) {
    location.href = 'clientes.html';
    return;
  }

  // Carga y setea en el form
  const c = await apiJson(API.cliente(id));
  document.getElementById('id').value       = c.id;
  document.getElementById('nombre').value   = c.nombre;
  document.getElementById('apellido').value = c.apellido;
  document.getElementById('dni').value      = c.dni;
  document.getElementById('telefono').value = c.telefono || '';
  document.getElementById('email').value    = c.email;

  // Guardado
  document.getElementById('form-editar-cliente').addEventListener('submit', async e => {
    e.preventDefault();

    const data = {
      nombre:   document.getElementById('nombre').value.trim(),
      apellido: document.getElementById('apellido').value.trim(),
      dni:      document.getElementById('dni').value.trim(),
      telefono: document.getElementById('telefono').value.trim(),
      email:    document.getElementById('email').value.trim()
    };

    try {
      await apiJson(API.cliente(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast('Cliente actualizado', 'success');
      setTimeout(() => location.href = 'clientes.html', 800);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  });
}

/* ------------------------ COMENTARIOS – Estado, modal y CRUD ------------------------ */

let COM_RECLAMO_ID = null;

/* Abre modal, limpia form y carga historial */
function abrirModalComentarios(reclamoId){
  COM_RECLAMO_ID = reclamoId;

  // limpiar form
  const autor = document.getElementById('autor-comentario');
  const texto = document.getElementById('texto-comentario');
  if (autor) autor.value = '';
  if (texto) texto.value = '';

  // abrir modal
  const overlay = document.getElementById('modal-comentarios');
  if (overlay) overlay.classList.add('is-open');

  // cargar historial
  cargarComentarios(reclamoId).catch(err => {
    toast('No se pudo cargar comentarios: ' + err.message, 'error');
  });
}

/* Cierra modal y limpia estado */
function cerrarModalComentarios(){
  const overlay = document.getElementById('modal-comentarios');
  if (overlay) overlay.classList.remove('is-open');
  COM_RECLAMO_ID = null;
}

/* GET historial de comentarios de un reclamo */
async function cargarComentarios(reclamoId){
  const list = await apiJson(API.comentarios(reclamoId));
  renderComentarios(list || []);
}

/* Pinta la lista de comentarios dentro del modal */
function renderComentarios(items){
  const ul = document.getElementById('lista-comentarios');
  if (!ul) return;

  if (!Array.isArray(items) || !items.length){
    ul.innerHTML = '<li style="color:#666;">Sin comentarios todavía.</li>';
    return;
  }
  ul.innerHTML = items.map(it => `
    <li class="comentario-item">
      <div class="meta">
        <strong>${it.autor ? escapeHTML(it.autor) : 'Anónimo'}</strong>
        · <span>${escapeHTML(formatearFechaHora(it.creado_en))}</span>
      </div>
      <div class="texto">${escapeHTML(it.texto || '')}</div>
    </li>
  `).join('');
}

/* Fecha/hora legible para la meta del comentario */
function formatearFechaHora(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  }catch{ return iso || ''; }
}

/* Sanitiza texto libre para evitar XSS */
function escapeHTML(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function escapeAttr(s){
  return escapeHTML(s);
}

/* Enlaza eventos del modal  */
function bindModalComentarios(){
  const modal = document.getElementById('modal-comentarios');
  if (!modal) return;

  const btnClose = document.getElementById('btn-cerrar-modal');
  if (btnClose) btnClose.addEventListener('click', cerrarModalComentarios);

  // Cerrar con ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) cerrarModalComentarios();
  });

  // Enviar comentario (POST)
  const form = document.getElementById('form-comentario');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!COM_RECLAMO_ID) return;

      const autor = (document.getElementById('autor-comentario')?.value || '').trim();
      const texto = (document.getElementById('texto-comentario')?.value || '').trim();
      if (!texto){
        toast('Escribir un comentario', 'error');
        return;
      }

      try{
        await apiJson(API.comentarios(COM_RECLAMO_ID), {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ autor, texto })
        });

        toast('Comentario guardado', 'success');
        const txt = document.getElementById('texto-comentario');
        if (txt) txt.value = '';
        await cargarComentarios(COM_RECLAMO_ID);
      }catch(err){
        toast('No se pudo guardar: ' + err.message, 'error');
      }
    });
  }
}

/* ------------------------ RECLAMOS Router y filtros ------------------------ */
function routerReclamos(){
  const params     = new URLSearchParams(location.search);
  const mode       = (params.get('mode') || '').toLowerCase();
  const estadoQS   = params.get('estado') || '';
  const periodQS   = (params.get('period') || params.get('mes') || '');
  const pageQS     = Number.parseInt(params.get('page') || '1', 10);

  const clienteId  = sessionStorage.getItem('clienteId');

  // Si el usuario pidió explícitamente la vista general, olvidamos el contexto por cliente
  if (mode === 'all') {
    sessionStorage.removeItem('clienteId');
  }

  if (mode === 'all' || !clienteId){
    cargarReclamosGeneral({ estadoQS, periodQS, pageQS }).catch(err => {
      console.error(err);
      if (typeof toast === 'function') toast(err.message || 'No se pudo cargar reclamos', 'error');
    });
    bindModalComentarios();
  } else {
    cargarReclamos();
    bindModalComentarios();
  }
}

/* Cache local de reclamos y mapa de clientes para pintar rápido */
let RECLAMOS_CACHE = [];
let CLIENTES_MAP   = {};
const RECLAMOS_PAGE_SIZE = 20;
let RECLAMOS_PAGE = 1;
let RECLAMOS_TOTAL = 0;
let RECLAMOS_TOTAL_PAGES = 1;

/* Claves para guardar filtros entre navegaciones */
const STORAGE_FILTRO_ESTADO  = 'reclamosFiltroEstado';
const STORAGE_FILTRO_PERIODO = 'reclamosFiltroPeriodo';

/* Normaliza valores de estado para comparar  */
function normalizarEstado(s) {
  if (s == null) return '';
  let x = String(s).trim().toLowerCase();
  // quita acentos
  x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // cambia guiones por espacios y colapsa espacios múltiples
  x = x.replace(/-/g, ' ').replace(/\s+/g, ' ');
  return x;
}

/* Intenta parsear una fecha del reclamo en distintos formatos */
function parseFecha(r) {
  const f = r.fecha_incidente || r.fecha;
  if (!f) return null;

  if (typeof f === 'string') {
    // ISO (YYYY-MM-DD...)
    if (f.includes('-')) {
      const d = new Date(f);
      return isNaN(d) ? null : d;
    }
    // dd/mm/yyyy
    const p = f.split('/');
    if (p.length === 3) {
      const d = parseInt(p[0], 10),
            m = parseInt(p[1], 10),
            y = parseInt(p[2], 10);
      const dt = new Date(y, m - 1, d);
      return isNaN(dt) ? null : dt;
    }
  }

  const dt = new Date(f);
  return isNaN(dt) ? null : dt;
}

/* True si la fecha del reclamo está en el mes/año actual */
function isEsteMes(r) {
  const d = parseFecha(r);
  if (!d) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function getPeriodoKeyFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getPeriodoKeyFromReclamo(r) {
  const d = parseFecha(r);
  if (!d) return '';
  return getPeriodoKeyFromDate(d);
}

function formatPeriodoLabel(periodoKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodoKey || ''));
  if (!m) return String(periodoKey || '');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = new Date(y, mo - 1, 1);
  const raw = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function normalizePeriodoFilterValue(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (['mes', 'actual', 'este-mes', 'this-month'].includes(v)) {
    return getPeriodoKeyFromDate(new Date());
  }
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  return '';
}

function buildPeriodoCountMap(reclamos) {
  const counts = new Map();
  (reclamos || []).forEach((r) => {
    const key = getPeriodoKeyFromReclamo(r);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function buildPeriodoRangeKeys(reclamos) {
  const startYear = 2026;
  let endYear = new Date().getFullYear();

  (reclamos || []).forEach((r) => {
    const d = parseFecha(r);
    if (!d) return;
    if (d.getFullYear() > endYear) {
      endYear = d.getFullYear();
    }
  });

  if (endYear < startYear) endYear = startYear;

  const keys = [];
  for (let y = endYear; y >= startYear; y--) {
    for (let m = 12; m >= 1; m--) {
      keys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }
  return keys;
}

function populatePeriodoOptions(reclamos, selectedPeriodo = '') {
  const selPeriodo = document.getElementById('filtro-periodo');
  if (!selPeriodo) return;

  const options = buildPeriodoRangeKeys(reclamos);
  selPeriodo.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'Todos';
  selPeriodo.appendChild(allOpt);

  options.forEach((key) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = formatPeriodoLabel(key);
    selPeriodo.appendChild(o);
  });

  const normalized = normalizePeriodoFilterValue(selectedPeriodo);
  const exists = options.includes(normalized);
  selPeriodo.value = exists ? normalized : '';
}

function updatePeriodoResumen({ periodo = '', totalMostrados = 0 }) {
  const box = document.getElementById('periodo-resumen');
  if (!box) return;

  const n = Number(totalMostrados || 0);
  if (!periodo) {
    box.textContent = `Reclamos filtrados: ${n}`;
    return;
  }

  box.textContent = `${formatPeriodoLabel(periodo)}: ${n} reclamos`;
}

function ensurePaginacionReclamos() {
  const tabla = document.getElementById('tabla-reclamos');
  if (!tabla || !tabla.parentElement) return null;

  let wrapper = document.getElementById('reclamos-paginacion');
  if (wrapper) return wrapper;

  wrapper = document.createElement('section');
  wrapper.id = 'reclamos-paginacion';
  wrapper.className = 'reclamos-pagination';
  tabla.insertAdjacentElement('afterend', wrapper);
  return wrapper;
}

function syncReclamosListQuery({ estado = '', periodo = '', page = 1 } = {}) {
  const url = new URL(location.href);
  url.searchParams.set('mode', 'all');

  if (estado) url.searchParams.set('estado', estado);
  else url.searchParams.delete('estado');

  if (periodo) url.searchParams.set('period', periodo);
  else {
    url.searchParams.delete('period');
    url.searchParams.delete('mes');
  }

  if (page > 1) url.searchParams.set('page', String(page));
  else url.searchParams.delete('page');

  history.replaceState(null, '', url);
}

function renderPaginacionReclamos() {
  const wrap = ensurePaginacionReclamos();
  if (!wrap) return;

  wrap.innerHTML = '';

  const info = document.createElement('div');
  info.className = 'reclamos-pagination__info';

  const from = RECLAMOS_TOTAL === 0 ? 0 : ((RECLAMOS_PAGE - 1) * RECLAMOS_PAGE_SIZE + 1);
  const to = RECLAMOS_TOTAL === 0 ? 0 : Math.min(RECLAMOS_TOTAL, RECLAMOS_PAGE * RECLAMOS_PAGE_SIZE);
  info.textContent = `Mostrando ${from}-${to} de ${RECLAMOS_TOTAL}`;

  const controls = document.createElement('div');
  controls.className = 'reclamos-pagination__controls';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'btn-hero solid small';
  btnPrev.textContent = 'Anterior';
  btnPrev.disabled = RECLAMOS_PAGE <= 1;
  btnPrev.addEventListener('click', () => {
    if (RECLAMOS_PAGE <= 1) return;
    aplicarYRenderFiltro({ page: RECLAMOS_PAGE - 1 });
  });

  const pageBadge = document.createElement('span');
  pageBadge.className = 'reclamos-pagination__page';
  pageBadge.textContent = `Pagina ${RECLAMOS_PAGE} de ${RECLAMOS_TOTAL_PAGES}`;

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'btn-hero solid small';
  btnNext.textContent = 'Siguiente';
  btnNext.disabled = RECLAMOS_PAGE >= RECLAMOS_TOTAL_PAGES;
  btnNext.addEventListener('click', () => {
    if (RECLAMOS_PAGE >= RECLAMOS_TOTAL_PAGES) return;
    aplicarYRenderFiltro({ page: RECLAMOS_PAGE + 1 });
  });

  controls.appendChild(btnPrev);
  controls.appendChild(pageBadge);
  controls.appendChild(btnNext);

  wrap.appendChild(info);
  wrap.appendChild(controls);
}

/* Carga la vista general de reclamos con barra de filtros */
async function cargarReclamosGeneral({ estadoQS = '', periodQS = '', pageQS = 1 } = {}) {
  const title = document.getElementById('titulo-reclamos');
  if (title) title.textContent = 'Reclamos – Todos';

  // Asegura que la barra de filtros exista
  ensureBarraFiltros();
  ensurePaginacionReclamos();

  // Selects (ya existen después de ensureBarraFiltros)
  const selEstado  = document.getElementById('filtro-estado');
  const selPeriodo = document.getElementById('filtro-periodo');

  // 1) valores desde querystring (si vienen)
  let estado  = (estadoQS || '').toLowerCase();
  let periodo = periodQS || '';

  // 2) si no vino nada en la URL, usamos lo guardado en sesión
  try {
    if (!estado) {
      const savedEstado = sessionStorage.getItem(STORAGE_FILTRO_ESTADO);
      if (savedEstado !== null) estado = savedEstado;
    }
    if (!periodo) {
      const savedPeriodo = sessionStorage.getItem(STORAGE_FILTRO_PERIODO);
      if (savedPeriodo !== null) periodo = savedPeriodo;
    }
  } catch (e) {}

  // Carga reclamos + clientes en paralelo
  const clientes = await apiJson(API.clientes());

  // Cachea y arma mapa de cliente_id → nombre
  RECLAMOS_CACHE = [];

  CLIENTES_MAP = {};
  (Array.isArray(clientes) ? clientes : []).forEach(c => {
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim() || (c.razon_social || '');
    CLIENTES_MAP[c.id] = nombre || `Cliente #${c.id}`;
  });

  const periodoNormalizado = normalizePeriodoFilterValue(periodo);
  populatePeriodoOptions([], periodoNormalizado);

  if (selEstado)  selEstado.value  = estado;
  if (selPeriodo) selPeriodo.value = periodoNormalizado && selPeriodo.querySelector(`option[value="${periodoNormalizado}"]`)
    ? periodoNormalizado
    : '';

  const initialPage = Number.isFinite(pageQS) && pageQS > 0 ? pageQS : 1;

  // Aplica el filtro actual (estado/periodo) y pinta la tabla
  await aplicarYRenderFiltro({ page: initialPage });
}

/* Inserta la barra de filtros sobre la tabla si no existe */
function ensureBarraFiltros() {
  const tabla = document.getElementById('tabla-reclamos');
  if (!tabla) return;
  if (document.getElementById('reclamos-filtros')) return;

  const wrapper = document.createElement('section');
  wrapper.id = 'reclamos-filtros';
  wrapper.className = 'filters-bar';
  wrapper.innerHTML = `
    <div class="filters">
      <label for="filtro-estado">Estado</label>
      <select id="filtro-estado">
        <option value="">Todos</option>
        <option value="ingresado">Ingresado</option>
        <option value="en-revision">En revisión</option>
        <option value="aprobacion">Aprobación</option>
        <option value="reclamacion">Reclamación</option>
        <option value="gestion-de-pago">Gestión de pago</option>
        <option value="reclamo-finalizado">Reclamo finalizado</option>
      </select>

      <label for="filtro-periodo">Periodo</label>
      <select id="filtro-periodo">
        <option value="">Todos</option>
      </select>

      <div id="periodo-resumen" class="periodo-resumen" aria-live="polite">Reclamos mostrados: 0</div>

      <button type="button" id="btn-limpiar-filtros" class="btn-hero solid">LIMPIAR</button>
    </div>
  `;
  tabla.parentElement.insertBefore(wrapper, tabla);

  // Listeners de filtros
  const selEstado  = wrapper.querySelector('#filtro-estado');
  const selPeriodo = wrapper.querySelector('#filtro-periodo');
  const btnLimpiar = wrapper.querySelector('#btn-limpiar-filtros');

  if (selEstado) selEstado.addEventListener('change', () => { aplicarYRenderFiltro({ page: 1 }); });
  if (selPeriodo) selPeriodo.addEventListener('change', () => { aplicarYRenderFiltro({ page: 1 }); });

  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      if (selEstado)  selEstado.value  = '';
      if (selPeriodo) selPeriodo.value = '';

      try {
        sessionStorage.removeItem(STORAGE_FILTRO_ESTADO);
        sessionStorage.removeItem(STORAGE_FILTRO_PERIODO);
      } catch (e) {}

      aplicarYRenderFiltro({ page: 1 });

      // Limpia QS visibles en la URL
      const url = new URL(location.href);
      url.searchParams.delete('estado');
      url.searchParams.delete('period');
      url.searchParams.delete('mes');
      url.searchParams.delete('page');
      history.replaceState(null, '', url);
    });
  }
}

/* Aplica filtros seleccionados y vuelve a renderizar filas */
async function aplicarYRenderFiltro({ page = 1 } = {}) {
  const selEstado  = document.getElementById('filtro-estado');
  const selPeriodo = document.getElementById('filtro-periodo');
  const estado  = selEstado ? selEstado.value : '';
  const periodo = normalizePeriodoFilterValue(selPeriodo ? selPeriodo.value : '');
  const pageSafe = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  try {
    sessionStorage.setItem(STORAGE_FILTRO_ESTADO, estado);
    sessionStorage.setItem(STORAGE_FILTRO_PERIODO, periodo);
  } catch (e) {}

  const qs = new URLSearchParams();
  qs.set('page', String(pageSafe));
  qs.set('limit', String(RECLAMOS_PAGE_SIZE));
  if (estado) qs.set('estado', estado);
  if (periodo) qs.set('periodo', periodo);

  try {
    const payload = await apiJson(`${BASE}/reclamos?${qs.toString()}`);
    const items = Array.isArray(payload) ? payload : (Array.isArray(payload.items) ? payload.items : []);
    const total = Array.isArray(payload) ? items.length : Number(payload.total || 0);
    const totalPages = Array.isArray(payload) ? 1 : Number(payload.totalPages || 1);
    const currentPage = Array.isArray(payload) ? pageSafe : Number(payload.page || pageSafe);

    RECLAMOS_CACHE = items;
    RECLAMOS_TOTAL = Number.isFinite(total) ? total : items.length;
    RECLAMOS_TOTAL_PAGES = Math.max(1, Number.isFinite(totalPages) ? totalPages : 1);
    RECLAMOS_PAGE = Math.min(Math.max(1, currentPage), RECLAMOS_TOTAL_PAGES);

    renderReclamosGeneralRows(items);
    updatePeriodoResumen({ periodo, totalMostrados: RECLAMOS_TOTAL });
    renderPaginacionReclamos();
    syncReclamosListQuery({ estado, periodo, page: RECLAMOS_PAGE });
  } catch (err) {
    console.error('Error al filtrar/paginar reclamos:', err);
    toast(err.message || 'No se pudo cargar reclamos', 'error');
  }
}

/* Dibuja las filas de la tabla en la vista general y enlaza acciones */
function renderReclamosGeneralRows(lista){
  const tbody = document.querySelector('#tabla-reclamos tbody');
  if (!tbody) return;

  tbody.innerHTML = (lista || []).map(r => {
    const idRaw = String(r.id ?? '');
    const idText = escapeHTML(idRaw);
    const idAttr = escapeAttr(idRaw);
    const clienteName = escapeHTML(CLIENTES_MAP[r.cliente_id] || `Cliente #${r.cliente_id || ''}`);
    const d = parseFecha(r);
    const fecha = escapeHTML(d ? d.toLocaleDateString('es-AR') : '-');
    const hora   = escapeHTML(r.hora_incidente || r.hora || '-');
    const estado = escapeHTML(r.estado || '-');

    return `
      <tr>
        <td>${idText}</td>
        <td>${clienteName}</td>
        <td>${fecha}</td>
        <td>${hora}</td>
        <td>${estado}</td>
        <td>
          <div class="actions-group">
            <button class="btn-hero solid small btn-editar" data-id="${idAttr}">Detalles</button>
            <button class="btn-hero solid small btn-comentarios" data-id="${idAttr}">Comentarios</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Detalles
  tbody.querySelectorAll('.btn-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;

      const estadoSel  = document.getElementById('filtro-estado')?.value || '';
      const periodoSel = document.getElementById('filtro-periodo')?.value || '';

      const qs = new URLSearchParams();
      qs.set('id', id);
      qs.set('from', 'all');
      if (estadoSel)  qs.set('estado', estadoSel);
      if (periodoSel) qs.set('period', periodoSel);
      if (RECLAMOS_PAGE > 1) qs.set('page', String(RECLAMOS_PAGE));

      location.href = `editar.html?${qs.toString()}`;
    });
  });

  // Comentarios
  tbody.querySelectorAll('.btn-comentarios').forEach(btn => {
    btn.addEventListener('click', () => abrirModalComentarios(btn.dataset.id));
  });
}

/* ------------------------ IMÁGENES – Ver y descargar en editar.html ------------------------ */
async function cargarImagenesReclamoAdmin(reclamoId){
  const cont = document.getElementById('imagenes-reclamo');
  const info = document.getElementById('imagenes-info');
  if (!cont || !info) return;

  const toSafeAbsoluteUrl = (rawUrl) => {
    try {
      const u = new URL(String(rawUrl || ''), window.location.origin);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.toString();
    } catch {
      return '';
    }
  };

  info.textContent = 'Cargando imágenes...';
  cont.innerHTML = '';

  const list = await apiJson(`${BASE}/reclamos/${encodeURIComponent(reclamoId)}/imagenes`);

  if (!Array.isArray(list) || list.length === 0) {
    info.textContent = 'Este reclamo no tiene imágenes cargadas.';
    return;
  }

  info.textContent = `Imágenes encontradas: ${list.length}`;

  cont.innerHTML = list.map((img, idx) => {
    const viewPath = img.view_url || img.url || '';
    const downloadPath = img.download_url || viewPath;
    const fullViewUrl = viewPath.startsWith('http') ? viewPath : (PUBLIC_BASE + viewPath);
    const fullDownloadUrl = downloadPath.startsWith('http') ? downloadPath : (PUBLIC_BASE + downloadPath);
    const safeViewUrl = toSafeAbsoluteUrl(fullViewUrl);
    const safeDownloadUrl = toSafeAbsoluteUrl(fullDownloadUrl);

    const filename = escapeHTML(img.filename || `imagen_${idx+1}`);
    const tag = img.tag ? escapeHTML(String(img.tag)) : '';
    const meta = tag ? `<div style="font-size:12px;color:#666;margin-top:6px;">${tag}</div>` : '';

    // debugImg(fullViewUrl); // descomenta si quieres ver status en consola

    return `
  <div class="img-card">
    <div class="img-thumb">
      <img src="${escapeAttr(safeViewUrl)}"
           alt="${filename}"
           class="js-reclamo-img">
    </div>

    <div class="img-body">
      ${meta}

      <div class="img-actions">
        <button
          type="button"
          class="btn-hero solid small js-img-view"
          data-view-url="${escapeAttr(safeViewUrl)}"
        >
          <i class="fas fa-eye"></i> Ver
        </button>

        <button
          type="button"
          class="btn-hero solid small js-img-download"
          data-download-url="${escapeAttr(safeDownloadUrl)}"
          data-filename="${escapeAttr(filename)}"
        >
          <i class="fas fa-download"></i> Descargar
        </button>
      </div>
    </div>
  </div>
`;
  }).join('');

  cont.querySelectorAll('.js-reclamo-img').forEach((imgEl) => {
    imgEl.addEventListener('error', () => {
      const parent = imgEl.parentElement;
      if (!parent) return;
      imgEl.style.display = 'none';
      parent.innerHTML = "<div style='padding:12px;color:#777;'>No se pudo mostrar la imagen</div>";
    }, { once: true });
  });

  cont.querySelectorAll('.js-img-view').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = toSafeAbsoluteUrl(btn.dataset.viewUrl || '');
      if (!url) {
        toast('No se pudo abrir la imagen.', 'error');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  });

  cont.querySelectorAll('.js-img-download').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = toSafeAbsoluteUrl(btn.dataset.downloadUrl || '');
      const filename = String(btn.dataset.filename || 'imagen');
      if (!url) {
        toast('No se pudo descargar la imagen.', 'error');
        return;
      }
      forceDownload(url, filename);
    });
  });
}


/*<!--Revisado em texto-->*/

/* Cache local de reclamos y mapa de clientes para pintar rápido 
let RECLAMOS_CACHE = [];
let CLIENTES_MAP   = {};

/* Claves para guardar filtros en sessionStorage 
const STORAGE_FILTRO_ESTADO  = 'reclamosFiltroEstado';
const STORAGE_FILTRO_PERIODO = 'reclamosFiltroPeriodo';

/* Normaliza valores de estado para comparar  
function normalizarEstado(s) {
  if (s == null) return '';
  let x = String(s).trim().toLowerCase();
  x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); 
  x = x.replace(/-/g, ' ').replace(/\s+/g, ' ');         
  return x;
}

/* Intenta parsear una fecha del reclamo en distintos formatos 
function parseFecha(r){
  const f = r.fecha_incidente || r.fecha;
  if (!f) return null;
  if (typeof f === 'string') {
    // ISO (YYYY-MM-DD...)
    if (f.includes('-')) {
      const d = new Date(f);
      return isNaN(d) ? null : d;
    }
    // dd/mm/yyyy
    const p = f.split('/');
    if (p.length === 3) {
      const d = parseInt(p[0], 10), m = parseInt(p[1], 10), y = parseInt(p[2], 10);
      const dt = new Date(y, m - 1, d);
      return isNaN(dt) ? null : dt;
    }
  }
  const dt = new Date(f);
  return isNaN(dt) ? null : dt;
}

/* True si la fecha del reclamo está en el mes/año actual 
function isEsteMes(r){
  const d = parseFecha(r);
  if (!d) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

/* Carga la vista general de reclamos con barra de filtros 
async function cargarReclamosGeneral({ estadoQS = '', periodQS = '' } = {}){
  const title = document.getElementById('titulo-reclamos');
  if (title) title.textContent = 'Reclamos – Todos';

  // Asegura que la barra de filtros exista
  ensureBarraFiltros();

  // Selects (ya existen después de ensureBarraFiltros)
  const selEstado  = document.getElementById('filtro-estado');
  const selPeriodo = document.getElementById('filtro-periodo');

  // 1) valores desde querystring (si vienen)
  let estado  = estadoQS;
  let periodo = periodQS;

  // 2) si no vino nada en la URL, usamos lo guardado en sesión
  if (!estado)  estado  = sessionStorage.getItem(STORAGE_FILTRO_ESTADO)  || '';
  if (!periodo) periodo = sessionStorage.getItem(STORAGE_FILTRO_PERIODO) || '';

  // normalizar valores de periodo
  if (periodo && ['mes','actual','este-mes','this-month'].includes(periodo)) {
    periodo = 'mes';
  }

  if (selEstado)  selEstado.value  = estado;
  if (selPeriodo) selPeriodo.value = periodo;

  // Carga reclamos + clientes en paralelo
  const [reclamos, clientes] = await Promise.all([
    apiJson(`${BASE}/reclamos`),
    apiJson(API.clientes())
  ]);

  // Cachea y arma mapa de cliente_id → nombre
  RECLAMOS_CACHE = Array.isArray(reclamos) ? reclamos : [];

  CLIENTES_MAP = {};
  (Array.isArray(clientes) ? clientes : []).forEach(c => {
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim() || (c.razon_social || '');
    CLIENTES_MAP[c.id] = nombre || `Cliente #${c.id}`;
  });

  // Aplica el filtro actual (estado/periodo) y pinta la tabla
  aplicarYRenderFiltro();
}

/* Inserta la barra de filtros sobre la tabla si no existe 
function ensureBarraFiltros(){
  const tabla = document.getElementById('tabla-reclamos');
  if (!tabla) return;
  if (document.getElementById('reclamos-filtros')) return;

  const wrapper = document.createElement('section');
  wrapper.id = 'reclamos-filtros';
  wrapper.className = 'filters-bar';
  wrapper.innerHTML = `
    <div class="filters">
      <label for="filtro-estado">Estado</label>
      <select id="filtro-estado">
        <option value="">Todos</option>
        <option value="ingresado">Ingresado</option>
        <option value="en-revision">En revisión</option>
        <option value="aprobacion">Aprobación</option>
        <option value="reclamacion">Reclamación</option>
        <option value="gestion-de-pago">Gestión de pago</option>
        <option value="reclamo-finalizado">Reclamo finalizado</option>
      </select>

      <label for="filtro-periodo">Periodo</label>
      <select id="filtro-periodo">
        <option value="">Todos</option>
        <option value="mes">Este mes</option>
      </select>

      <button type="button" id="btn-limpiar-filtros" class="btn-hero solid">LIMPIAR</button>
    </div>
  `;
  tabla.parentElement.insertBefore(wrapper, tabla);

  // Listeners de filtros
  const selEstado  = wrapper.querySelector('#filtro-estado');
  const selPeriodo = wrapper.querySelector('#filtro-periodo');
  const btnLimpiar = wrapper.querySelector('#btn-limpiar-filtros');

  if (selEstado) {
    selEstado.addEventListener('change', () => {
      sessionStorage.setItem(STORAGE_FILTRO_ESTADO, selEstado.value || '');
      aplicarYRenderFiltro();
    });
  }

  if (selPeriodo) {
    selPeriodo.addEventListener('change', () => {
      sessionStorage.setItem(STORAGE_FILTRO_PERIODO, selPeriodo.value || '');
      aplicarYRenderFiltro();
    });
  }

  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      if (selEstado)  selEstado.value  = '';
      if (selPeriodo) selPeriodo.value = '';
      sessionStorage.removeItem(STORAGE_FILTRO_ESTADO);
      sessionStorage.removeItem(STORAGE_FILTRO_PERIODO);
      aplicarYRenderFiltro();
    });
  }
}

*/






/*

/* Cache local de reclamos y mapa de clientes para pintar rápido 
let RECLAMOS_CACHE = [];
let CLIENTES_MAP   = {};

/* Normaliza valores de estado para comparar  
function normalizarEstado(s) {
  if (s == null) return '';
  let x = String(s).trim().toLowerCase();
  x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); 
  x = x.replace(/-/g, ' ').replace(/\s+/g, ' ');         
  return x;
}

/* Intenta parsear una fecha del reclamo en distintos formatos 
function parseFecha(r){
  const f = r.fecha_incidente || r.fecha;
  if (!f) return null;
  if (typeof f === 'string') {
    // ISO (YYYY-MM-DD...)
    if (f.includes('-')) {
      const d = new Date(f);
      return isNaN(d) ? null : d;
    }
    // dd/mm/yyyy
    const p = f.split('/');
    if (p.length === 3) {
      const d = parseInt(p[0], 10), m = parseInt(p[1], 10), y = parseInt(p[2], 10);
      const dt = new Date(y, m - 1, d);
      return isNaN(dt) ? null : dt;
    }
  }
  const dt = new Date(f);
  return isNaN(dt) ? null : dt;
}

/* True si la fecha del reclamo está en el mes/año actual 
function isEsteMes(r){
  const d = parseFecha(r);
  if (!d) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

/* Carga la vista general de reclamos con barra de filtros 
async function cargarReclamosGeneral({ estadoQS = '', periodQS = '' } = {}){
  const title = document.getElementById('titulo-reclamos');
  if (title) title.textContent = 'Reclamos – Todos';

  ensureBarraFiltros();

  // Carga reclamos + clientes en paralelo
  const [reclamos, clientes] = await Promise.all([
    apiJson(`${BASE}/reclamos`),
    apiJson(API.clientes())
  ]);

  // Cachea y arma mapa de cliente_id → nombre
  RECLAMOS_CACHE = Array.isArray(reclamos) ? reclamos : [];

  CLIENTES_MAP = {};
  (Array.isArray(clientes) ? clientes : []).forEach(c => {
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim() || (c.razon_social || '');
    CLIENTES_MAP[c.id] = nombre || `Cliente #${c.id}`;
  });

  // Preselección desde QS
  const selEstado  = document.getElementById('filtro-estado');
  const selPeriodo = document.getElementById('filtro-periodo');

  if (estadoQS && selEstado)  selEstado.value = estadoQS;
  if (periodQS && selPeriodo) {
    if (['mes', 'actual', 'este-mes', 'this-month'].includes(periodQS)) selPeriodo.value = 'mes';
  }

  aplicarYRenderFiltro();
}

/* Inserta la barra de filtros sobre la tabla si no existe 
function ensureBarraFiltros(){
  const tabla = document.getElementById('tabla-reclamos');
  if (!tabla) return;
  if (document.getElementById('reclamos-filtros')) return;

  const wrapper = document.createElement('section');
  wrapper.id = 'reclamos-filtros';
  wrapper.className = 'filters-bar';
  wrapper.innerHTML = `
    <div class="filters">
      <label for="filtro-estado">Estado</label>
      <select id="filtro-estado">
        <option value="">Todos</option>
        <option value="ingresado">Ingresado</option>
        <option value="en-revision">En revisión</option>
        <option value="aprobacion">Aprobación</option>
        <option value="reclamacion">Reclamación</option>
        <option value="gestion-de-pago">Gestión de pago</option>
        <option value="reclamo-finalizado">Reclamo finalizado</option>
      </select>

      <label for="filtro-periodo">Periodo</label>
      <select id="filtro-periodo">
        <option value="">Todos</option>
        <option value="mes">Este mes</option>
      </select>

      <button type="button" id="btn-limpiar-filtros" class="btn-hero solid">Limpiar</button>
    </div>
  `;
  tabla.parentElement.insertBefore(wrapper, tabla);

  // Eventos de filtros
  const selEstado   = wrapper.querySelector('#filtro-estado');
  const selPeriodo  = wrapper.querySelector('#filtro-periodo');
  const btnLimpiar  = wrapper.querySelector('#btn-limpiar-filtros');

  selEstado.addEventListener('change', aplicarYRenderFiltro);
  selPeriodo.addEventListener('change', aplicarYRenderFiltro);
  btnLimpiar.addEventListener('click', () => {
    selEstado.value  = '';
    selPeriodo.value = '';
    aplicarYRenderFiltro();
    // Limpia QS visibles
    const url = new URL(location.href);
    url.searchParams.delete('estado');
    url.searchParams.delete('period');
    url.searchParams.delete('mes');
    history.replaceState(null, '', url);
  });
}

/* Aplica filtros seleccionados y vuelve a renderizar filas 
function aplicarYRenderFiltro(){
  const selEstado  = document.getElementById('filtro-estado');
  const selPeriodo = document.getElementById('filtro-periodo');
  const estado  = selEstado ? selEstado.value : '';
  const periodo = selPeriodo ? selPeriodo.value : '';

  let data = RECLAMOS_CACHE;

  // Filtro por estado (normalizado)
  if (estado) {
    const e = normalizarEstado(estado);
    data = data.filter(r => normalizarEstado(r.estado) === e);
  }

  // Filtro por periodo (este mes)
  if (periodo === 'mes') {
    data = data.filter(isEsteMes);
  }

  renderReclamosGeneralRows(data);
}

*/




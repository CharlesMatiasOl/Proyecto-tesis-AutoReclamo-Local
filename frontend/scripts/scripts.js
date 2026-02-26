(function () {
  'use strict';

  // =========================
  // Config fotos (frontend)
  // =========================
  const MAX_MB = 5;
  const MAX_BYTES = MAX_MB * 1024 * 1024;

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
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (isLocalhost && String(location.port || '') !== '3000') {
      return 'http://localhost:3000';
    }

    if (host === 'siniestroya.com.ar' || host.endsWith('.siniestroya.com.ar')) {
      return 'https://api.siniestroya.com.ar';
    }

    return '';
  }

  const API_BASE_URL = resolveApiBaseUrl();

  function apiUrl(pathname) {
    const path = String(pathname || '');
    const safePath = path.startsWith('/') ? path : `/${path}`;
    return API_BASE_URL ? `${API_BASE_URL}${safePath}` : safePath;
  }

  // Mimes permitidos (coincide con tu backend)
  const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ]);

  // Para preview seguro
  function esPreviewable(mime) {
    return mime === 'image/jpeg' || mime === 'image/png';
  }

  // Guardamos en memoria las selecciones para luego subirlas al final
  const fotos = {
    dniFrente: null,
    dniDorso: null,
    tvFrente: null,
    tvDorso: null,
    carnetFrente: null,
    carnetDorso: null,
    vehiculoFoto: null,
    danosFotos: [] // multiples
  };
  let codigoReclamoPendienteImagenes = null;

  // =========================
  // Router por pagina (FIX)
  // =========================
  function initGlobal() {
    const esPaginaReclamo = !!document.getElementById('paso1'); // wizard multi-step
    if (esPaginaReclamo) {
      iniciarWizardReclamo();
      return;
    }

    // Si NO es reclamo.html, inicializamos lo que exista (seguimiento/contacto)
    iniciarSeguimiento();
    iniciarContacto();
    iniciarCarruselesHome();
  }

  // =========================
  // Wizard Reclamo (pasos 1-6)
  // =========================
  function iniciarWizardReclamo() {
    // Fuerza MAYUSCULAS en campos de texto del reclamo
    bindUppercaseReclamoFields();
    bindAseguradoraOtraField();
    bindAseguradoraInvolucradoOtraField();

    // Paso 1
    const btnPaso1 = document.getElementById('btnPaso1');
    if (btnPaso1) btnPaso1.addEventListener('click', validarPaso1);

    // Paso 2
    const btnPaso2 = document.getElementById('btnPaso2');
    if (btnPaso2) btnPaso2.addEventListener('click', validarPaso2);
    const btnPaso2Anterior = document.getElementById('btnPaso2Anterior');
    if (btnPaso2Anterior) btnPaso2Anterior.addEventListener('click', () => mostrarPaso('paso1'));

    // Paso 3
    const btnPaso3 = document.getElementById('btnPaso3');
    if (btnPaso3) btnPaso3.addEventListener('click', validarPaso3);
    const btnPaso3Anterior = document.getElementById('btnPaso3Anterior');
    if (btnPaso3Anterior) btnPaso3Anterior.addEventListener('click', () => mostrarPaso('paso2'));

    // Paso 4
    const btnPaso4 = document.getElementById('btnPaso4');
    if (btnPaso4) btnPaso4.addEventListener('click', validarPaso4);
    const btnPaso4Anterior = document.getElementById('btnPaso4Anterior');
    if (btnPaso4Anterior) btnPaso4Anterior.addEventListener('click', () => mostrarPaso('paso3'));

    // Paso 5 (Fotos) 
    const btnPaso5 = document.getElementById('btnPaso5');
    if (btnPaso5) btnPaso5.addEventListener('click', () => mostrarPaso('paso6'));
    const btnPaso5Anterior = document.getElementById('btnPaso5Anterior');
    if (btnPaso5Anterior) btnPaso5Anterior.addEventListener('click', () => mostrarPaso('paso4'));

    // Paso 6 (Confirmación)
    const btnEnviarReclamo = document.getElementById('btnEnviarReclamo');
    if (btnEnviarReclamo) btnEnviarReclamo.addEventListener('click', enviarReclamoFinal);
    const btnPaso6Anterior = document.getElementById('btnPaso6Anterior');
    if (btnPaso6Anterior) btnPaso6Anterior.addEventListener('click', () => mostrarPaso('paso5'));

    // Fotos: listeners (solo si existe el paso 5)
    initFotosUI();

    // Arranca en paso1
    mostrarPaso('paso1');
  }

  function mostrarPaso(pasoId) {
    document.querySelectorAll('.formulario').forEach(s => (s.style.display = 'none'));
    const el = document.getElementById(pasoId);
    if (el) el.style.display = 'block';
  }

  function bindUppercaseReclamoFields() {
    const selector = [
      '.formulario input:not([type="email"]):not([type="date"]):not([type="time"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="password"])',
      '.formulario textarea'
    ].join(', ');

    document.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.uppercaseBound === '1') return;
      el.dataset.uppercaseBound = '1';

      const toUpper = () => {
        const current = String(el.value || '');
        const upper = current.toUpperCase();
        if (current === upper) return;

        const start = typeof el.selectionStart === 'number' ? el.selectionStart : null;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : null;
        el.value = upper;

        if (document.activeElement === el && start !== null && end !== null) {
          try { el.setSelectionRange(start, end); } catch {}
        }
      };

      el.addEventListener('input', toUpper);
      el.addEventListener('blur', toUpper);
      toUpper();
    });
  }

  function bindAseguradoraOtraField() {
    const select = document.getElementById('aseguradora');
    const grupo = document.getElementById('grupoAseguradoraOtra');
    const input = document.getElementById('aseguradoraOtra');
    if (!select || !grupo || !input) return;

    const render = () => {
      const esOtra = select.value === 'Otra';
      grupo.style.display = esOtra ? 'block' : 'none';
      if (!esOtra) {
        input.value = '';
        const err = document.getElementById('aseguradoraOtraError');
        if (err) err.textContent = '';
      }
    };

    select.addEventListener('change', render);
    render();
  }

  function bindAseguradoraInvolucradoOtraField() {
    const select = document.getElementById('aseguradoraInvolucrado');
    const grupo = document.getElementById('grupoAseguradoraInvolucradoOtra');
    const input = document.getElementById('aseguradoraInvolucradoOtra');
    if (!select || !grupo || !input) return;

    const render = () => {
      const esOtra = select.value === 'Otra';
      grupo.style.display = esOtra ? 'block' : 'none';
      if (!esOtra) {
        input.value = '';
        const err = document.getElementById('aseguradoraInvolucradoOtraError');
        if (err) err.textContent = '';
      }
    };

    select.addEventListener('change', render);
    render();
  }

  // =========================
  // Validaciones (pasos 1-4)
  // =========================
  function validarPaso1() {
    clearErrors(['nombre', 'apellido', 'documento', 'telefono', 'email']);
    const nombre = val('nombre');
    const apellido = val('apellido');
    const documento = val('documento');
    const telefono = val('telefono');
    const email = val('email');

    let ok = true;
    if (!nombre) { mostrarError('nombre', 'Por favor, ingresa tu nombre.'); ok = false; }
    if (!apellido) { mostrarError('apellido', 'Por favor, ingresa tu apellido.'); ok = false; }
    if (!/^\d{8}$/.test(documento)) { mostrarError('documento', 'Documento inválido. Debe tener 8 dígitos.'); ok = false; }
    if (!/^\d{10}$/.test(telefono)) { mostrarError('telefono', 'Teléfono inválido. Debe tener 10 dígitos.'); ok = false; }
    if (!validarEmail(email)) { mostrarError('email', 'Email inválido. Por favor, ingresa un correo válido.'); ok = false; }

    if (ok) mostrarPaso('paso2');
  }

  function validarPaso2() {
    clearErrors(['fechaChoque', 'horaChoque', 'lugarChoque', 'provincia', 'localidad', 'patente', 'aseguradora', 'aseguradoraOtra']);
    const fechaChoque = val('fechaChoque');
    const horaChoque = val('horaChoque');
    const lugarChoque = val('lugarChoque');
    const provincia = selectVal('provincia');
    const localidad = val('localidad');
    const patente = val('patente').toUpperCase();
    const aseguradora = selectVal('aseguradora');
    const aseguradoraOtra = val('aseguradoraOtra');

    let ok = true;
    if (!fechaChoque) { mostrarError('fechaChoque', 'Por favor, selecciona la fecha del choque.'); ok = false; }
    if (!horaChoque) { mostrarError('horaChoque', 'Por favor, selecciona la hora del choque.'); ok = false; }
    if (!lugarChoque) { mostrarError('lugarChoque', 'Por favor, ingresa el lugar de ocurrencia.'); ok = false; }
    if (!provincia) { mostrarError('provincia', 'Por favor, selecciona una provincia.'); ok = false; }
    if (!localidad) { mostrarError('localidad', 'Por favor, ingresa la localidad.'); ok = false; }

    const placaRegex = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
    if (!placaRegex.test(patente)) { mostrarError('patente', 'Patente inválida. Usa ABC123 o AB123CD.'); ok = false; }
    if (!aseguradora) { mostrarError('aseguradora', 'Por favor, selecciona una aseguradora.'); ok = false; }
    if (aseguradora === 'Otra' && !aseguradoraOtra) {
      mostrarError('aseguradoraOtra', 'Por favor, ingresá el nombre de tu aseguradora.');
      ok = false;
    }

    if (ok) mostrarPaso('paso3');
  }

  function validarPaso3() {
    clearErrors([
      'nombreInvolucrado',
      'apellidoInvolucrado',
      'documentoInvolucrado',
      'aseguradoraInvolucrado',
      'aseguradoraInvolucradoOtra',
      'patenteInvolucrado'
    ]);
    const documentoInvolucrado = val('documentoInvolucrado');
    const patenteInvolucrado = val('patenteInvolucrado').toUpperCase();

    let ok = true;
    if (documentoInvolucrado && !/^\d{7,8}$/.test(documentoInvolucrado)) {
      mostrarError('documentoInvolucrado', 'Documento inválido. Debe tener 7 u 8 dígitos.');
      ok = false;
    }

    const placaRegex = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
    if (patenteInvolucrado && !placaRegex.test(patenteInvolucrado)) {
      mostrarError('patenteInvolucrado', 'Patente inválida. Usa ABC123 o AB123CD.');
      ok = false;
    }

    if (ok) mostrarPaso('paso4');
  }

  function validarPaso4() {
    clearErrors(['partes', 'descripcionAccidente']);
    const descripcionAccidente = val('descripcionAccidente');
    const partesSeleccionadas = document.querySelectorAll('input[name="partes"]:checked').length;

    let ok = true;
    if (partesSeleccionadas === 0) { mostrarError('partes', 'Por favor, selecciona al menos una parte afectada.'); ok = false; }
    if (!descripcionAccidente) { mostrarError('descripcionAccidente', 'Por favor, describe el accidente.'); ok = false; }

    if (ok) mostrarPaso('paso5');
  }

  // =========================
  // Datos reclamo (JSON)
  // =========================
  function obtenerDatosReclamo() {
    const aseguradoraSeleccionada = selectVal('aseguradora');
    const aseguradoraFinal = (aseguradoraSeleccionada === 'Otra')
      ? escapeHTML(val('aseguradoraOtra'))
      : aseguradoraSeleccionada;
    const aseguradoraInvolucradoSeleccionada = selectVal('aseguradoraInvolucrado');
    const aseguradoraInvolucradoFinal = (aseguradoraInvolucradoSeleccionada === 'Otra')
      ? escapeHTML(val('aseguradoraInvolucradoOtra'))
      : aseguradoraInvolucradoSeleccionada;

    return {
      nombre: escapeHTML(val('nombre')),
      apellido: escapeHTML(val('apellido')),
      documento: escapeHTML(val('documento')),
      telefono: escapeHTML(val('telefono')),
      email: escapeHTML(val('email')),
      fechaChoque: val('fechaChoque'),
      horaChoque: val('horaChoque'),
      lugarChoque: escapeHTML(val('lugarChoque')),
      provincia: selectVal('provincia'),
      localidad: escapeHTML(val('localidad')),
      patente: escapeHTML(val('patente').toUpperCase()),
      aseguradora: aseguradoraFinal,
      nombreInvolucrado: escapeHTML(val('nombreInvolucrado')),
      apellidoInvolucrado: escapeHTML(val('apellidoInvolucrado')),
      documentoInvolucrado: escapeHTML(val('documentoInvolucrado')),
      aseguradoraInvolucrado: aseguradoraInvolucradoFinal,
      patenteInvolucrado: escapeHTML(val('patenteInvolucrado').toUpperCase()),
      partes: Array.from(document.querySelectorAll('input[name="partes"]:checked')).map(el => escapeHTML(el.value)),
      descripcionAccidente: escapeHTML(val('descripcionAccidente')),
      aceptaPrivacidad: document.getElementById('aceptaPrivacidad')?.checked === true,
    };
  }

  // =========================
  // EnvÃƒÂ­o final (Paso 6)
  // =========================
  async function enviarReclamoFinal() {
    const btn = document.getElementById('btnEnviarReclamo');
    const btnBack = document.getElementById('btnPaso6Anterior');
    const originalText = btn ? btn.textContent : 'Concluir Reclamo';

    const habilitarBotones = () => {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
      if (btnBack) btnBack.disabled = false;
    };

    clearErrors(['aceptaPrivacidad']);
    const chkPrivacidad = document.getElementById('aceptaPrivacidad');
    if (!chkPrivacidad || !chkPrivacidad.checked) {
      mostrarError('aceptaPrivacidad', 'Debes aceptar las Politicas de Privacidad para continuar.');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Enviando reclamo...'; }
    if (btnBack) btnBack.disabled = true;

    try {
      const hayFotos = contarFotosSeleccionadas() > 0;

      // Si el reclamo ya fue creado en un intento previo, solo reintenta imagenes
      if (codigoReclamoPendienteImagenes) {
        if (!hayFotos) {
          mostrarMensajeError(
            `El reclamo ya fue registrado (Codigo: ${codigoReclamoPendienteImagenes}). Volve al paso anterior y adjunta imagenes para reintentar.`
          );
          habilitarBotones();
          return;
        }

        if (btn) btn.textContent = 'Reintentando fotos...';
        await subirFotos(codigoReclamoPendienteImagenes);

        mostrarMensajeExito(
          `Fotos cargadas correctamente para el reclamo ${escapeHTML(codigoReclamoPendienteImagenes)}.<br>Seras redirigido al inicio en 7 segundos.`
        );
        codigoReclamoPendienteImagenes = null;
        setTimeout(() => (window.location.href = 'index.html'), 7000);
        return;
      }

      const datosReclamo = obtenerDatosReclamo();
      const r1 = await fetch(apiUrl('/reclamo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosReclamo)
      });

      if (!r1.ok) {
        let msg = `Error HTTP ${r1.status}`;
        try {
          const j = await r1.json();
          msg = j.mensaje || j.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const data = await r1.json();
      const codigo = (data && data.codigo) ? String(data.codigo) : null;
      if (!codigo) throw new Error('El backend no devolvio el codigo del reclamo.');

      if (!hayFotos) {
        mostrarMensajeExito(
          `Reclamo enviado (Codigo: ${escapeHTML(codigo)}).<br>No adjuntaste fotos.<br>Seras redirigido al inicio en 7 segundos.`
        );
        setTimeout(() => (window.location.href = 'index.html'), 7000);
        return;
      }

      if (btn) btn.textContent = 'Subiendo fotos...';
      try {
        await subirFotos(codigo);
        mostrarMensajeExito(
          `Reclamo enviado (Codigo: ${escapeHTML(codigo)}).<br>Fotos cargadas correctamente.<br>Seras redirigido al inicio en 7 segundos.`
        );
        setTimeout(() => (window.location.href = 'index.html'), 7000);
      } catch (eFotos) {
        codigoReclamoPendienteImagenes = codigo;
        mostrarMensajeError(
          `El reclamo fue registrado (Codigo: ${codigo}), pero hubo un problema subiendo imagenes: ${escapeHTML(eFotos.message)}.<br>Usa el boton Anterior para corregir las imagenes y luego presiona nuevamente Concluir Reclamo para reintentar el envio.`
        );
        habilitarBotones();
      }
    } catch (err) {
      console.error('Error enviando reclamo:', err);
      mostrarMensajeError('Hubo un error al enviar el reclamo: ' + escapeHTML(err.message));
      habilitarBotones();
    }
  }

  // =========================
  // Subida de fotos (FormData)
  // =========================
  async function subirFotos(codigo) {
    const form = new FormData();

    pushIfFile(form, fotos.dniFrente);
    pushIfFile(form, fotos.dniDorso);
    pushIfFile(form, fotos.tvFrente);
    pushIfFile(form, fotos.tvDorso);
    pushIfFile(form, fotos.carnetFrente);
    pushIfFile(form, fotos.carnetDorso);
    pushIfFile(form, fotos.vehiculoFoto);
    (fotos.danosFotos || []).forEach(f => pushIfFile(form, f));

    const r = await fetch(apiUrl(`/reclamo/${encodeURIComponent(codigo)}/imagenes`), {
      method: 'POST',
      body: form
    });

    if (!r.ok) {
      let msg = `Error subiendo imagenes (HTTP ${r.status})`;
      try {
        const j = await r.json();
        msg = j.error || j.mensaje || msg;
      } catch {}
      throw new Error(msg);
    }
    return r.json().catch(() => null);
  }

  function pushIfFile(form, file) {
    if (file instanceof File) {
      form.append('imagenes', file, file.name);
    }
  }

  function contarFotosSeleccionadas() {
    let n = 0;
    Object.keys(fotos).forEach(k => {
      if (k === 'danosFotos') n += (fotos.danosFotos || []).length;
      else if (fotos[k] instanceof File) n++;
    });
    return n;
  }

  // =========================
  // UI Fotos + Preview (DataURL)
  // =========================
  function initFotosUI() {
    bindSingleFile('dniFrente', 'dniFrenteError', 'prev-dniFrente', (f) => (fotos.dniFrente = f));
    bindSingleFile('dniDorso', 'dniDorsoError', 'prev-dniDorso', (f) => (fotos.dniDorso = f));
    bindSingleFile('tvFrente', 'tvFrenteError', 'prev-tvFrente', (f) => (fotos.tvFrente = f));
    bindSingleFile('tvDorso', 'tvDorsoError', 'prev-tvDorso', (f) => (fotos.tvDorso = f));
    bindSingleFile('carnetFrente', 'carnetFrenteError', 'prev-carnetFrente', (f) => (fotos.carnetFrente = f));
    bindSingleFile('carnetDorso', 'carnetDorsoError', 'prev-carnetDorso', (f) => (fotos.carnetDorso = f));
    bindSingleFile('vehiculoFoto', 'vehiculoFotoError', 'prev-vehiculoFoto', (f) => (fotos.vehiculoFoto = f));

    bindMultiFiles('danosFotos', 'danosFotosError', 'prev-danosFotos');
  }

  function bindSingleFile(inputId, errId, prevId, setFn) {
    const input = document.getElementById(inputId);
    const err = document.getElementById(errId);
    const prev = document.getElementById(prevId);
    if (!input || !prev) return;

    input.addEventListener('change', () => {
      if (err) err.textContent = '';
      prev.innerHTML = '';

      const file = input.files && input.files[0] ? input.files[0] : null;
      if (!file) { setFn(null); return; }

      const v = validarArchivo(file);
      if (!v.ok) {
        if (err) err.textContent = v.msg;
        input.value = '';
        setFn(null);
        return;
      }

      setFn(file);
      renderPreviewCard(prev, file, input, err, setFn);
    });
  }

  function bindMultiFiles(inputId, errId, prevId) {
    const input = document.getElementById(inputId);
    const err = document.getElementById(errId);
    const prev = document.getElementById(prevId);
    if (!input || !prev) return;

    input.addEventListener('change', () => {
      if (err) err.textContent = '';

      const list = Array.from(input.files || []);
      if (!list.length) return;

      const validas = [];
      for (const f of list) {
        const v = validarArchivo(f);
        if (!v.ok) { if (err) err.textContent = v.msg; continue; }
        validas.push(f);
      }

      if (!validas.length) { input.value = ''; return; }

      fotos.danosFotos = (fotos.danosFotos || []).concat(validas);
      input.value = '';
      renderPreviewGrid(prev);
    });
  }

  function validarArchivo(file) {
    if (!(file instanceof File)) return { ok: false, msg: 'Archivo invalido.' };
    if (file.size > MAX_BYTES) return { ok: false, msg: `La imagen supera ${MAX_MB}MB. Reduca el tamaño o elegi otra.` };
    if (!ALLOWED_MIME.has(file.type)) return { ok: false, msg: 'Formato no compatible. Usa¡ JPG/JPEG o PNG.' };
    return { ok: true };
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.readAsDataURL(file);
    });
  }

  function renderPreviewCard(container, file, input, errEl, setFn) {
    const card = document.createElement('div');
    card.className = 'preview-card';

    const top = document.createElement('div');
    top.className = 'preview-card__top';

    const meta = document.createElement('div');
    meta.className = 'preview-meta';
    meta.innerHTML = `<strong>${escapeHTML(file.name)}</strong><div class="muted">${formatBytes(file.size)}</div>`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preview-del';
    btn.textContent = 'ELIMINAR';

    btn.addEventListener('click', () => {
      input.value = '';
      container.innerHTML = '';
      setFn(null);
      if (errEl) errEl.textContent = '';
    });

    top.appendChild(meta);
    top.appendChild(btn);

    const body = document.createElement('div');
    body.className = 'preview-card__body';

    if (esPreviewable(file.type)) {
      const img = document.createElement('img');
      img.alt = 'preview';
      body.appendChild(img);

      fileToDataURL(file)
        .then((dataUrl) => { img.src = dataUrl; })
        .catch(() => {
          body.innerHTML = `<div class="preview-fallback">No se pudo generar la vista previa.</div>`;
        });
    } else {
      body.innerHTML = `<div class="preview-fallback">Vista previa no disponible para este formato.</div>`;
    }

    card.appendChild(top);
    card.appendChild(body);
    container.appendChild(card);
  }

  function renderPreviewGrid(container) {
    container.innerHTML = '';

    (fotos.danosFotos || []).forEach((file, idx) => {
      const card = document.createElement('div');
      card.className = 'preview-card';

      const top = document.createElement('div');
      top.className = 'preview-card__top';

      const meta = document.createElement('div');
      meta.className = 'preview-meta';
      meta.innerHTML = `<strong>${escapeHTML(file.name)}</strong><div class="muted">${formatBytes(file.size)}</div>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preview-del';
      btn.textContent = 'ELIMINAR';

      btn.addEventListener('click', () => {
        fotos.danosFotos.splice(idx, 1);
        renderPreviewGrid(container);
      });

      top.appendChild(meta);
      top.appendChild(btn);

      const body = document.createElement('div');
      body.className = 'preview-card__body';

      if (esPreviewable(file.type)) {
        const img = document.createElement('img');
        img.alt = 'preview';
        body.appendChild(img);

        fileToDataURL(file)
          .then((dataUrl) => { img.src = dataUrl; })
          .catch(() => {
            body.innerHTML = `<div class="preview-fallback">No se pudo generar la vista previa.</div>`;
          });
      } else {
        body.innerHTML = `<div class="preview-fallback">Vista previa no disponible para este formato.</div>`;
      }

      card.appendChild(top);
      card.appendChild(body);
      container.appendChild(card);
    });
  }

  // =========================
  // Seguimiento (index.html)
  // =========================
  function iniciarSeguimiento() {
    const consultaForm = document.getElementById('consultaForm');
    if (!consultaForm) return;

    consultaForm.addEventListener('submit', function (event) {
      event.preventDefault();
      consultarReclamo();
    });

    const btnVolverConsulta = document.getElementById('btnVolverConsulta');
    if (btnVolverConsulta) {
      btnVolverConsulta.addEventListener('click', function () {
        mostrarSeccion('seguimientoPaso1');
        document.querySelectorAll('.progress-tracker .step').forEach(p => p.classList.remove('active'));
        const inp = document.getElementById('codigoReclamo');
        if (inp) inp.value = '';
        clearErrors(['codigoReclamo']);
      });
    }
  }

  function consultarReclamo() {
    clearErrors(['codigoReclamo']);
    const codigo = val('codigoReclamo');
    if (!codigo) { mostrarError('codigoReclamo', 'Por favor, ingresa el código de reclamo.'); return; }

    const btnConsultar = document.querySelector('#consultaForm button[type="submit"]');
    const originalText = btnConsultar ? btnConsultar.textContent : '';
    if (btnConsultar) { btnConsultar.disabled = true; btnConsultar.textContent = 'Consultando...'; }

    fetch(apiUrl(`/seguimiento/${encodeURIComponent(codigo)}`))
      .then(r => r.json())
      .then(data => {
        if (data && data.estado) {
          actualizarProgresoReclamo(data.estado);
          mostrarSeccion('seguimientoPaso2');
        } else {
          mostrarError('codigoReclamo', (data && data.mensaje) ? data.mensaje : 'Código de reclamo no encontrado.');
        }
      })
      .catch(() => {
        mostrarError('codigoReclamo', 'Hubo un error al consultar el reclamo.');
      })
      .finally(() => {
        if (btnConsultar) { btnConsultar.disabled = false; btnConsultar.textContent = originalText; }
      });
  }

  function actualizarProgresoReclamo(estado) {
    const etapas = ['Ingresado', 'En revisión', 'Aprobación', 'Reclamación', 'Gestión de pago', 'Reclamo finalizado'];
    const etapaActual = etapas.indexOf(estado) + 1;

    document.querySelectorAll('.progress-tracker .step').forEach(paso => {
      const numeroPaso = parseInt(paso.getAttribute('data-step'), 10);
      if (numeroPaso <= etapaActual) paso.classList.add('active');
      else paso.classList.remove('active');
    });
  }

  function mostrarSeccion(seccionId) {
    // Solo oculta secciones "seguimientoPasoX" si existen, para no romper otras pÃƒÂ¡ginas
    const s1 = document.getElementById('seguimientoPaso1');
    const s2 = document.getElementById('seguimientoPaso2');
    if (s1) s1.style.display = 'none';
    if (s2) s2.style.display = 'none';

    const seccion = document.getElementById(seccionId);
    if (seccion) seccion.style.display = 'block';
  }

  // =========================
  // Contacto (index.html)
  // =========================
  function iniciarContacto() {
    const formContacto = document.getElementById('formContacto');
    if (!formContacto) return;

    formContacto.addEventListener('submit', function (event) {
      event.preventDefault();
      enviarFormularioContacto();
    });
  }

  function iniciarCarruselesHome() {
    const carruseles = Array.from(document.querySelectorAll('.js-mobile-carousel[data-dots]'));
    if (!carruseles.length) return;

    carruseles.forEach((carrusel) => {
      const dotsId = carrusel.getAttribute('data-dots');
      const dotsContainer = dotsId ? document.getElementById(dotsId) : null;
      if (!dotsContainer) return;

      const tarjetas = Array.from(carrusel.children).filter((el) => el.nodeType === 1);
      if (!tarjetas.length) return;

      dotsContainer.innerHTML = '';
      const dots = tarjetas.map((_, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Ir a tarjeta ${idx + 1}`);
        dot.addEventListener('click', () => {
          const target = tarjetas[idx];
          const left = target.offsetLeft - carrusel.offsetLeft;
          carrusel.scrollTo({ left, behavior: 'smooth' });
        });
        dotsContainer.appendChild(dot);
        return dot;
      });

      const marcarActivo = () => {
        const centroCarrusel = carrusel.scrollLeft + carrusel.clientWidth / 2;
        let idxActivo = 0;
        let distanciaMin = Number.POSITIVE_INFINITY;

        tarjetas.forEach((tarjeta, idx) => {
          const centroTarjeta = tarjeta.offsetLeft + tarjeta.offsetWidth / 2;
          const distancia = Math.abs(centroTarjeta - centroCarrusel);
          if (distancia < distanciaMin) {
            distanciaMin = distancia;
            idxActivo = idx;
          }
        });

        dots.forEach((dot, idx) => dot.classList.toggle('is-active', idx === idxActivo));
      };

      let rafId = 0;
      carrusel.addEventListener('scroll', () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(marcarActivo);
      }, { passive: true });

      window.addEventListener('resize', marcarActivo);
      marcarActivo();
    });
  }

  function enviarFormularioContacto() {
    clearErrors(['motivoConsulta', 'nombre', 'apellidos', 'correo', 'confirmarCorreo', 'comentario']);

    const motivoConsulta = selectVal('motivoConsulta');
    const nombre = val('nombre');
    const apellidos = val('apellidos');
    const correo = val('correo');
    const confirmarCorreo = val('confirmarCorreo');
    const comentario = val('comentario');

    let ok = true;
    if (!motivoConsulta) { mostrarError('motivoConsulta', 'Por favor, selecciona el motivo de tu consulta.'); ok = false; }
    if (!/^[A-Za-zÃƒÂÃƒâ€°ÃƒÂÃƒâ€œÃƒÅ¡ÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂºÃƒâ€˜ÃƒÂ±\s]{2,50}$/.test(nombre)) { mostrarError('nombre', 'El nombre debe contener solo letras y espacios.'); ok = false; }
    if (!/^[A-Za-zÃƒÂÃƒâ€°ÃƒÂÃƒâ€œÃƒÅ¡ÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂºÃƒâ€˜ÃƒÂ±\s]{2,50}$/.test(apellidos)) { mostrarError('apellidos', 'Los apellidos deben contener solo letras y espacios.'); ok = false; }
    if (!validarEmail(correo)) { mostrarError('correo', 'Correo electrónico inválido.'); ok = false; }
    if (correo !== confirmarCorreo) { mostrarError('confirmarCorreo', 'Los correos electrónicos no coinciden.'); ok = false; }
    if (comentario.length < 10 || comentario.length > 500) { mostrarError('comentario', 'El comentario debe tener entre 10 y 500 caracteres.'); ok = false; }

    if (!ok) return;

    const datosContacto = {
      motivoConsulta,
      nombre: escapeHTML(nombre),
      apellidos: escapeHTML(apellidos),
      correo: escapeHTML(correo),
      comentario: escapeHTML(comentario)
    };

    const botonEnviar = document.querySelector('#formContacto button[type="submit"]');
    const originalText = botonEnviar ? botonEnviar.textContent : 'Enviar';
    if (botonEnviar) { botonEnviar.disabled = true; botonEnviar.textContent = 'Enviando...'; }

    fetch(apiUrl('/contacto'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosContacto)
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.mensaje) {
          mostrarMensajeExitoContacto('Tu mensaje ha sido enviado correctamente. Gracias por contactarnos.');
          const f = document.getElementById('formContacto');
          if (f) f.reset();
        } else {
          mostrarMensajeErrorContacto('Error al enviar el mensaje.');
        }
      })
      .catch(() => mostrarMensajeErrorContacto('Hubo un error al enviar el mensaje.'))
      .finally(() => {
        if (botonEnviar) { botonEnviar.disabled = false; botonEnviar.textContent = originalText; }
      });
  }

  function mostrarMensajeExitoContacto(mensaje) {
    const div = document.getElementById('mensajeContacto');
    if (!div) return;
    div.innerHTML = `<p class="exito">${escapeHTML(mensaje)}</p>`;
    div.style.display = 'block';
    setTimeout(() => { div.innerHTML = ''; div.style.display = 'none'; }, 5000);
  }

  function mostrarMensajeErrorContacto(mensaje) {
    const div = document.getElementById('mensajeContacto');
    if (!div) return;
    div.innerHTML = `<p class="error">${escapeHTML(mensaje)}</p>`;
    div.style.display = 'block';
    setTimeout(() => { div.innerHTML = ''; div.style.display = 'none'; }, 5000);
  }

  // =========================
  // Mensajes UI (reclamo)
  // =========================
  function mostrarMensajeExito(html) {
    const div = document.getElementById('mensajeReclamo');
    if (!div) return;
    div.innerHTML = `<p class="exito">${html}</p>`;
    div.style.display = 'block';
  }

  function mostrarMensajeError(msg) {
    const div = document.getElementById('mensajeReclamo');
    if (!div) return;
    div.innerHTML = `<p class="error">${escapeHTML(msg)}</p>`;
    div.style.display = 'block';
  }

  // =========================
  // Utilidades
  // =========================
  function val(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function selectVal(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '') : '';
  }

  function validarEmail(email) {
    return /^\S+@\S+\.\S+$/.test(email);
  }

  function mostrarError(campo, mensaje) {
    const el = document.getElementById(`${campo}Error`);
    if (el) {
      el.textContent = mensaje;
      el.style.display = 'block';
    }
  }

  function clearErrors(campos) {
    campos.forEach(campo => {
      const el = document.getElementById(`${campo}Error`);
      if (el) {
        el.textContent = '';
        el.style.display = 'none';
      }
    });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str == null ? '' : String(str)));
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    const b = Number(bytes || 0);
    if (b < 1024) return `${b} B`;
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  document.addEventListener('DOMContentLoaded', initGlobal);
})();


/*<!--Revisado em texto-->*/

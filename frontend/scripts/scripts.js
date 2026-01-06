(function() {
  'use strict';

  // ===== Reclamo: init de listeners y arranque de módulos =====
  function iniciarFormulario() {
    // Paso 1 → 5
    const btnPaso1 = document.getElementById('btnPaso1');
    if (btnPaso1) btnPaso1.addEventListener('click', validarPaso1);

    const btnPaso2 = document.getElementById('btnPaso2');
    if (btnPaso2) btnPaso2.addEventListener('click', validarPaso2);
    const btnPaso2Anterior = document.getElementById('btnPaso2Anterior');
    if (btnPaso2Anterior) btnPaso2Anterior.addEventListener('click', () => mostrarPaso('paso1'));

    const btnPaso3 = document.getElementById('btnPaso3');
    if (btnPaso3) btnPaso3.addEventListener('click', validarPaso3);
    const btnPaso3Anterior = document.getElementById('btnPaso3Anterior');
    if (btnPaso3Anterior) btnPaso3Anterior.addEventListener('click', () => mostrarPaso('paso2'));

    const btnPaso4 = document.getElementById('btnPaso4');
    if (btnPaso4) btnPaso4.addEventListener('click', validarPaso4);
    const btnPaso4Anterior = document.getElementById('btnPaso4Anterior');
    if (btnPaso4Anterior) btnPaso4Anterior.addEventListener('click', () => mostrarPaso('paso3'));

    const btnEnviarReclamo = document.getElementById('btnEnviarReclamo');
    if (btnEnviarReclamo) btnEnviarReclamo.addEventListener('click', enviarReclamo);
    const btnPaso5Anterior = document.getElementById('btnPaso5Anterior');
    if (btnPaso5Anterior) btnPaso5Anterior.addEventListener('click', () => mostrarPaso('paso4'));

    // Progreso + init de páginas relacionadas
    actualizarProgressBar();
    iniciarSeguimiento();
    iniciarContacto();
  }

  // Muestra un paso y oculta los demás
  function mostrarPaso(paso) {
    document.querySelectorAll('.formulario').forEach(section => section.style.display = 'none');
    const pasoElement = document.getElementById(paso);
    if (pasoElement) pasoElement.style.display = 'block';
    actualizarProgressBar(paso);
  }

  // ===== Validaciones por paso (reclamo) =====
  function validarPaso1() {
    clearErrors(['nombre', 'apellido', 'documento', 'telefono', 'email']);
    const nombre = document.getElementById('nombre').value.trim();
    const apellido = document.getElementById('apellido').value.trim();
    const documento = document.getElementById('documento').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const email = document.getElementById('email').value.trim();
    let esValido = true;

    if (nombre === "") { mostrarError('nombre', 'Por favor, ingresa tu nombre.'); esValido = false; }
    if (apellido === "") { mostrarError('apellido', 'Por favor, ingresa tu apellido.'); esValido = false; }
    if (!/^\d{8}$/.test(documento)) { mostrarError('documento', 'Documento inválido. Debe tener 8 dígitos.'); esValido = false; }
    if (!/^\d{10}$/.test(telefono)) { mostrarError('telefono', 'Teléfono inválido. Debe tener 10 dígitos.'); esValido = false; }
    if (!validarEmail(email)) { mostrarError('email', 'Email inválido. Por favor, ingresa un correo válido.'); esValido = false; }

    if (esValido) mostrarPaso('paso2');
  }

  function validarPaso2() {
    clearErrors(['fechaChoque', 'horaChoque', 'lugarChoque', 'provincia', 'localidad', 'patente', 'aseguradora']);
    const fechaChoque = document.getElementById('fechaChoque').value;
    const horaChoque = document.getElementById('horaChoque').value;
    const lugarChoque = document.getElementById('lugarChoque').value.trim();
    const provincia = document.getElementById('provincia').value;
    const localidad = document.getElementById('localidad').value.trim();
    const patente = document.getElementById('patente').value.trim().toUpperCase();
    const aseguradora = document.getElementById('aseguradora').value;
    let esValido = true;

    // Requeridos
    if (fechaChoque === "") { mostrarError('fechaChoque', 'Por favor, selecciona la fecha del choque.'); esValido = false; }
    if (horaChoque === "") { mostrarError('horaChoque', 'Por favor, selecciona la hora del choque.'); esValido = false; }
    if (lugarChoque === "") { mostrarError('lugarChoque', 'Por favor, ingresa el lugar de ocurrencia.'); esValido = false; }
    if (provincia === "") { mostrarError('provincia', 'Por favor, selecciona una provincia.'); esValido = false; }
    if (localidad === "") { mostrarError('localidad', 'Por favor, ingresa la localidad.'); esValido = false; }

    // Patente AR: ABC123 o AB123CD
    const placaRegex = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
    if (!placaRegex.test(patente)) { mostrarError('patente', 'Patente inválida. Usa ABC123 o AB123CD.'); esValido = false; }

    if (aseguradora === "") { mostrarError('aseguradora', 'Por favor, selecciona una aseguradora.'); esValido = false; }

    if (esValido) mostrarPaso('paso3');
  }

  function validarPaso3() {
    clearErrors(['nombreInvolucrado', 'apellidoInvolucrado', 'documentoInvolucrado', 'aseguradoraInvolucrado', 'patenteInvolucrado']);
    const nombreInvolucrado = document.getElementById('nombreInvolucrado').value.trim();
    const apellidoInvolucrado = document.getElementById('apellidoInvolucrado').value.trim();
    const documentoInvolucrado = document.getElementById('documentoInvolucrado').value.trim();
    const aseguradoraInvolucrado = document.getElementById('aseguradoraInvolucrado').value;
    const patenteInvolucrado = document.getElementById('patenteInvolucrado').value.trim().toUpperCase();
    let esValido = true;

    // Requeridos del involucrado
    if (nombreInvolucrado === "") { mostrarError('nombreInvolucrado', 'Por favor, ingresa el nombre del involucrado.'); esValido = false; }
    if (apellidoInvolucrado === "") { mostrarError('apellidoInvolucrado', 'Por favor, ingresa el apellido del involucrado.'); esValido = false; }
    if (!/^\d{8}$/.test(documentoInvolucrado)) { mostrarError('documentoInvolucrado', 'Documento inválido. Debe tener 8 dígitos.'); esValido = false; }
    if (aseguradoraInvolucrado === "") { mostrarError('aseguradoraInvolucrado', 'Por favor, selecciona una aseguradora.'); esValido = false; }

    // Patente del involucrado
    const placaRegex = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
    if (!placaRegex.test(patenteInvolucrado)) { mostrarError('patenteInvolucrado', 'Patente inválida. Usa ABC123 o AB123CD.'); esValido = false; }

    if (esValido) mostrarPaso('paso4');
  }

  function validarPaso4() {
    clearErrors(['partes', 'descripcionAccidente']);
    const descripcionAccidente = document.getElementById('descripcionAccidente').value.trim();
    const partesSeleccionadas = document.querySelectorAll('input[name="partes"]:checked').length;
    let esValido = true;

    // Debe elegir al menos 1 parte + descripción requerida
    if (partesSeleccionadas === 0) { mostrarError('partes', 'Por favor, selecciona al menos una parte afectada.'); esValido = false; }
    if (descripcionAccidente === "") { mostrarError('descripcionAccidente', 'Por favor, describe el accidente.'); esValido = false; }

    if (esValido) mostrarPaso('paso5');
  }

  // Construye el objeto para enviar al backend 
  function obtenerDatosReclamo() {
    return {
      nombre: escapeHTML(document.getElementById('nombre').value.trim()),
      apellido: escapeHTML(document.getElementById('apellido').value.trim()),
      documento: escapeHTML(document.getElementById('documento').value.trim()),
      telefono: escapeHTML(document.getElementById('telefono').value.trim()),
      email: escapeHTML(document.getElementById('email').value.trim()),
      fechaChoque: document.getElementById('fechaChoque').value,
      horaChoque: document.getElementById('horaChoque').value,
      lugarChoque: escapeHTML(document.getElementById('lugarChoque').value.trim()),
      provincia: document.getElementById('provincia').value,
      localidad: escapeHTML(document.getElementById('localidad').value.trim()),
      patente: escapeHTML(document.getElementById('patente').value.trim().toUpperCase()),
      aseguradora: document.getElementById('aseguradora').value,
      nombreInvolucrado: escapeHTML(document.getElementById('nombreInvolucrado').value.trim()),
      apellidoInvolucrado: escapeHTML(document.getElementById('apellidoInvolucrado').value.trim()),
      documentoInvolucrado: escapeHTML(document.getElementById('documentoInvolucrado').value.trim()),
      aseguradoraInvolucrado: document.getElementById('aseguradoraInvolucrado').value,
      patenteInvolucrado: escapeHTML(document.getElementById('patenteInvolucrado').value.trim().toUpperCase()),
      partes: Array.from(document.querySelectorAll('input[name="partes"]:checked')).map(el => escapeHTML(el.value)),
      descripcionAccidente: escapeHTML(document.getElementById('descripcionAccidente').value.trim()),
    };
  }

  // POST /reclamo
  function enviarReclamo() {
    const datosReclamo = obtenerDatosReclamo();
    const btnEnviar = document.getElementById('btnEnviarReclamo');
    const textoOriginal = btnEnviar.textContent;
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';

    fetch('/reclamo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosReclamo)
    })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data.mensaje) {
        mostrarMensajeExito('Tu reclamo ha sido enviado exitosamente. Recibirás un correo electrónico con los detalles. Serás redirigido al inicio en 6 segundos.');
        const btnPaso5Anterior = document.getElementById('btnPaso5Anterior');
        if (btnPaso5Anterior) btnPaso5Anterior.disabled = true;
        setTimeout(() => window.location.href = 'index.html', 6000);
      } else {
        throw new Error('Respuesta sin mensaje');
      }
    })
    .catch(error => {
      console.error('Error enviando reclamo:', error);
      mostrarMensajeError('Hubo un error al enviar el reclamo. Por favor, intenta de nuevo.');
      btnEnviar.disabled = false;
      btnEnviar.textContent = textoOriginal;
    });
  }

  // Mensajes globales del reclamo
  function mostrarMensajeExito(mensaje) {
    const mensajeDiv = document.getElementById('mensajeReclamo');
    if (mensajeDiv) {
      mensajeDiv.innerHTML = `<p class="exito">${escapeHTML(mensaje)}</p>`;
      mensajeDiv.style.display = 'block';
    }
  }

  function actualizarProgressBar(pasoActual = 'paso1') {
    const steps = document.querySelectorAll('.progress-bar .step');
    const numeroPasoActual = parseInt(pasoActual.replace('paso', ''), 10);
    steps.forEach(step => {
      const paso = parseInt(step.getAttribute('data-step'), 10);
      paso <= numeroPasoActual ? step.classList.add('active') : step.classList.remove('active');
    });
  }

  // ===== Seguimiento (consulta por código) =====
  function iniciarSeguimiento() {
    const consultaForm = document.getElementById('consultaForm');
    if (consultaForm) consultaForm.addEventListener('submit', function(event) {
      event.preventDefault();
      consultarReclamo();
    });

    const btnVolverConsulta = document.getElementById('btnVolverConsulta');
    if (btnVolverConsulta) btnVolverConsulta.addEventListener('click', function() {
      mostrarSeccion('seguimientoPaso1');
      document.querySelectorAll('.progress-tracker .step').forEach(paso => paso.classList.remove('active'));
      document.getElementById('codigoReclamo').value = '';
      clearErrors(['codigoReclamo']);
    });
  }

  // GET /seguimiento/:codigo y pintado del tracker
  function consultarReclamo() {
    clearErrors(['codigoReclamo']);
    const codigo = document.getElementById('codigoReclamo').value.trim();
    if (codigo === "") { mostrarError('codigoReclamo', 'Por favor, ingresa el código de reclamo.'); return; }

    const btnConsultar = document.querySelector('#consultaForm button[type="submit"]');
    const originalText = btnConsultar ? btnConsultar.textContent : '';
    if (btnConsultar) { btnConsultar.disabled = true; btnConsultar.textContent = 'Consultando...'; }

    fetch(`/seguimiento/${encodeURIComponent(codigo)}`)
      .then(response => response.json())
      .then(data => {
        if (data.estado) {
          actualizarProgresoReclamo(data.estado);
          mostrarSeccion('seguimientoPaso2');
        } else {
          mostrarError('codigoReclamo', data.mensaje || 'Código de reclamo no encontrado.');
        }
        if (btnConsultar) { btnConsultar.disabled = false; btnConsultar.textContent = originalText; }
      })
      .catch(error => {
        console.error('Error:', error);
        mostrarError('codigoReclamo', 'Hubo un error al consultar el reclamo.');
        if (btnConsultar) { btnConsultar.disabled = false; btnConsultar.textContent = originalText; }
      });
  }

  // Marca pasos activos según estado devuelto por backend
  function actualizarProgresoReclamo(estado) {
    const etapas = ['Ingresado', 'En revisión', 'Aprobación', 'Reclamación', 'Gestión de pago', 'Reclamo finalizado'];
    const etapaActual = etapas.indexOf(estado) + 1;
    document.querySelectorAll('.progress-tracker .step').forEach(paso => {
      const numeroPaso = parseInt(paso.getAttribute('data-step'), 10);
      numeroPaso <= etapaActual ? paso.classList.add('active') : paso.classList.remove('active');
    });
  }

  // Mostrar/ocultar secciones de seguimiento
  function mostrarSeccion(seccionId) {
    document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
    const seccion = document.getElementById(seccionId);
    if (seccion) seccion.style.display = 'block';
  }

  // ===== Contacto: submit + feedback =====
  function iniciarContacto() {
    const formContacto = document.getElementById('formContacto');
    if (formContacto) formContacto.addEventListener('submit', function(event) {
      event.preventDefault();
      enviarFormularioContacto();
    });
  }

  // POST /contacto con validaciones
  function enviarFormularioContacto() {
    clearErrors(['motivoConsulta', 'nombre', 'apellidos', 'correo', 'confirmarCorreo', 'comentario']);
    const motivoConsulta = document.getElementById('motivoConsulta').value;
    const nombre = document.getElementById('nombre').value.trim();
    const apellidos = document.getElementById('apellidos').value.trim();
    const correo = document.getElementById('correo').value.trim();
    const confirmarCorreo = document.getElementById('confirmarCorreo').value.trim();
    const comentario = document.getElementById('comentario').value.trim();
    let esValido = true;

    if (motivoConsulta === "") { mostrarError('motivoConsulta', 'Por favor, selecciona el motivo de tu consulta.'); esValido = false; }
    if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]{2,50}$/.test(nombre)) { mostrarError('nombre', 'El nombre debe contener solo letras y espacios.'); esValido = false; }
    if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]{2,50}$/.test(apellidos)) { mostrarError('apellidos', 'Los apellidos deben contener solo letras y espacios.'); esValido = false; }
    if (!validarEmail(correo)) { mostrarError('correo', 'Correo electrónico inválido.'); esValido = false; }
    if (correo !== confirmarCorreo) { mostrarError('confirmarCorreo', 'Los correos electrónicos no coinciden.'); esValido = false; }
    if (comentario.length < 10 || comentario.length > 500) { mostrarError('comentario', 'El comentario debe tener entre 10 y 500 caracteres.'); esValido = false; }

    if (!esValido) return;

    const datosContacto = {
      motivoConsulta,
      nombre: escapeHTML(nombre),
      apellidos: escapeHTML(apellidos),
      correo: escapeHTML(correo),
      comentario: escapeHTML(comentario)
    };

    const botonEnviar = document.querySelector('#formContacto button[type="submit"]');
    const originalText = botonEnviar.textContent;
    botonEnviar.disabled = true;
    botonEnviar.textContent = 'Enviando...';

    fetch('/contacto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosContacto)
    })
    .then(response => response.json())
    .then(data => {
      if (data.mensaje) {
        mostrarMensajeExitoContacto('Tu mensaje ha sido enviado correctamente. Gracias por contactarnos.');
        document.getElementById('formContacto').reset();
      } else {
        mostrarMensajeErrorContacto('Error al enviar el mensaje.');
      }
      botonEnviar.disabled = false;
      botonEnviar.textContent = originalText;
    })
    .catch(error => {
      console.error('Error:', error);
      mostrarMensajeErrorContacto('Hubo un error al enviar el mensaje.');
      botonEnviar.disabled = false;
      botonEnviar.textContent = originalText;
    });
  }

  // Mensajes globales de contacto
  function mostrarMensajeExitoContacto(mensaje) {
    const mensajeDiv = document.getElementById('mensajeContacto');
    mensajeDiv.innerHTML = `<p class="exito">${escapeHTML(mensaje)}</p>`;
    mensajeDiv.style.display = 'block';
    setTimeout(() => { mensajeDiv.innerHTML = ''; mensajeDiv.style.display = 'none'; }, 5000);
  }

  function mostrarMensajeErrorContacto(mensaje) {
    const mensajeDiv = document.getElementById('mensajeContacto');
    mensajeDiv.innerHTML = `<p class="error">${escapeHTML(mensaje)}</p>`;
    mensajeDiv.style.display = 'block';
    setTimeout(() => { mensajeDiv.innerHTML = ''; mensajeDiv.style.display = 'none'; }, 5000);
  }

  // ===== Utilidades =====
  function validarEmail(email) {
    const re = /^\S+@\S+\.\S+$/;
    return re.test(email);
  }

  // Muestra/limpia errores 
  function mostrarError(campo, mensaje) {
    const errorElement = document.getElementById(`${campo}Error`);
    if (errorElement) {
      errorElement.textContent = mensaje;
      errorElement.style.display = 'block';
    }
  }

  function clearErrors(campos) {
    campos.forEach(campo => {
      const errorElement = document.getElementById(`${campo}Error`);
      if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
      }
    });
  }

  // Escape  (evita ejecución de HTML inyectado)
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // Entry point
  document.addEventListener('DOMContentLoaded', iniciarFormulario);
})();

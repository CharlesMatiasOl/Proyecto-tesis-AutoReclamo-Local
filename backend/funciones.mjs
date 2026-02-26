// ============================ funciones.mjs ============================
// Capa de acceso a datos (MySQL) y envi­o de emails (Nodemailer)

import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SMTP_REJECT_UNAUTHORIZED = (() => {
  const raw = String(
    process.env.SMTP_REJECT_UNAUTHORIZED ??
    (process.env.NODE_ENV === 'production' ? 'true' : 'false')
  )
    .trim()
    .toLowerCase();

  return raw === 'true';
})();

if (process.env.NODE_ENV === 'production' && !SMTP_REJECT_UNAUTHORIZED) {
  throw new Error('[config] En produccion SMTP_REJECT_UNAUTHORIZED debe ser true.');
}

// Pool de MySQL (reutiliza conexiones)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ============================ Reclamo ============================

// Genera código alfanumérico de 6 chars en mayuscula (ej. ABC123)
const CODIGO_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generarCodigo(longitud = 6) {
  const bytes = crypto.randomBytes(longitud);
  let codigo = '';

  for (let i = 0; i < longitud; i++) {
    codigo += CODIGO_ALFABETO[bytes[i] % CODIGO_ALFABETO.length];
  }

  return codigo;
}

// Inserta/recupera cliente, guarda reclamo y devuelve el código de confirmación
export async function guardarReclamo(datos) {
  let connection;
  try {
    connection = await pool.getConnection();

    // ¿Existe cliente por DNI?
    const [rows] = await connection.execute(
      'SELECT id FROM clientes WHERE dni = ?',
      [datos.documento]
    );

    let clienteId;
    if (rows.length > 0) {
      clienteId = rows[0].id;
    } else {
      const [result] = await connection.execute(
        'INSERT INTO clientes (nombre, apellido, dni, telefono, email) VALUES (?, ?, ?, ?, ?)',
        [datos.nombre, datos.apellido, datos.documento, datos.telefono, datos.email]
      );
      clienteId = result.insertId;
    }

    let codigoConfirmacion = null;
    for (let intento = 0; intento < 10; intento++) {
      const candidato = generarCodigo(6);
      const [dup] = await connection.execute(
        'SELECT id FROM reclamos WHERE codigo_confirmacion = ? LIMIT 1',
        [candidato]
      );
      if (!dup.length) {
        codigoConfirmacion = candidato;
        break;
      }
    }

    if (!codigoConfirmacion) {
      throw new Error('No se pudo generar un codigo de confirmacion unico.');
    }

    await connection.execute(
      `INSERT INTO reclamos (
          cliente_id,
          fecha_incidente,
          hora_incidente,
          direccion,
          provincia,
          ciudad,
          patente_vehiculo,
          compania_seguro,
          otro_nombre,
          otro_apellido,
          otro_dni,
          otro_patente,
          otro_compania_seguro,
          partes_afectadas,
          descripcion_accidente,
          codigo_confirmacion,
          estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        clienteId,
        datos.fechaChoque,
        datos.horaChoque,
        datos.lugarChoque,
        datos.provincia,
        datos.localidad,
        datos.patente,
        datos.aseguradora,
        datos.nombreInvolucrado,
        datos.apellidoInvolucrado,
        datos.documentoInvolucrado,
        datos.patenteInvolucrado,
        datos.aseguradoraInvolucrado,
        datos.partes.join(', '),
        datos.descripcionAccidente,
        codigoConfirmacion,
        'Ingresado'
      ]
    );

    return codigoConfirmacion;
  } catch (error) {
    console.error('Error al guardar el reclamo:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

// Envia email de confirmación con el código del reclamo
export async function enviarConfirmacion(email, codigoConfirmacion) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED },
    });

    const mailOptions = {
      from: `"Siniestro Ya" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Confirmación de Reclamo - Sinistro Ya',
      html: `
        <p>Gracias por presentar su reclamo en Sinistro Ya.</p>
        <p>Su código de reclamo es: <strong>${codigoConfirmacion}</strong></p>
        <p>Utilice este código para consultar el estado de su reclamo en nuestro sitio web.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Correo de confirmación enviado a:', email);
  } catch (error) {
    console.error('Error al enviar el correo de confirmación:', error);
    throw error;
  }
}

// ============================ Estado del Reclamo ============================

export async function verificarReclamo(codigo) {
  let connection;
  try {
    connection = await pool.getConnection();

    const [rows] = await connection.execute(
      'SELECT estado FROM reclamos WHERE codigo_confirmacion = ?',
      [codigo]
    );

    return rows.length > 0 ? rows[0].estado : null;
  } catch (error) {
    console.error('Error al verificar el reclamo:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

// ============================ Contacto ============================

export async function guardarMensajeContacto(datos) {
  let connection;
  try {
    connection = await pool.getConnection();

    await connection.execute(
      `INSERT INTO mensajes_contacto (
          motivo_consulta,
          nombre,
          apellidos,
          correo,
          comentario
      ) VALUES (?, ?, ?, ?, ?)` ,
      [
        datos.motivoConsulta,
        datos.nombre,
        datos.apellidos,
        datos.correo,
        datos.comentario
      ]
    );

    console.log('Mensaje de contacto guardado en la base de datos.');
  } catch (error) {
    console.error('Error al guardar el mensaje de contacto:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

export async function enviarCorreoContacto(datos) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED },
    });

    const mailOptions = {
      from: `"AutoReclamo" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `Nuevo mensaje de contacto - ${datos.motivoConsulta}`,
      html: `
        <p>Has recibido un nuevo mensaje de contacto:</p>
        <p><strong>Nombre:</strong> ${datos.nombre} ${datos.apellidos}</p>
        <p><strong>Correo:</strong> ${datos.correo}</p>
        <p><strong>Motivo de consulta:</strong> ${datos.motivoConsulta}</p>
        <p><strong>Comentario:</strong></p>
        <p>${datos.comentario}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Correo de contacto enviado.');
  } catch (error) {
    console.error('Error al enviar el correo de contacto:', error);
    throw error;
  }
}

// ============================ Estadí­sticas ============================

export async function obtenerEstadisticasReclamos() {
  const conn = await pool.getConnection();
  try {
    const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM reclamos');

    const [rows] = await conn.query(`
      SELECT estado, COUNT(*) AS cantidad
      FROM reclamos
      GROUP BY estado
    `);

    const estados = {
      'Ingresado': 0,
      'En revisión': 0,
      'Aprobación': 0,
      'Reclamación': 0,
      'Gestión de pago': 0,
      'Reclamo finalizado': 0,
    };

    for (const r of rows) {
      if (Object.prototype.hasOwnProperty.call(estados, r.estado)) {
        estados[r.estado] = Number(r.cantidad) || 0;
      }
    }

    return {
      total: Number(total) || 0,
      porEstado: {
        ingresado:   estados['Ingresado'],
        enRevision:  estados['En revisión'],
        aprobacion:  estados['Aprobación'],
        reclamacion: estados['Reclamación'],
        gestionPago: estados['Gestión de pago'],
        finalizado:  estados['Reclamo finalizado'],
      }
    };
  } finally {
    conn.release();
  }
}

let consentTableReadyPromise = null;

async function ensureConsentimientoPrivacidadTable() {
  if (!consentTableReadyPromise) {
    consentTableReadyPromise = (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS consentimiento_privacidad (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            reclamo_id BIGINT UNSIGNED NOT NULL,
            aceptado TINYINT(1) NOT NULL DEFAULT 1,
            aceptado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ip VARCHAR(64) NULL,
            user_agent VARCHAR(512) NULL,
            PRIMARY KEY (id),
            KEY idx_consentimiento_privacidad_reclamo_id (reclamo_id)
          )
        `);
      } finally {
        conn.release();
      }
    })();
  }

  return consentTableReadyPromise;
}

export async function guardarConsentimientoPrivacidad({ reclamoId, ip = null, userAgent = null }) {
  if (!reclamoId) {
    throw new Error('reclamoId es obligatorio para guardar el consentimiento de privacidad.');
  }

  await ensureConsentimientoPrivacidadTable();

  const conn = await pool.getConnection();
  try {
    const ua = userAgent ? String(userAgent).slice(0, 512) : null;

    await conn.execute(
      `INSERT INTO consentimiento_privacidad (reclamo_id, aceptado, ip, user_agent)
       VALUES (?, 1, ?, ?)`,
      [reclamoId, ip || null, ua]
    );
  } finally {
    conn.release();
  }
}
// ============================ IMAGENES ============================

// Busca el reclamo_id por codigo_confirmacion
export async function obtenerReclamoIdPorCodigo(codigo) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      'SELECT id FROM reclamos WHERE codigo_confirmacion = ?',
      [codigo]
    );
    return rows.length ? rows[0].id : null;
  } finally {
    conn.release();
  }
}

// Guarda metadata de imagenes en DB (con tag opcional)
export async function guardarImagenesReclamo({ reclamoId, files, codigo, tags = [] }) {
  if (!files || !files.length) return;

  const conn = await pool.getConnection();
  try {
    const sql = `
      INSERT INTO reclamo_imagenes
        (reclamo_id, filename, originalname, mimetype, size_bytes, tag, url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    // tags puede venir como array paralelo a files (mismo orden)
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const tag = Array.isArray(tags) ? (tags[i] ?? null) : null;
      const url = `/uploads/reclamos/${codigo}/${f.filename}`;

      await conn.execute(sql, [
        reclamoId,
        f.filename,
        f.originalname,
        f.mimetype,
        f.size,
        tag,
        url
      ]);
    }
  } finally {
    conn.release();
  }
}

// Lista imagenes del reclamo
export async function obtenerImagenesReclamo(reclamoId) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT id, originalname, mimetype, size_bytes, tag, url, creado_en
       FROM reclamo_imagenes
       WHERE reclamo_id = ?
       ORDER BY creado_en DESC`,
      [reclamoId]
    );
    return rows;
  } finally {
    conn.release();
  }
}

/*<!--Revisado em texto-->*/

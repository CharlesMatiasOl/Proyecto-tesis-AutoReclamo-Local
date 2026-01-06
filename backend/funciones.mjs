// ============================ funciones.mjs ============================
// Capa de acceso a datos (MySQL) y envío de emails (Nodemailer)

import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

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

// Genera código alfanumérico de 6 chars en mayúscula (p.ej. ABC123)
function generarCodigo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Inserta/recupera cliente, guarda reclamo y devuelve el código de confirmación
export async function guardarReclamo(datos) {
  try {
    const connection = await pool.getConnection();

    // ¿Existe cliente por DNI?
    const [rows] = await connection.execute(
      'SELECT id FROM clientes WHERE dni = ?',
      [datos.documento]
    );

    let clienteId;
    if (rows.length > 0) {
      clienteId = rows[0].id;                    // ya existe
    } else {
      // crea cliente
      const [result] = await connection.execute(
        'INSERT INTO clientes (nombre, apellido, dni, telefono, email) VALUES (?, ?, ?, ?, ?)',
        [datos.nombre, datos.apellido, datos.documento, datos.telefono, datos.email]
      );
      clienteId = result.insertId;
    }

    const codigoConfirmacion = generarCodigo();   // código único

    // Inserta reclamo vinculado al cliente
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        datos.partes.join(', '),                 // array → texto
        datos.descripcionAccidente,
        codigoConfirmacion,
        'Ingresado'                              // estado inicial
      ]
    );

    connection.release();
    return codigoConfirmacion;
  } catch (error) {
    console.error('Error al guardar el reclamo:', error);
    throw error;
  }
}

// Envía email de confirmación con el código del reclamo
export async function enviarConfirmacion(email, codigoConfirmacion) {
  try {
    // Transporter SMTP (Gmail): usa App Password en EMAIL_PASS
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: false }, // tolera certs no verificados
    });

    const mailOptions = {
      from: `"AutoReclamo" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Confirmación de Reclamo - AutoReclamo',
      html: `
        <p>Gracias por presentar su reclamo en AutoReclamo.</p>
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

// Devuelve el estado por código de confirmación o null si no existe
export async function verificarReclamo(codigo) {
  try {
    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      'SELECT estado FROM reclamos WHERE codigo_confirmacion = ?',
      [codigo]
    );

    connection.release();

    return rows.length > 0 ? rows[0].estado : null;
  } catch (error) {
    console.error('Error al verificar el reclamo:', error);
    throw error;
  }
}

// ============================ Contacto ============================

// Guarda el mensaje de contacto en DB
export async function guardarMensajeContacto(datos) {
  try {
    const connection = await pool.getConnection();

    await connection.execute(
      `INSERT INTO mensajes_contacto (
          motivo_consulta,
          nombre,
          apellidos,
          correo,
          comentario
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        datos.motivoConsulta,
        datos.nombre,
        datos.apellidos,
        datos.correo,
        datos.comentario
      ]
    );

    connection.release();
    console.log('Mensaje de contacto guardado en la base de datos.');
  } catch (error) {
    console.error('Error al guardar el mensaje de contacto:', error);
    throw error;
  }
}

// Envía el contenido del formulario de contacto por email a soporte
export async function enviarCorreoContacto(datos) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    const mailOptions = {
      from: `"AutoReclamo" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // o un correo específico de soporte
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

// ============================ Estadísticas ============================

// Devuelve total de reclamos y conteo por estado (normalizado)
export async function obtenerEstadisticasReclamos() {
  const conn = await pool.getConnection();
  try {
    // total
    const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM reclamos');

    // por estado (agrupado)
    const [rows] = await conn.query(`
      SELECT estado, COUNT(*) AS cantidad
      FROM reclamos
      GROUP BY estado
    `);

    // mapa base (rellena 0 si falta)
    const estados = {
      'Ingresado': 0,
      'En revisión': 0,
      'Aprobación': 0,
      'Reclamación': 0,
      'Gestión de pago': 0,
      'Reclamo finalizado': 0,
    };
    for (const r of rows) {
      if (estados.hasOwnProperty(r.estado)) {
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

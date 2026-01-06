// ====================== app.mjs ======================
// App principal de AutoReclamo 

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import { body, param, validationResult } from 'express-validator';

import {
  guardarReclamo,
  enviarConfirmacion,
  verificarReclamo,
  guardarMensajeContacto,
  enviarCorreoContacto,
  obtenerEstadisticasReclamos
} from './funciones.mjs';

dotenv.config();

const app        = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Pool MySQL (conexiones)
const pool = mysql.createPool({
  host:              process.env.DB_HOST,
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD,
  database:          process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:   10,
});

// Middlewares globales (seguridad + CORS + body parsers)
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// Helper: devuelve 400 si hay errores de validación
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errores: errors.array() });
  }
  next();
}

// ——— API pública ———

// POST /reclamo -> valida datos, guarda reclamo y envía email de confirmación
app.post(
  '/reclamo',
  [
    body('nombre').trim().notEmpty(),
    body('apellido').trim().notEmpty(),
    body('documento').isNumeric().isLength({ min: 7, max: 8 }),
    body('telefono').isNumeric().isLength({ min: 8, max: 15 }),
    body('email').isEmail(),
    body('fechaChoque').isISO8601(),
    body('horaChoque').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('lugarChoque').trim().notEmpty(),
    body('provincia').trim().notEmpty(),
    body('localidad').trim().notEmpty(),
    body('patente').matches(/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/),
    body('aseguradora').trim().notEmpty(),
    body('nombreInvolucrado').trim().notEmpty(),
    body('apellidoInvolucrado').trim().notEmpty(),
    body('documentoInvolucrado').isNumeric().isLength({ min: 7, max: 8 }),
    body('aseguradoraInvolucrado').trim().notEmpty(),
    body('patenteInvolucrado').matches(/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/),
    body('partes').isArray({ min: 1 }),
    body('descripcionAccidente').trim().notEmpty(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const datos  = req.body;
      const codigo = await guardarReclamo(datos);           // inserta en DB y devuelve código
      await enviarConfirmacion(datos.email, codigo);        // envía email de confirmación
      res.json({ mensaje: 'Reclamo registrado. Código enviado.' });
    } catch (error) {
      console.error('Error al registrar reclamo:', error);
      res.status(500).json({ mensaje: 'Error al registrar reclamo.' });
    }
  }
);

// GET /seguimiento/:codigo -> devuelve estado del reclamo
app.get(
  '/seguimiento/:codigo',
  [
    param('codigo').isAlphanumeric().isLength({ min: 6, max: 6 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const estado = await verificarReclamo(req.params.codigo); // consulta en DB
      if (!estado) {
        return res.status(404).json({ mensaje: 'Reclamo no encontrado.' });
      }
      res.json({ estado });
    } catch (error) {
      console.error('Error al consultar reclamo:', error);
      res.status(500).json({ mensaje: 'Error al consultar reclamo.' });
    }
  }
);

// POST /contacto -> guarda mensaje y envía correo
app.post(
  '/contacto',
  [
    body('motivoConsulta').trim().notEmpty(),
    body('nombre').trim().isLength({ min: 2, max: 50 }),
    body('apellidos').trim().isLength({ min: 2, max: 50 }),
    body('correo').isEmail(),
    body('comentario').isLength({ min: 10, max: 500 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const datos = req.body;
      await guardarMensajeContacto(datos);  // persiste en DB
      await enviarCorreoContacto(datos);    // envía notificación/email
      res.json({ mensaje: 'Mensaje recibido.' });
    } catch (error) {
      console.error('Error al procesar contacto:', error);
      res.status(500).json({ mensaje: 'Error al procesar contacto.' });
    }
  }
);

// ——— Rutas de CLIENTES  ———

// GET /api/clientes -> lista todos
app.get('/api/clientes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clientes');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clientes/:id -> un cliente por ID
app.get('/api/clientes/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM clientes WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clientes/:id -> actualiza cliente
app.put('/api/clientes/:id', async (req, res) => {
  const { nombre, apellido, dni, telefono, email } = req.body;
  try {
    await pool.execute(
      `UPDATE clientes
         SET nombre = ?, apellido = ?, dni = ?, telefono = ?, email = ?
       WHERE id = ?`,
      [nombre, apellido, dni, telefono, email, req.params.id]
    );
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clientes/:id -> borra cliente y sus reclamos 
app.delete('/api/clientes/:id', async (req, res) => {
  const id = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM reclamos WHERE cliente_id = ?', [id]); 
    const [result] = await conn.execute('DELETE FROM clientes WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await conn.commit();
    res.sendStatus(204);
  } catch (err) {
    await conn.rollback();
    console.error('Error al eliminar cliente:', err);
    res.status(500).json({ error: 'Error al eliminar cliente: ' + err.message });
  } finally {
    conn.release();
  }
});

// GET /api/clientes/:id/reclamos -> lista reclamos del cliente
app.get('/api/clientes/:id/reclamos', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM reclamos WHERE cliente_id = ?',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar reclamos del cliente' });
  }
});

// ——— Rutas de RECLAMOS  ———

// GET /api/reclamos -> lista todos
app.get('/api/reclamos', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM reclamos');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reclamos/:id -> un reclamo por ID
app.get('/api/reclamos/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM reclamos WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reclamo no encontrado' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reclamos -> inserta reclamo 
app.post('/api/reclamos', async (req, res) => {
  const d = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO reclamos
         (cliente_id, fecha_incidente, hora_incidente, direccion, provincia, ciudad,
          patente_vehiculo, compania_seguro, partes_afectadas, descripcion_accidente,
          codigo_confirmacion, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.cliente_id, d.fecha_incidente, d.hora_incidente, d.direccion,
        d.provincia, d.ciudad, d.patente_vehiculo, d.compania_seguro,
        d.partes_afectadas, d.descripcion_accidente,
        d.codigo_confirmacion, d.estado
      ]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reclamos/:id -> actualiza campos del reclamo
app.put('/api/reclamos/:id', async (req, res) => {
  const d = req.body;
  try {
    const [result] = await pool.query(
      `UPDATE reclamos SET
         fecha_incidente        = ?,
         hora_incidente         = ?,
         direccion              = ?,
         provincia              = ?,
         ciudad                 = ?,
         patente_vehiculo       = ?,
         compania_seguro        = ?,
         partes_afectadas       = ?,
         descripcion_accidente  = ?,
         estado                 = ?,
         otro_nombre            = ?,
         otro_apellido          = ?,
         otro_dni               = ?,
         otro_patente           = ?,
         otro_compania_seguro   = ?
       WHERE id = ?`,
      [
        d.fecha_incidente,
        d.hora_incidente,
        d.direccion,
        d.provincia,
        d.ciudad,
        d.patente_vehiculo,
        d.compania_seguro,
        d.partes_afectadas,
        d.descripcion_accidente,
        d.estado,
        d.otro_nombre,
        d.otro_apellido,
        d.otro_dni,
        d.otro_patente,
        d.otro_compania_seguro,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Reclamo no encontrado' });
    }
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reclamos/:id -> elimina reclamo
app.delete('/api/reclamos/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM reclamos WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Reclamo no encontrado' });
    }
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ——— Comentarios de reclamos ———

// GET /api/reclamos/:id/comentarios -> lista comentarios (más reciente primero)
app.get('/api/reclamos/:id/comentarios', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, reclamo_id, autor, texto, creado_en
         FROM comentarios
        WHERE reclamo_id = ?
        ORDER BY creado_en DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al listar comentarios:', err);
    res.status(500).json({ error: 'Error al listar comentarios' });
  }
});

// POST /api/reclamos/:id/comentarios -> crea comentario en un reclamo
app.post(
  '/api/reclamos/:id/comentarios',
  [
    body('texto').trim().isLength({ min: 2, max: 1000 }),
    body('autor').optional().trim().isLength({ max: 100 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { texto, autor } = req.body;
      const [result] = await pool.execute(
        'INSERT INTO comentarios (reclamo_id, autor, texto) VALUES (?, ?, ?)',
        [req.params.id, autor || null, texto]
      );
      res.status(201).json({ id: result.insertId });
    } catch (err) {
      console.error('Error al crear comentario:', err);
      res.status(500).json({ error: 'Error al crear comentario' });
    }
  }
);

// ——— Estadísticas ———
// GET /api/estadisticas/reclamos -> devuelve métricas
app.get('/api/estadisticas/reclamos', async (req, res) => {
  try {
    const stats = await obtenerEstadisticasReclamos();
    res.json(stats);
  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({ error: 'No se pudieron obtener las estadísticas' });
  }
});

// Servir frontend estático (carpeta /frontend)
app.use(express.static(path.join(__dirname, '../frontend')));

// Inicio del servidor 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

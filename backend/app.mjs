// ====================== app.mjs ======================
// App principal de Siniestro Ya (Backend)

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mysql from 'mysql2/promise';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { body, param, validationResult } from 'express-validator';

import {
  guardarReclamo,
  enviarConfirmacion,
  verificarReclamo,
  guardarMensajeContacto,
  enviarCorreoContacto,
  obtenerEstadisticasReclamos,
  obtenerReclamoIdPorCodigo,
  guardarImagenesReclamo,
  obtenerImagenesReclamo,
  guardarConsentimientoPrivacidad,
} from './funciones.mjs';

dotenv.config();

const app        = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Pool MySQL (conexiones)
const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
});

// Middlewares globales
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin"}
}));

const allowedCorsOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8082,http://127.0.0.1:8082'
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Permite requests sin Origin (curl, healthchecks, Postman)
    if (!origin) return callback(null, true);
    if (allowedCorsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

const seguimientoLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_SEGUIMIENTO_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_SEGUIMIENTO_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensaje: 'Demasiadas consultas. Intenta nuevamente en unos minutos.' }
});

const imagenesCodigoLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_IMAGENES_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_IMAGENES_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.' }
});

const reclamoLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_RECLAMO_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_RECLAMO_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos de registrar reclamos. Intenta nuevamente en unos minutos.' }
});

const contactoLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_CONTACTO_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_CONTACTO_MAX || 8),
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensaje: 'Demasiados mensajes enviados. Intenta nuevamente en unos minutos.' }
});

const ADMIN_SEED_EMAIL = String(process.env.ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();
const ADMIN_SEED_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_SEED_ROLE = String(process.env.ADMIN_ROLE || 'superadmin')
  .trim()
  .toLowerCase() || 'superadmin';

if ((ADMIN_SEED_EMAIL && !ADMIN_SEED_PASSWORD) || (!ADMIN_SEED_EMAIL && ADMIN_SEED_PASSWORD)) {
  throw new Error('[config] Define ADMIN_EMAIL y ADMIN_PASSWORD juntos (o ninguno) en backend/.env.');
}
if (ADMIN_SEED_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_SEED_EMAIL)) {
  throw new Error('[config] ADMIN_EMAIL no tiene un formato de email valido.');
}
if (ADMIN_SEED_PASSWORD && ADMIN_SEED_PASSWORD.length < 10) {
  throw new Error('[config] ADMIN_PASSWORD debe tener al menos 10 caracteres.');
}

const ADMIN_TOKEN_TTL_MS = Number(process.env.ADMIN_TOKEN_TTL_MS || 8 * 60 * 60 * 1000);
const ADMIN_COOKIE_NAME = String(process.env.ADMIN_COOKIE_NAME || 'admin_session').trim() || 'admin_session';
const ADMIN_COOKIE_DOMAIN = String(process.env.ADMIN_COOKIE_DOMAIN || '').trim();
const ADMIN_COOKIE_SECURE = String(
  process.env.ADMIN_COOKIE_SECURE || (process.env.NODE_ENV === 'production' ? 'true' : 'false')
).toLowerCase() === 'true';
const ADMIN_COOKIE_SAMESITE = (() => {
  const raw = String(process.env.ADMIN_COOKIE_SAMESITE || 'lax').toLowerCase();
  if (raw === 'strict' || raw === 'none') return raw;
  return 'lax';
})();
if (ADMIN_COOKIE_SAMESITE === 'none' && !ADMIN_COOKIE_SECURE) {
  throw new Error('[config] ADMIN_COOKIE_SAMESITE=none requiere ADMIN_COOKIE_SECURE=true.');
}
const ADMIN_SESSION_CLEANUP_EVERY_MS = Number(
  process.env.ADMIN_SESSION_CLEANUP_EVERY_MS || 5 * 60 * 1000
);
let lastAdminSessionCleanupAt = 0;

const adminLoginLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_ADMIN_LOGIN_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Intenta de nuevo en unos minutos.' }
});

// OJO: JSON solo para requests JSON.
// (multipart lo maneja multer)
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ limit: '50kb', extended: true }));

// ====================== Uploads (imagenes) ======================
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_MB = 5;
const MAX_FILE_SIZE = MAX_MB * 1024 * 1024;
const MAX_FILES_PER_RECLAMO = 20;
const SIGNED_IMAGE_TTL_SECONDS = Number(process.env.SIGNED_IMAGE_TTL_SECONDS || 900);
const SIGNED_IMAGE_SECRET = String(process.env.SIGNED_IMAGE_SECRET || '').trim();
if (!SIGNED_IMAGE_SECRET) {
  throw new Error('[config] Define SIGNED_IMAGE_SECRET en backend/.env.');
}

// Permitidos: jpg/jpeg/png/heic/heif
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif'
]);
const HEIF_FTYP_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

let sharpLoaderPromise = null;
async function getSharp() {
  if (!sharpLoaderPromise) {
    sharpLoaderPromise = import('sharp')
      .then((mod) => mod.default || mod)
      .catch(() => {
        console.warn('[uploads] sharp no esta disponible. Se mantiene validacion por magic bytes sin re-encode.');
        return null;
      });
  }
  return sharpLoaderPromise;
}

function makeHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function detectImageByMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { format: 'jpeg', ext: '.jpg', mimetype: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { format: 'png', ext: '.png', mimetype: 'image/png' };
  }

  // HEIC/HEIF: ISO BMFF ftyp box + brand
  if (buffer.length >= 12) {
    const boxType = buffer.toString('ascii', 4, 8).toLowerCase();
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (boxType === 'ftyp' && HEIF_FTYP_BRANDS.has(brand)) {
      const isHeif = brand === 'mif1' || brand === 'msf1';
      return {
        format: isHeif ? 'heif' : 'heic',
        ext: isHeif ? '.heif' : '.heic',
        mimetype: isHeif ? 'image/heif' : 'image/heic'
      };
    }
  }

  return null;
}

async function sanitizeImageForStorage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw makeHttpError(400, 'Imagen invalida o vacia.');
  }

  const detected = detectImageByMagic(file.buffer);
  if (!detected) {
    throw makeHttpError(400, 'El archivo no es una imagen valida (JPG/PNG/HEIC/HEIF).');
  }

  const sharp = await getSharp();
  if (!sharp) {
    // Fallback compatible si sharp no esta instalado: mantiene el archivo detectado por magic bytes.
    return {
      buffer: file.buffer,
      ext: detected.ext,
      mimetype: detected.mimetype
    };
  }

  try {
    const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();

    if (detected.format === 'png') {
      const out = await image.png({ compressionLevel: 9 }).toBuffer();
      return { buffer: out, ext: '.png', mimetype: 'image/png' };
    }

    const out = await image.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    return { buffer: out, ext: '.jpg', mimetype: 'image/jpeg' };
  } catch {
    throw makeHttpError(400, 'No se pudo procesar la imagen. Usa archivos JPG o PNG validos.');
  }
}

async function persistUploadedImages({ codigo, reclamoId, files, tags = [] }) {
  if (!Array.isArray(files) || files.length === 0) return 0;

  const codigoUp = String(codigo || '').toUpperCase();
  const dir = path.join(UPLOAD_DIR, 'reclamos', codigoUp);
  ensureDir(dir);

  const diskFiles = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sanitized = await sanitizeImageForStorage(file);
    const filename = crypto.randomBytes(16).toString('hex') + sanitized.ext;
    const fullPath = path.join(dir, filename);

    fs.writeFileSync(fullPath, sanitized.buffer);

    diskFiles.push({
      filename,
      originalname: file.originalname,
      mimetype: sanitized.mimetype,
      size: sanitized.buffer.length
    });
  }

  await guardarImagenesReclamo({
    reclamoId,
    files: diskFiles,
    codigo: codigoUp,
    tags
  });

  return diskFiles.length;
}

function extractFilenameFromRaw(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      raw = new URL(raw).pathname || '';
    } catch {
      // Si URL no parsea, seguimos con el valor original
    }
  }

  if (raw.includes('/')) raw = raw.split('/').pop() || raw;
  raw = raw.split('?')[0].split('#')[0];

  return path.basename(raw).trim();
}

function buildImageAccessSignature({ imageId, action, exp }) {
  return crypto
    .createHmac('sha256', SIGNED_IMAGE_SECRET)
    .update(`${imageId}:${action}:${exp}`)
    .digest('hex');
}

function safeSignatureCompare(a, b) {
  const aBuf = Buffer.from(String(a || ''));
  const bBuf = Buffer.from(String(b || ''));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function buildSignedImagePath(imageId, action) {
  const exp = Math.floor(Date.now() / 1000) + SIGNED_IMAGE_TTL_SECONDS;
  const sig = buildImageAccessSignature({ imageId, action, exp });
  return `/api/imagenes/${encodeURIComponent(imageId)}/${action}?exp=${exp}&sig=${sig}`;
}

function validateSignedImageQuery(req, action) {
  const imageId = Number(req.params.id);
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');

  if (!Number.isInteger(imageId) || imageId <= 0) {
    return { ok: false, status: 400, error: 'ID de imagen invalido.' };
  }
  if (!Number.isInteger(exp)) {
    return { ok: false, status: 400, error: 'Parametro "exp" invalido.' };
  }
  if (!sig) {
    return { ok: false, status: 400, error: 'Falta firma de acceso.' };
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 403, error: 'Enlace expirado.' };
  }

  const expected = buildImageAccessSignature({ imageId, action, exp });
  if (!safeSignatureCompare(sig, expected)) {
    return { ok: false, status: 403, error: 'Firma invalida.' };
  }

  return { ok: true, imageId };
}

async function obtenerRegistroImagenPorId(imageId) {
  const [rows] = await pool.query(
    `SELECT
       ri.id,
       ri.reclamo_id,
       ri.filename,
       ri.originalname,
       ri.mimetype,
       ri.url,
       r.codigo_confirmacion
     FROM reclamo_imagenes ri
     INNER JOIN reclamos r ON r.id = ri.reclamo_id
     WHERE ri.id = ?
     LIMIT 1`,
    [imageId]
  );

  return rows[0] || null;
}

function resolverPathImagen(row) {
  const codigo = String(row?.codigo_confirmacion || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const filename = extractFilenameFromRaw(row?.filename || row?.url || '');

  if (!codigo || !filename) return null;

  return {
    codigo,
    filename,
    fullPath: path.join(UPLOAD_DIR, 'reclamos', codigo, filename)
  };
}

// 1) Upload para endpoint /reclamo/:codigo/imagenes (MEMORY, saneado antes de guardar)
const uploadByCodigo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_RECLAMO },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Formato no compatible. Usa JPG/JPEG, PNG o HEIC/HEIF.'));
    }
    cb(null, true);
  }
});
// 2) Upload para POST /reclamo (MEMORY, porque el codigo se genera dentro de guardarReclamo)
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_RECLAMO },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Formato no compatible. Usa JPG/JPEG, PNG o HEIC/HEIF.'));
    }
    cb(null, true);
  }
});

// Helper: 400 si hay errores de validaciaciónes
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errores: errors.array() });
  next();
}

// Detectar multipart
function isMultipart(req) {
  const ct = String(req.headers['content-type'] || '');
  return ct.includes('multipart/form-data');
}

function getRequestIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function secureStringEquals(a, b) {
  const aBuf = Buffer.from(String(a ?? ''), 'utf8');
  const bBuf = Buffer.from(String(b ?? ''), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function hashAdminPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const out = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt}$${out.toString('hex')}`;
}

function hashAdminSessionToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''), 'utf8')
    .digest('hex');
}

function isScryptPasswordHash(value) {
  return typeof value === 'string' && /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/i.test(value);
}

function verifyAdminPassword(password, storedValue) {
  if (!storedValue) return false;

  // Compatibilidad temporal por si hubiera registros viejos en texto plano.
  if (!isScryptPasswordHash(storedValue)) {
    return secureStringEquals(password, storedValue);
  }

  const [, salt, hashHex] = String(storedValue).split('$');
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

async function ensureAdminTableAndSeed() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'admin',
      activo TINYINT(1) NOT NULL DEFAULT 1,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      token_hash CHAR(64) NOT NULL UNIQUE,
      admin_id INT NOT NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(512) NULL,
      expires_at DATETIME NOT NULL,
      revoked TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_admin_sessions_admin_id (admin_id),
      INDEX idx_admin_sessions_expires_at (expires_at),
      INDEX idx_admin_sessions_revoked (revoked),
      CONSTRAINT fk_admin_sessions_admin
        FOREIGN KEY (admin_id) REFERENCES admins(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  if (!ADMIN_SEED_EMAIL || !ADMIN_SEED_PASSWORD) {
    console.warn('[admin-auth] Sin ADMIN_EMAIL/ADMIN_PASSWORD en .env. Se usa el admin ya cargado en DB.');
    return;
  }

  const hash = hashAdminPassword(ADMIN_SEED_PASSWORD);
  await pool.execute(
    `INSERT INTO admins (email, password_hash, role, activo)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role = VALUES(role),
       activo = 1`,
    [ADMIN_SEED_EMAIL, hash, ADMIN_SEED_ROLE]
  );
}

async function getAdminByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT id, email, password_hash, role, activo
       FROM admins
      WHERE email = ?
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function updateAdminPasswordHashById(adminId, plainPassword) {
  const newHash = hashAdminPassword(plainPassword);
  await pool.execute(
    'UPDATE admins SET password_hash = ? WHERE id = ?',
    [newHash, adminId]
  );
}

function getAdminTokenTtlMs() {
  return Number.isFinite(ADMIN_TOKEN_TTL_MS) && ADMIN_TOKEN_TTL_MS > 0
    ? ADMIN_TOKEN_TTL_MS
    : 8 * 60 * 60 * 1000;
}

function readBearerToken(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  if (!raw) return '';

  const pairs = raw.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    const value = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return '';
}

function readAdminToken(req) {
  const fromCookie = readCookie(req, ADMIN_COOKIE_NAME);
  if (fromCookie) return fromCookie;
  return readBearerToken(req);
}

function getAdminCookieOptions(maxAgeMs = getAdminTokenTtlMs()) {
  const opts = {
    httpOnly: true,
    secure: ADMIN_COOKIE_SECURE,
    sameSite: ADMIN_COOKIE_SAMESITE,
    path: '/',
    maxAge: maxAgeMs
  };
  if (ADMIN_COOKIE_DOMAIN) opts.domain = ADMIN_COOKIE_DOMAIN;
  return opts;
}

function setAdminSessionCookie(res, token) {
  res.cookie(ADMIN_COOKIE_NAME, token, getAdminCookieOptions());
}

function clearAdminSessionCookie(res) {
  const opts = {
    httpOnly: true,
    secure: ADMIN_COOKIE_SECURE,
    sameSite: ADMIN_COOKIE_SAMESITE,
    path: '/'
  };
  if (ADMIN_COOKIE_DOMAIN) opts.domain = ADMIN_COOKIE_DOMAIN;
  res.clearCookie(ADMIN_COOKIE_NAME, opts);
}

async function cleanupExpiredAdminSessions() {
  const everyMs = Number.isFinite(ADMIN_SESSION_CLEANUP_EVERY_MS) && ADMIN_SESSION_CLEANUP_EVERY_MS > 0
    ? ADMIN_SESSION_CLEANUP_EVERY_MS
    : 5 * 60 * 1000;
  const now = Date.now();
  if (now - lastAdminSessionCleanupAt < everyMs) return;
  lastAdminSessionCleanupAt = now;

  try {
    await pool.execute(`
      DELETE FROM admin_sessions
      WHERE expires_at <= NOW()
         OR (revoked = 1 AND last_seen <= DATE_SUB(NOW(), INTERVAL 7 DAY))
    `);
  } catch (err) {
    console.error('Error limpiando sesiones admin expiradas:', err);
  }
}

async function createAdminSession(admin, req) {
  await cleanupExpiredAdminSessions();

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashAdminSessionToken(token);
  const expiresAt = new Date(Date.now() + getAdminTokenTtlMs());
  const ip = getRequestIp(req);
  const userAgent = String(req?.get('user-agent') || '').slice(0, 512) || null;

  await pool.execute(
    `INSERT INTO admin_sessions
      (token_hash, admin_id, ip, user_agent, expires_at, revoked)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [tokenHash, admin.id, ip || null, userAgent, expiresAt]
  );

  return token;
}

async function getAdminSession(token) {
  await cleanupExpiredAdminSessions();
  if (!token) return null;

  const tokenHash = hashAdminSessionToken(token);
  const [rows] = await pool.execute(
    `SELECT s.admin_id, a.email, a.role
       FROM admin_sessions s
       INNER JOIN admins a ON a.id = s.admin_id
      WHERE s.token_hash = ?
        AND s.revoked = 0
        AND s.expires_at > NOW()
        AND a.activo = 1
      LIMIT 1`,
    [tokenHash]
  );

  if (!rows.length) return null;
  const row = rows[0];
  const nextExpiresAt = new Date(Date.now() + getAdminTokenTtlMs());

  const [updateResult] = await pool.execute(
    `UPDATE admin_sessions
        SET expires_at = ?, last_seen = CURRENT_TIMESTAMP
      WHERE token_hash = ? AND revoked = 0`,
    [nextExpiresAt, tokenHash]
  );

  if (!updateResult || Number(updateResult.affectedRows || 0) === 0) return null;

  return {
    adminId: row.admin_id,
    email: row.email,
    role: row.role || 'admin',
    expiresAt: nextExpiresAt.getTime()
  };
}

async function revokeAdminSession(token) {
  if (!token) return;
  const tokenHash = hashAdminSessionToken(token);
  await pool.execute(
    `UPDATE admin_sessions
        SET revoked = 1, last_seen = CURRENT_TIMESTAMP
      WHERE token_hash = ?`,
    [tokenHash]
  );
}

async function requireAdminAuth(req, res, next) {
  try {
    const token = readAdminToken(req);
    const session = await getAdminSession(token);
    if (!session) return res.status(401).json({ error: 'No autorizado.' });

    setAdminSessionCookie(res, token);
    req.admin = session;
    req.adminToken = token;
    return next();
  } catch (err) {
    console.error('Error validando sesion admin:', err);
    return res.status(500).json({ error: 'No se pudo validar sesion.' });
  }
}
function isPublicApiRoute(req) {
  if (req.method === 'POST' && req.path === '/admin/login') return true;
  return false;
}

// Middleware: si viene multipart, parsea req.body.data (JSON) y lo pone en req.body
function parseMultipartData(req, res, next) {
  if (!isMultipart(req)) return next();

  try {
    if (!req.body || typeof req.body.data !== 'string') {
      return res.status(400).json({ mensaje: 'Falta campo "data" en FormData.' });
    }
    const parsed = JSON.parse(req.body.data);

    // Reemplazamos req.body con el JSON del formulario
    req.body = parsed;

    
    next();
  } catch (e) {
    return res.status(400).json({ mensaje: 'El campo "data" no es JSON válido.' });
  }
}

// Wrapper: ejecutar multer SOLO si es multipart
function maybeUploadReclamo(req, res, next) {
  if (!isMultipart(req)) return next();
  uploadMemory.array('imagenes', MAX_FILES_PER_RECLAMO)(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}

// ========== VALIDADORES (para el JSON ya normalizado en req.body) ==========
const reclamoValidators = [
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
  body('nombreInvolucrado').optional({ checkFalsy: true }).trim(),
  body('apellidoInvolucrado').optional({ checkFalsy: true }).trim(),
  body('documentoInvolucrado').optional({ checkFalsy: true }).isNumeric().isLength({ min: 7, max: 8 }),
  body('aseguradoraInvolucrado').optional({ checkFalsy: true }).trim(),
  body('patenteInvolucrado')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(v => String(v).toUpperCase())
    .matches(/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/),
  body('partes').isArray({ min: 1 }),
  body('descripcionAccidente').trim().notEmpty(),
  body('aceptaPrivacidad')
    .custom(v => v === true || v === 'true')
    .withMessage('Debes aceptar las Politicas de Privacidad para continuar.'),
  handleValidationErrors
];

// ====================== API pública ======================

// POST /reclamo
// - JSON: como siempre
// - multipart: FormData con "data" (JSON) + "imagenes" (files) + "tags" (fields)
app.post(
  '/reclamo',
  reclamoLimiter,
  maybeUploadReclamo,
  // Capturamos tags ANTES de reemplazar req.body
  (req, res, next) => {
    if (isMultipart(req)) {
      // multer puso fields (tags) en req.body
      // guardamos una copia
      req._tags = req.body?.tags ?? null;
    }
    next();
  },
  parseMultipartData,
  ...reclamoValidators,
  async (req, res) => {
    try {
      const datos = req.body;

      // 1) Guardar reclamo (genera codigo)
      const codigo = await guardarReclamo(datos);
      const codigoUp = String(codigo).toUpperCase();

      // 2) Guardar aceptacion de privacidad (respaldo legal)
      const reclamoId = await obtenerReclamoIdPorCodigo(codigoUp);
      if (!reclamoId) {
        throw new Error('No se pudo recuperar el ID del reclamo para guardar el consentimiento.');
      }

      await guardarConsentimientoPrivacidad({
        reclamoId,
        ip: getRequestIp(req),
        userAgent: req.get('user-agent') || null
      });

      // 3) Enviar email confirmacion
      await enviarConfirmacion(datos.email, codigo);

      // 4) Si viene multipart con imagenes, guardarlas en disco + DB
      const files = req.files || [];
      if (isMultipart(req) && files.length > 0) {
        // tags: puede venir string o array
        let tags = req._tags;
        if (typeof tags === 'string') tags = [tags];
        if (!Array.isArray(tags)) tags = [];

        await persistUploadedImages({
          codigo: codigoUp,
          reclamoId,
          files,
          tags
        });
      }

      // RESPUESTA
      res.json({ mensaje: 'Reclamo registrado. Código enviado.', codigo });

    } catch (error) {
      if (Number(error?.status) === 400) {
        return res.status(400).json({ mensaje: error.message || 'Error en imagenes adjuntas.' });
      }
      console.error('Error al registrar reclamo:', error);
      res.status(500).json({ mensaje: 'Error al registrar reclamo.' });
    }
  }
);

// GET /seguimiento/:codigo
app.get(
  '/seguimiento/:codigo',
  seguimientoLimiter,
  [
    param('codigo')
      .trim()
      .customSanitizer(v => String(v).toUpperCase().replace(/\s+/g, ''))
      .isAlphanumeric()
      .isLength({ min: 6, max: 6 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const codigo = req.params.codigo; 
      const estado = await verificarReclamo(codigo);

      if (!estado) {
        return res.status(404).json({ mensaje: 'No se pudo validar el codigo. Verifica e intenta nuevamente.' });
      }
      res.json({ estado });
    } catch (error) {
      console.error('Error al consultar reclamo:', error);
      res.status(500).json({ mensaje: 'Error al consultar reclamo.' });
    }
  }
);

// POST /contacto
app.post(
  '/contacto',
  contactoLimiter,
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
      await guardarMensajeContacto(datos);
      await enviarCorreoContacto(datos);
      res.json({ mensaje: 'Mensaje recibido.' });
    } catch (error) {
      console.error('Error al procesar contacto:', error);
      res.status(500).json({ mensaje: 'Error al procesar contacto.' });
    }
  }
);

// ====================== IMAGENES PÚBLICAS  ======================

// POST /reclamo/:codigo/imagenes
// FormData: key "imagenes" + opcional fields "tags"
app.post(
  '/reclamo/:codigo/imagenes',
  imagenesCodigoLimiter,
  [
    param('codigo').isAlphanumeric().isLength({ min: 6, max: 6 }),
    handleValidationErrors
  ],
  uploadByCodigo.array('imagenes', MAX_FILES_PER_RECLAMO),
  async (req, res) => {
    try {
      const codigo = String(req.params.codigo).toUpperCase();
      const reclamoId = await obtenerReclamoIdPorCodigo(codigo);

      if (!reclamoId) {
        return res.status(404).json({ error: 'No se pudo procesar la solicitud.' });
      }

      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'No se recibieron imágenes.' });

      // tags opcionales
      let tags = req.body?.tags ?? [];
      if (typeof tags === 'string') tags = [tags];
      if (!Array.isArray(tags)) tags = [];

      const cantidad = await persistUploadedImages({ codigo, reclamoId, files, tags });

      res.status(201).json({
        mensaje: 'Imagenes cargadas',
        cantidad
      });
    } catch (err) {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `La imagen supera ${MAX_MB}MB. Reduci el tamaño o elegi otra.` });
      }
      if (Number(err?.status) === 400) {
        return res.status(400).json({ error: err.message || 'Error en imagenes adjuntas.' });
      }
      console.error('Error al subir imágenes:', err);
      res.status(500).json({ error: 'Error al subir imágenes.' });
    }
  }
);

// GET /reclamo/:codigo/imagenes
app.get(
  '/reclamo/:codigo/imagenes',
  imagenesCodigoLimiter,
  [
    param('codigo').isAlphanumeric().isLength({ min: 6, max: 6 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const codigo = String(req.params.codigo).toUpperCase();
      const reclamoId = await obtenerReclamoIdPorCodigo(codigo);
      if (!reclamoId) return res.status(404).json({ error: 'No se pudo procesar la solicitud.' });

      const imgs = await obtenerImagenesReclamo(reclamoId);
      res.json(imgs);
    } catch (err) {
      console.error('Error al listar imágenes:', err);
      res.status(500).json({ error: 'Error al listar imágenes' });
    }
  }
);

app.post(
  '/api/admin/login',
  adminLoginLimiter,
  [
    body('email').isEmail(),
    body('password').isString().isLength({ min: 1, max: 200 }),
    handleValidationErrors
  ],
  async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    try {
      const admin = await getAdminByEmail(email);
      if (!admin || Number(admin.activo) !== 1) {
        return res.status(401).json({ error: 'Credenciales invalidas.' });
      }

      const passOk = verifyAdminPassword(password, admin.password_hash);
      if (!passOk) {
        return res.status(401).json({ error: 'Credenciales invalidas.' });
      }

      // Si estaba en formato legacy, actualiza al formato hasheado actual.
      if (!isScryptPasswordHash(admin.password_hash)) {
        await updateAdminPasswordHashById(admin.id, password);
      }

      const token = await createAdminSession(admin, req);
      setAdminSessionCookie(res, token);

      return res.json({
        email: admin.email,
        role: admin.role || 'admin',
        expires_in_ms: getAdminTokenTtlMs()
      });
    } catch (err) {
      console.error('Error en login admin:', err);
      return res.status(500).json({ error: 'No se pudo iniciar sesion.' });
    }
  }
);

app.get('/api/admin/me', requireAdminAuth, (req, res) => {
  res.json({
    id: req.admin.adminId,
    email: req.admin.email,
    role: req.admin.role || 'admin'
  });
});

app.post('/api/admin/logout', requireAdminAuth, async (req, res) => {
  try {
    await revokeAdminSession(req.adminToken);
  } catch (err) {
    console.error('Error cerrando sesion admin:', err);
  }
  clearAdminSessionCookie(res);
  res.sendStatus(204);
});

app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (isPublicApiRoute(req)) return next();
  return requireAdminAuth(req, res, next);
});

// ====================== Admin API (clientes, reclamos, comentarios, stats) ======================


app.get('/api/clientes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clientes');
    res.json(rows);
  } catch (err) {
    console.error('Error al listar clientes:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get(
  '/api/clientes/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('ID invalido.').toInt(),
    handleValidationErrors
  ],
  async (req, res) => {
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
    console.error('Error al obtener cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put(
  '/api/clientes/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('ID invalido.').toInt(),
    body('nombre').trim().isLength({ min: 2, max: 100 }).withMessage('Nombre invalido.'),
    body('apellido').trim().isLength({ min: 2, max: 100 }).withMessage('Apellido invalido.'),
    body('dni').trim().matches(/^\d{7,8}$/).withMessage('DNI invalido.'),
    body('telefono')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^\d{8,15}$/)
      .withMessage('Telefono invalido.'),
    body('email').isEmail().withMessage('Email invalido.').normalizeEmail(),
    handleValidationErrors
  ],
  async (req, res) => {
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
    console.error('Error al actualizar cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.delete(
  '/api/clientes/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('ID invalido.').toInt(),
    handleValidationErrors
  ],
  async (req, res) => {
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
    res.status(500).json({ error: 'Error interno del servidor.' });
  } finally {
    conn.release();
  }
});

app.get(
  '/api/clientes/:id/reclamos',
  [
    param('id').isInt({ min: 1 }).withMessage('ID invalido.').toInt(),
    handleValidationErrors
  ],
  async (req, res) => {
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

const ESTADO_FILTRO_VARIANTES = {
  'ingresado': ['Ingresado', 'ingresado'],
  'en revision': ['En revision', 'En revisi\u00f3n', 'en revision', 'en revisi\u00f3n'],
  'aprobacion': ['Aprobacion', 'Aprobaci\u00f3n', 'aprobacion', 'aprobaci\u00f3n'],
  'reclamacion': ['Reclamacion', 'Reclamaci\u00f3n', 'reclamacion', 'reclamaci\u00f3n'],
  'gestion de pago': ['Gestion de pago', 'Gesti\u00f3n de pago', 'gestion de pago', 'gesti\u00f3n de pago'],
  'reclamo finalizado': ['Reclamo finalizado', 'reclamo finalizado']
};

function normalizarEstadoFiltro(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
}

const ADMIN_ESTADOS_VALIDOS = new Set([
  'ingresado',
  'en revision',
  'aprobacion',
  'reclamacion',
  'gestion de pago',
  'reclamo finalizado'
]);

const PATENTE_REGEX = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const adminIdParamValidator = param('id')
  .isInt({ min: 1 })
  .withMessage('ID invalido.')
  .toInt();

const adminReclamoCreateValidators = [
  body('cliente_id').isInt({ min: 1 }).withMessage('Cliente invalido.').toInt(),
  body('fecha_incidente').isISO8601().withMessage('Fecha invalida.'),
  body('hora_incidente').matches(HORA_REGEX).withMessage('Hora invalida.'),
  body('direccion').trim().isLength({ min: 2, max: 180 }).withMessage('Direccion invalida.'),
  body('provincia').trim().isLength({ min: 2, max: 80 }).withMessage('Provincia invalida.'),
  body('ciudad').trim().isLength({ min: 2, max: 80 }).withMessage('Ciudad invalida.'),
  body('patente_vehiculo')
    .trim()
    .customSanitizer((v) => String(v).toUpperCase())
    .matches(PATENTE_REGEX)
    .withMessage('Patente invalida.'),
  body('compania_seguro').trim().isLength({ min: 2, max: 100 }).withMessage('Aseguradora invalida.'),
  body('partes_afectadas').trim().isLength({ min: 2, max: 160 }).withMessage('Partes afectadas invalidas.'),
  body('descripcion_accidente')
    .trim()
    .isLength({ min: 2, max: 2000 })
    .withMessage('Descripcion invalida.'),
  body('codigo_confirmacion')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[A-Z0-9]{6,20}$/i)
    .withMessage('Codigo de confirmacion invalido.'),
  body('estado')
    .trim()
    .custom((v) => ADMIN_ESTADOS_VALIDOS.has(normalizarEstadoFiltro(v)))
    .withMessage('Estado invalido.'),
  handleValidationErrors
];

const adminReclamoUpdateValidators = [
  adminIdParamValidator,
  body('fecha_incidente').isISO8601().withMessage('Fecha invalida.'),
  body('hora_incidente').matches(HORA_REGEX).withMessage('Hora invalida.'),
  body('direccion').trim().isLength({ min: 2, max: 180 }).withMessage('Direccion invalida.'),
  body('provincia').trim().isLength({ min: 2, max: 80 }).withMessage('Provincia invalida.'),
  body('ciudad').trim().isLength({ min: 2, max: 80 }).withMessage('Ciudad invalida.'),
  body('patente_vehiculo')
    .trim()
    .customSanitizer((v) => String(v).toUpperCase())
    .matches(PATENTE_REGEX)
    .withMessage('Patente invalida.'),
  body('compania_seguro').trim().isLength({ min: 2, max: 100 }).withMessage('Aseguradora invalida.'),
  body('partes_afectadas').trim().isLength({ min: 2, max: 160 }).withMessage('Partes afectadas invalidas.'),
  body('descripcion_accidente')
    .trim()
    .isLength({ min: 2, max: 2000 })
    .withMessage('Descripcion invalida.'),
  body('estado')
    .trim()
    .custom((v) => ADMIN_ESTADOS_VALIDOS.has(normalizarEstadoFiltro(v)))
    .withMessage('Estado invalido.'),
  body('otro_nombre').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Nombre involucrado invalido.'),
  body('otro_apellido').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Apellido involucrado invalido.'),
  body('otro_dni')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{7,8}$/)
    .withMessage('DNI involucrado invalido.'),
  body('otro_patente')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer((v) => String(v).toUpperCase())
    .matches(PATENTE_REGEX)
    .withMessage('Patente involucrado invalida.'),
  body('otro_compania_seguro')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Aseguradora involucrado invalida.'),
  handleValidationErrors
];

app.get('/api/reclamos', async (req, res) => {
  try {
    const wantsPaginated = ['page', 'limit', 'estado', 'periodo', 'period'].some(
      (k) => req.query[k] !== undefined
    );

    if (!wantsPaginated) {
      const [rows] = await pool.query('SELECT * FROM reclamos');
      return res.json(rows);
    }

    const pageRaw = Number.parseInt(String(req.query.page || '1'), 10);
    const limitRaw = Number.parseInt(String(req.query.limit || '20'), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, 100)
      : 20;

    const where = [];
    const params = [];

    const estadoRaw = String(req.query.estado || '').trim();
    if (estadoRaw) {
      const estadoKey = normalizarEstadoFiltro(estadoRaw);
      const variants = ESTADO_FILTRO_VARIANTES[estadoKey];
      if (!variants) {
        return res.status(400).json({ error: 'Filtro de estado invalido.' });
      }
      const variantsUnique = Array.from(new Set(variants));
      const placeholders = variantsUnique.map(() => '?').join(', ');
      where.push(`estado IN (${placeholders})`);
      params.push(...variantsUnique);
    }

    const periodo = String(req.query.periodo || req.query.period || '').trim();
    if (periodo) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
        return res.status(400).json({ error: 'Filtro de periodo invalido.' });
      }
      where.push("DATE_FORMAT(fecha_incidente, '%Y-%m') = ?");
      params.push(periodo);
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM reclamos${whereSql}`,
      params
    );

    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;

    const [rows] = await pool.query(
      `SELECT * FROM reclamos${whereSql}
       ORDER BY fecha_incidente DESC, hora_incidente DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      items: rows,
      page: safePage,
      limit,
      total,
      totalPages
    });
  } catch (err) {
    console.error('Error al listar reclamos:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/reclamos/:id', [adminIdParamValidator, handleValidationErrors], async (req, res) => {
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
    console.error('Error al obtener reclamo:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/reclamos', adminReclamoCreateValidators, async (req, res) => {
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
    console.error('Error al crear reclamo (admin):', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/reclamos/:id', adminReclamoUpdateValidators, async (req, res) => {
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
    console.error('Error al actualizar reclamo:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.delete('/api/reclamos/:id', [adminIdParamValidator, handleValidationErrors], async (req, res) => {
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
    console.error('Error al eliminar reclamo:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/reclamos/:id/comentarios', [adminIdParamValidator, handleValidationErrors], async (req, res) => {
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

app.post(
  '/api/reclamos/:id/comentarios',
  [
    adminIdParamValidator,
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

// ====================== Admin API -  ======================

// GET /api/reclamos/:id/imagenes
// Devuelve lista de imagenes con URL firmadas (temporales)
app.get('/api/reclamos/:id/imagenes', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalido' });

    const imgs = await obtenerImagenesReclamo(id);

    const out = (Array.isArray(imgs) ? imgs : [])
      .map((it) => {
        const imageId = Number(it.id);
        if (!Number.isInteger(imageId) || imageId <= 0) return null;

        const filename = extractFilenameFromRaw(
          it.filename || it.nombre_archivo || it.archivo || it.path || it.url || ''
        );

        return {
          id: imageId,
          filename: filename || `imagen_${imageId}`,
          tag: it.tag || it.tipo || it.etiqueta || null,
          mimetype: it.mimetype || it.tipo_mime || null,
          size: it.size_bytes || it.size || it.tamano || null,
          view_url: buildSignedImagePath(imageId, 'ver'),
          download_url: buildSignedImagePath(imageId, 'descargar')
        };
      })
      .filter(Boolean);

    res.json(out);
  } catch (err) {
    console.error('Error listando imagenes admin:', err);
    res.status(500).json({ error: 'Error listando imagenes' });
  }
});

async function servirImagenFirmada(req, res, action) {
  const check = validateSignedImageQuery(req, action);
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  const row = await obtenerRegistroImagenPorId(check.imageId);
  if (!row) return res.status(404).json({ error: 'Imagen no encontrada.' });

  const resolved = resolverPathImagen(row);
  if (!resolved) return res.status(404).json({ error: 'Archivo no disponible.' });
  if (!fs.existsSync(resolved.fullPath)) {
    return res.status(404).json({ error: 'Archivo no encontrado en disco.' });
  }

  if (action === 'descargar') {
    const downloadName = path.basename(String(row.originalname || resolved.filename || `imagen_${row.id}`));
    return res.download(resolved.fullPath, downloadName);
  }

  if (row.mimetype) res.type(row.mimetype);
  return res.sendFile(resolved.fullPath);
}

app.get('/api/imagenes/:id/ver', async (req, res) => {
  try {
    await servirImagenFirmada(req, res, 'ver');
  } catch (err) {
    console.error('Error sirviendo imagen (ver):', err);
    res.status(500).json({ error: 'Error al obtener imagen.' });
  }
});

app.get('/api/imagenes/:id/descargar', async (req, res) => {
  try {
    await servirImagenFirmada(req, res, 'descargar');
  } catch (err) {
    console.error('Error sirviendo imagen (descargar):', err);
    res.status(500).json({ error: 'Error al descargar imagen.' });
  }
});
app.get('/api/estadisticas/reclamos', async (req, res) => {
  try {
    const stats = await obtenerEstadisticasReclamos();
    res.json(stats);
  } catch (err) {
    console.error('Error obteniendo estadísticas:', err);
    res.status(500).json({ error: 'No se pudieron obtener las estadísticas' });
  }
});

// Servir frontend estÃƒÆ’Ã‚Â¡tico
app.use(express.static(path.join(__dirname, '../frontend')));

// Manejo de errores MULTER (mÃƒÆ’Ã‚Â¡s claro)
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ mensaje: `La imagen supera ${MAX_MB}MB. Reducir el tamaño o elegi otra imagen.` });
  }
  if (err && err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ mensaje: `Máximo ${MAX_FILES_PER_RECLAMO} imágenes por reclamo.` });
  }
  if (err) {
    return res.status(400).json({ mensaje: err.message || 'Error en la carga' });
  }
  next();
});

// Inicio del servidor
const PORT = process.env.PORT || 3000;
async function startServer() {
  try {
    await ensureAdminTableAndSeed();
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('No se pudo iniciar el servidor:', err);
    process.exit(1);
  }
}

startServer();


/*<!--Revisado em texto-->*/


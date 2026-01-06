#!/usr/bin/env node
import 'dotenv/config';         // Carga variables de entorno desde .env
import express from 'express';
import path from 'path';

const app = express();

// Sirve archivos estáticos desde 
app.use(express.static(path.join(process.cwd(), 'public')));

// Puerto del dashboard de admin (ADMIN_PORT) 
const PORT = parseInt(process.env.ADMIN_PORT, 10) || 8082;

// Inicia servidor 
app.listen(PORT, () => {
  console.log(`Admin Dashboard corriendo en http://localhost:${PORT}`);
});

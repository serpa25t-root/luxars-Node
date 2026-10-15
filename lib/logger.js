// lib/logger.js - Sistema de logs diarios para LuxArs.
// Portado de la practica node_logs: estilo simple por fuera, robusto por dentro.
// Usa solo modulos nativos (node:fs/promises, node:path, node:os), sin dependencias.
//
// Formato de cada linea: [fechaISO] accion="..." usuario="..."
// Un archivo por dia en logs/: logs/2026-10-15.log

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Quien hizo la accion. Se puede fijar con la variable de entorno AUTOR.
// Si no se fija, usa el usuario del sistema automaticamente.
const AUTOR = process.env.AUTOR || (() => {
  try {
    return os.userInfo().username;
  } catch {
    return 'anonimo';
  }
})();

// Carpeta de logs en la raiz del proyecto (luxars/logs).
// __dirname es lib/, por eso subimos un nivel con '..'.
const CARPETA_LOGS = path.join(__dirname, '..', 'logs');

// Nombre del archivo de log para una fecha (por defecto hoy, en UTC).
// Ej: logPathForDate() -> luxars/logs/2026-10-15.log
function logPathForDate(fecha = new Date()) {
  const dia = fecha.toISOString().slice(0, 10);
  return path.join(CARPETA_LOGS, `${dia}.log`);
}

// Crea la carpeta si no existe. Si ya existe, no hace nada.
async function asegurarCarpeta(rutaCarpeta) {
  await fs.mkdir(rutaCarpeta, { recursive: true });
}

// Limpia un texto para que el log quede en una sola linea.
// Quita saltos de linea y comillas dobles que romperian el formato.
function limpiarCampo(valor) {
  return String(valor == null ? '' : valor).replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim();
}

// Extrae un nombre de usuario legible desde distintos formatos.
// Acepta string directo, req.user de Express ({ name, email, id }) o nada (usa AUTOR).
function usuarioDe(origen) {
  if (!origen) return AUTOR;
  if (typeof origen === 'string') return limpiarCampo(origen) || AUTOR;
  if (typeof origen === 'object') {
    return limpiarCampo(origen.name || origen.email || origen.id) || AUTOR;
  }
  return AUTOR;
}

// Guarda un evento en el log del dia.
// No lanza si falla el disco: lo avisa por consola y sigue (el log no debe tumbar la API).
// @param {string} accion - Que paso. Ej: 'Reserva creada RES-1001 para fotografo 4'
// @param {string|object} [origen=AUTOR] - Quien lo hizo: string, req.user o nada.
async function registrarEvento(accion, origen = AUTOR) {
  try {
    await asegurarCarpeta(CARPETA_LOGS);
    const fecha = new Date().toISOString();
    const linea = `[${fecha}] accion="${limpiarCampo(accion)}" usuario="${limpiarCampo(usuarioDe(origen))}"\n`;
    await fs.appendFile(logPathForDate(), linea, 'utf8');
  } catch (error) {
    console.error('[logger] No se pudo escribir el log:', error.message);
  }
}

// Lee el log de un dia y lo regresa como texto.
// @param {string} [nombreLog] - Ej: '2026-10-15.log'. Si no se pasa, usa el de hoy.
// @returns {Promise<string|null>} - Texto del log o null si aun no existe.
async function leerLog(nombreLog) {
  try {
    await asegurarCarpeta(CARPETA_LOGS);
    const hoy = new Date().toISOString().slice(0, 10);
    const archivo = nombreLog || `${hoy}.log`;
    return await fs.readFile(path.join(CARPETA_LOGS, archivo), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Middleware para Express: registra cada peticion a /api.
// Uso en server.js: app.use(logger.requestLogger);
// Guarda: METODO ruta usuario estado ms. Solo registra /api para no llenar el log con estaticos.
function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  const inicio = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - inicio;
    const usuario = req.user ? usuarioDe(req.user) : 'anonimo';
    registrarEvento(`${req.method} ${req.originalUrl || req.url} estado=${res.statusCode} ${ms}ms`, usuario);
  });
  next();
}

module.exports = {
  AUTOR,
  CARPETA_LOGS,
  asegurarCarpeta,
  registrarEvento,
  leerLog,
  requestLogger,
  usuarioDe
};

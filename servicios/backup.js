// servicios/backup.js - Respaldo diario de los datos de LuxArs.
// Adaptado de la guia con mongodump: este proyecto no usa Mongo sino
// Supabase + datos en memoria (data/), asi que el respaldo es una
// instantanea JSON con marca de tiempo en backup/AAAA-MM-DD-HHMMSS/.
// Usa solo modulos nativos (node:fs/promises, node:path), sin dependencias.

const fs = require('node:fs/promises');
const path = require('node:path');

const store = require('../data/bookings');
const photographers = require('../data/photographers');
const logger = require('../lib/logger');

// Carpeta raiz de respaldos (luxars/backup).
const CARPETA_RESPALDOS = path.join(__dirname, '..', 'backup');

// Marca de tiempo compacta para nombrar la carpeta. Ej: 2026-10-15-002431.
function marcaTiempo(fecha = new Date()) {
  const iso = fecha.toISOString();
  return iso.slice(0, 10) + '-' + iso.slice(11, 19).replace(/:/g, '');
}

// Genera el respaldo de la base de datos (reservas + catalogo + metadatos).
// No lanza si algo falla: registra el error en el log y lo relanza para que
// el programador (cron) decida que hacer.
// @returns {Promise<string>} - Ruta de la carpeta del respaldo creado.
async function backupDatabase() {
  const carpeta = path.join(CARPETA_RESPALDOS, marcaTiempo());
  try {
    await fs.mkdir(carpeta, { recursive: true });

    const reservas = store.listAll();
    const meta = {
      fecha: new Date().toISOString(),
      proyecto: 'luxars',
      totalReservas: reservas.length,
      totalFotografos: Array.isArray(photographers) ? photographers.length : 0
    };

    await fs.writeFile(path.join(carpeta, 'reservas.json'), JSON.stringify(reservas, null, 2), 'utf8');
    await fs.writeFile(path.join(carpeta, 'fotografos.json'), JSON.stringify(photographers, null, 2), 'utf8');
    await fs.writeFile(path.join(carpeta, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    console.log('Respaldo completado con exito en: ' + carpeta);
    await logger.registrarEvento(`Respaldo completado en ${path.basename(carpeta)} reservas=${meta.totalReservas}`);
    return carpeta;
  } catch (error) {
    console.error('Error en el respaldo: ' + error.message);
    await logger.registrarEvento(`Respaldo fallido: ${error.message}`);
    throw error;
  }
}

module.exports = { backupDatabase, CARPETA_RESPALDOS };

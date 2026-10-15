// servicios/backup.js - Respaldo diario de los datos de LuxArs.
// Adaptado de la guia con mongodump: este proyecto no usa Mongo sino
// Supabase + datos en memoria (data/), asi que el respaldo es una
// instantanea JSON con marca de tiempo en backup/AAAA-MM-DD-HHMMSS/.
// Usa solo modulos nativos (node:fs/promises, node:path), sin dependencias.

const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

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

module.exports = { backupDatabase, generarArchivoComprimido, enviarRespaldoPorCorreo, CARPETA_RESPALDOS };

// Genera UN solo archivo comprimido con todo el respaldo.
// Equivale al truco --archive + --gzip de mongodump: en vez de un .gz por
// coleccion, junta reservas + catalogo + metadatos en un unico .archive.gz
// usando el modulo nativo zlib (sin librerias extra).
// @returns {Promise<string>} - Ruta del archivo .archive.gz creado.
async function generarArchivoComprimido() {
  await fs.mkdir(CARPETA_RESPALDOS, { recursive: true });
  const reservas = store.listAll();
  const paquete = {
    meta: {
      fecha: new Date().toISOString(),
      proyecto: 'luxars',
      totalReservas: reservas.length,
      totalFotografos: Array.isArray(photographers) ? photographers.length : 0
    },
    reservas,
    fotografos: photographers
  };
  const marca = marcaTiempo();
  const ruta = path.join(CARPETA_RESPALDOS, `luxars_${marca}.archive.gz`);
  const comprimido = zlib.gzipSync(JSON.stringify(paquete), { level: 9 });
  await fs.writeFile(ruta, comprimido);
  console.log('Comprimido generado con exito en: ' + ruta);
  return ruta;
}

// Envia el respaldo comprimido por correo con nodemailer.
// Configuracion por variables de entorno (nunca hardcodear claves):
// MAIL_USER (cuenta Gmail), MAIL_PASS (contrasena de aplicacion de 16 letras),
// MAIL_TO (destinatario). Si faltan, avisa en el log y NO falla.
// El archivo temporal se borra solo si el correo se envio bien.
async function enviarRespaldoPorCorreo() {
  const { MAIL_USER, MAIL_PASS, MAIL_TO } = process.env;
  if (!MAIL_USER || !MAIL_PASS || !MAIL_TO) {
    console.log('Correo no configurado (faltan MAIL_USER, MAIL_PASS o MAIL_TO), se omite el envio.');
    await logger.registrarEvento('Envio de respaldo omitido: correo no configurado');
    return null;
  }

  const nodemailer = require('nodemailer');
  const ruta = await generarArchivoComprimido();
  const nombre = path.basename(ruta);
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: MAIL_USER, pass: MAIL_PASS }
    });
    console.log('Enviando correo con archivo adjunto...');
    const info = await transporter.sendMail({
      from: `"Respaldo LuxArs" <${MAIL_USER}>`,
      to: MAIL_TO,
      subject: `Respaldo diario LuxArs: ${marcaTiempo()}`,
      text: 'Adjunto encontraras el respaldo comprimido de la base de datos de LuxArs.',
      attachments: [{ filename: nombre, path: ruta }]
    });
    console.log('Correo enviado con exito. ID: ' + info.messageId);
    await logger.registrarEvento(`Respaldo enviado por correo a ${MAIL_TO} archivo=${nombre}`);
    await fs.rm(ruta, { force: true });
    console.log('Archivo temporal eliminado del servidor.');
    return info.messageId;
  } catch (error) {
    console.error('Error al enviar el correo: ' + error.message);
    await logger.registrarEvento(`Envio de respaldo fallido: ${error.message}`);
    throw error;
  }
}

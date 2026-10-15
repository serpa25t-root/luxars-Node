const store = require('../data/bookings');
const photographers = require('../data/photographers');
const logger = require('../lib/logger');

function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/[<>"';&\\]/g, '').trim();
}

function detectSQLInjection(str) {
  const sqlPatterns = /('|--|;|\bDROP\b|\bDELETE\b|\bINSERT\b|\bUPDATE\b|\bUNION\b|\bSELECT\b|\bOR\b|\bAND\b|\bEXEC\b|\bxp_)/i;
  return sqlPatterns.test(str);
}

function create(req, res) {
  const { photographerId, date, time, eventType, location, notes } = req.body || {};

  // Campos obligatorios
  if (!photographerId || !date || !time || !eventType || !location) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben completarse.' });
  }

  const photographer = photographers.find(p => p.id === Number(photographerId));
  if (!photographer) {
    return res.status(400).json({ error: 'Fotografo no encontrado.' });
  }

  // Sanitizar
  const safeLocation = sanitize(location);
  const safeNotes = sanitize(notes);
  const safeEventType = sanitize(eventType);

  // Deteccion de inyeccion SQL
  if (detectSQLInjection(safeLocation) || detectSQLInjection(safeNotes) || detectSQLInjection(safeEventType)) {
    return res.status(400).json({ error: 'Datos invalidos detectados. Verifica la informacion.' });
  }

  // Formato de fecha y hora
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Fecha invalida. Usa el formato AAAA-MM-DD.' });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Hora invalida. Usa el formato HH:MM.' });
  }

  // Solo reservas del ano actual y no en el pasado
  const currentYear = new Date().getFullYear();
  const year = Number(date.split('-')[0]);
  if (year !== currentYear) {
    return res.status(400).json({ error: 'Solo se permiten reservas en el ano actual (' + currentYear + ').' });
  }

  const selectedDate = new Date(date + 'T' + time);
  const now = new Date();
  if (selectedDate < now) {
    return res.status(400).json({ error: 'No puedes reservar una fecha u hora anterior al momento actual.' });
  }
  if (Math.abs(selectedDate - now) < 60000) {
    return res.status(400).json({ error: 'No puedes reservar para el mismo minuto en que realizas la reserva.' });
  }

  // Disponibilidad: slot ocupado
  if (store.isSlotOccupied(Number(photographerId), date, time)) {
    return res.status(409).json({ error: 'Este horario ya no se encuentra disponible.' });
  }

  // Disponibilidad: reserva activa propia en el mismo horario
  const ownOccupied = store
    .findByUser(req.user.id)
    .some(r => r.photographerId === Number(photographerId) && r.date === date && r.time === time && r.status !== 'Cancelada');
  if (ownOccupied) {
    return res.status(409).json({ error: 'Ya tienes una reserva activa en este horario con este fotografo.' });
  }

  const booking = {
    id: store.nextId(),
    userId: req.user.id,
    userName: req.user.name,
    photographerId: Number(photographerId),
    photographerName: photographer.name,
    photographerAvatar: photographer.avatar,
    photographerSpecialty: photographer.specialty,
    date,
    time,
    eventType: safeEventType,
    location: safeLocation,
    notes: safeNotes,
    price: photographer.price,
    status: 'Confirmada',
    createdAt: new Date().toISOString()
  };

  store.save(booking);
  logger.registrarEvento(
    `Reserva creada ${booking.id} fotografo=${booking.photographerId} fecha=${date} hora=${time}`,
    req.user
  );
  return res.status(201).json({ booking });
}

function listMine(req, res) {
  const mine = store.findByUser(req.user.id);
  return res.json({ bookings: mine });
}

function cancel(req, res) {
  const booking = store.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Reserva no encontrada.' });
  }
  if (booking.userId !== req.user.id) {
    return res.status(403).json({ error: 'No puedes cancelar una reserva que no es tuya.' });
  }
  if (booking.status === 'Cancelada') {
    return res.status(400).json({ error: 'Esta reserva ya esta cancelada.' });
  }

  booking.status = 'Cancelada';
  store.freeSlot(booking.photographerId, booking.date, booking.time);
  logger.registrarEvento(`Reserva cancelada ${booking.id} fotografo=${booking.photographerId}`, req.user);
  return res.json({ booking });
}

module.exports = { create, listMine, cancel };

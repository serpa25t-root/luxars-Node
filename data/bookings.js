// Almacen de reservas en memoria (todavia no hay tabla en Supabase).
// Cuando exista la migracion 0003_reservas.sql, reemplazar por consultas a Supabase.

let bookingIdCounter = 1000;

const occupiedSlots = [
  { photographerId: 1, date: '2026-05-15', time: '14:00' },
  { photographerId: 3, date: '2026-05-20', time: '10:00' },
  { photographerId: 2, date: '2026-06-01', time: '16:00' }
];

const reservations = [];

function nextId() {
  bookingIdCounter += 1;
  return 'RES-' + bookingIdCounter;
}

function isSlotOccupied(photographerId, date, time) {
  return occupiedSlots.some(
    s => s.photographerId === photographerId && s.date === date && s.time === time
  );
}

function findByUser(userId) {
  return reservations.filter(r => r.userId === userId);
}

function findById(id) {
  return reservations.find(r => r.id === id);
}

// Devuelve todas las reservas en memoria. Se usa para el respaldo diario.
function listAll() {
  return reservations.slice();
}

function save(booking) {
  reservations.push(booking);
  occupiedSlots.push({
    photographerId: booking.photographerId,
    date: booking.date,
    time: booking.time
  });
}

function freeSlot(photographerId, date, time) {
  const idx = occupiedSlots.findIndex(
    s => s.photographerId === photographerId && s.date === date && s.time === time
  );
  if (idx !== -1) occupiedSlots.splice(idx, 1);
}

module.exports = { nextId, isSlotOccupied, findByUser, findById, listAll, save, freeSlot };

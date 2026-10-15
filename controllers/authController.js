const { getSupabase } = require('../lib/supabase');
const logger = require('../lib/logger');

async function getProfile(req, res) {
  const supabase = getSupabase();
  if (!supabase) {
    return res.json({ user: req.user, supabase: false });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, avatar_url, created_at')
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.json({ user: data || { ...req.user } });
}

async function updateProfile(req, res) {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(400).json({ error: 'Supabase no configurado. Revisa el .env.' });
  }

  const { name, avatar_url } = req.body || {};
  if (name === undefined && avatar_url === undefined) {
    return res.status(400).json({ error: 'Envia al menos name o avatar_url.' });
  }

  const update = {};
  if (typeof name === 'string' && name.trim()) update.name = name.trim();
  if (typeof avatar_url === 'string') update.avatar_url = avatar_url;

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', req.user.id)
    .select('id, email, name, role, avatar_url, created_at')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  logger.registrarEvento('Perfil actualizado', req.user);
  return res.json({ user: data });
}

module.exports = { getProfile, updateProfile };

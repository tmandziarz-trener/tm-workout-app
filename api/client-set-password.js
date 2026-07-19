// Serwerowa funkcja Vercel — ustawienie hasła dla konta założonego PRZED wprowadzeniem haseł
// (jednorazowa migracja "przy pierwszym logowaniu"). Po ustawieniu hasła konto działa jak
// każde inne — kolejne logowania idą przez api/client-login.js.
//
// Wymagane zmienne środowiskowe: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return salt + ':' + hash;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { id, password } = req.body || {};
  if (!id || !password || String(password).length < 4) {
    return res.status(400).json({ ok: false, error: 'Hasło musi mieć przynajmniej 4 znaki.' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: existing, error: exErr } = await supabase.from('clients')
      .select('id,name,password_hash').eq('id', id).single();
    if (exErr || !existing) {
      return res.status(404).json({ ok: false, error: 'Nie znaleziono konta.' });
    }
    if (existing.password_hash) {
      return res.status(409).json({ ok: false, error: 'To konto ma już ustawione hasło — zaloguj się normalnie.' });
    }

    const password_hash = hashPassword(String(password));
    const { error } = await supabase.from('clients').update({ password_hash }).eq('id', id);
    if (error) throw error;

    return res.status(200).json({ ok: true, id: existing.id, name: existing.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

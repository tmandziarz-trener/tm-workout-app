// Serwerowa funkcja Vercel — logowanie klienta telefonem/e-mailem + hasłem.
// Porównanie hasła odbywa się TUTAJ, po stronie serwera (service_role key) — przeglądarka
// nigdy nie widzi hasha zapisanego w bazie.
//
// Wymagane zmienne środowiskowe: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return check === hash;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { value, password } = req.body || {};
  if (!value) {
    return res.status(400).json({ ok: false, error: 'Podaj telefon albo e-mail.' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('clients')
      .select('id,name,password_hash')
      .or(`phone.eq.${value},email.eq.${value}`)
      .limit(1);
    if (error) throw error;
    if (!data || !data.length) {
      return res.status(404).json({ ok: false, error: 'Nie znaleziono konta z tymi danymi.' });
    }

    const client = data[0];

    // Konto założone przed wprowadzeniem haseł — jeszcze nie ma password_hash.
    // Klient musi je ustawić przy tym logowaniu (patrz api/client-set-password.js).
    if (!client.password_hash) {
      return res.status(200).json({ ok: false, needsPassword: true, id: client.id, name: client.name });
    }

    if (!password) {
      return res.status(400).json({ ok: false, error: 'Podaj hasło.' });
    }
    if (!verifyPassword(String(password), client.password_hash)) {
      return res.status(401).json({ ok: false, error: 'Błędne hasło.' });
    }

    return res.status(200).json({ ok: true, id: client.id, name: client.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

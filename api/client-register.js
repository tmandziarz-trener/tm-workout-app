// Serwerowa funkcja Vercel — rejestracja nowego klienta z hasłem.
// Hash hasła liczony jest TUTAJ, po stronie serwera, i zapisywany przez service_role key —
// przeglądarka nigdy nie widzi ani nie wysyła gotowego hasha, tylko czyste hasło przez HTTPS.
//
// Wymagane zmienne środowiskowe (te same, co już używa api/weekly-report.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

  const { name, age, height_cm, phone, email, password } = req.body || {};

  if (!name || !height_cm) {
    return res.status(400).json({ ok: false, error: 'Podaj przynajmniej imię i wzrost.' });
  }
  if (!phone && !email) {
    return res.status(400).json({ ok: false, error: 'Podaj przynajmniej telefon albo e-mail.' });
  }
  if (!password || String(password).length < 4) {
    return res.status(400).json({ ok: false, error: 'Hasło musi mieć przynajmniej 4 znaki.' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const orParts = [];
    if (phone) orParts.push(`phone.eq.${phone}`);
    if (email) orParts.push(`email.eq.${email}`);
    const { data: existing, error: exErr } = await supabase.from('clients').select('id').or(orParts.join(','));
    if (exErr) throw exErr;
    if (existing && existing.length) {
      return res.status(409).json({ ok: false, error: 'Konto z tym telefonem albo e-mailem już istnieje — zaloguj się.' });
    }

    const password_hash = hashPassword(String(password));
    const { data, error } = await supabase.from('clients').insert({
      name,
      age: age || null,
      height_cm,
      phone: phone || null,
      email: email || null,
      password_hash,
      password_set: true,
    }).select('id,name').single();
    if (error) throw error;

    return res.status(200).json({ ok: true, id: data.id, name: data.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

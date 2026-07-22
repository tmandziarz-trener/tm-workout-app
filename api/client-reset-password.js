// Serwerowa funkcja Vercel — "zapomniałem hasła". Zamiast budować osobny system tokenów
// resetujących, celowo używamy TEGO SAMEGO mechanizmu, co konta założone przed wprowadzeniem
// haseł: zerujemy password_hash, a przy kolejnym logowaniu klient trafia na już istniejący
// ekran "ustaw hasło" (patrz api/client-set-password.js / needsPassword w api/client-login.js).
//
// WAŻNA UWAGA BEZPIECZEŃSTWA: ta funkcja NIE weryfikuje tożsamości poza podaniem telefonu
// albo e-maila z rejestracji — każdy, kto zna te dane, może wyzerować hasło klienta i ustawić
// nowe. Jedynym zabezpieczeniem jest e-mail z powiadomieniem do prawdziwego właściciela konta
// (jeśli ma podany e-mail). Dla apki treningowej z małą liczbą klientów to akceptowalny
// kompromis, ale warto, żeby Tomasz o tym wiedział.
//
// Wymagane zmienne środowiskowe (te same, co inne api/*.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { value } = req.body || {};
  if (!value) {
    return res.status(400).json({ ok: false, error: 'Podaj telefon albo e-mail z rejestracji.' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.from('clients')
      .select('id,name,email,phone')
      .or(`phone.eq.${value},email.eq.${value}`)
      .limit(1);
    if (error) throw error;
    if (!data || !data.length) {
      return res.status(404).json({ ok: false, error: 'Nie znaleziono konta z tymi danymi.' });
    }

    const client = data[0];
    const { error: updErr } = await supabase.from('clients').update({ password_hash: null, password_set: false }).eq('id', client.id);
    if (updErr) throw updErr;

    if (client.email && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
        });
        await transporter.sendMail({
          from: `TM Workout <${process.env.GMAIL_USER}>`,
          to: client.email,
          subject: 'TM Workout — reset hasła',
          html: `
            <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;">
              <p>Cześć ${client.name},</p>
              <p>Ktoś (mamy nadzieję, że Ty) poprosił o reset hasła do Twojego konta w aplikacji TM Workout.
              Hasło zostało wyzerowane — przy następnym logowaniu zostaniesz poproszony(a) o ustawienie nowego.</p>
              <p style="color:#767066;">Jeśli to nie Ty, napisz do trenera jak najszybciej.</p>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error('Reset-hasła: błąd wysyłki e-maila', mailErr);
        // Nie przerywamy — reset hasła w bazie już się udał, e-mail to tylko powiadomienie.
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

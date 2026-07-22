// Serwerowa funkcja Vercel — powiadomienia e-mail o nowej wiadomości w wątku ćwiczenia,
// w obie strony: klient -> trener oraz trener -> klient.
//
// Wymagane zmienne środowiskowe (te same, co już używa api/weekly-report.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GMAIL_USER, GMAIL_APP_PASSWORD
//   REPORT_TO   (adres trenera — używany, gdy direction = 'to_trainer')
//
// Wywołanie jest "fire-and-forget" z front-endu — brak e-maila klienta albo błąd wysyłki
// NIE powinien przerywać zapisu wiadomości w bazie, dlatego ta funkcja zawsze stara się
// zwrócić 200 nawet gdy powiadomienie zostało pominięte (np. klient nie ma e-maila).

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function esc(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { direction, clientId, exerciseName, message } = req.body || {};
  if (!direction || !clientId || !message) {
    return res.status(400).json({ ok: false, error: 'Brak wymaganych danych.' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: client, error: cErr } = await supabase
      .from('clients').select('id,name,email').eq('id', clientId).single();
    if (cErr || !client) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Nie znaleziono klienta.' });
    }

    let to, subject, html;
    if (direction === 'to_trainer') {
      if (!process.env.REPORT_TO) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'Brak REPORT_TO.' });
      }
      to = process.env.REPORT_TO;
      subject = `TM Workout — nowa wiadomość od ${client.name}${exerciseName ? ' (' + exerciseName + ')' : ''}`;
      html = `
        <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;">
          <p><strong>${esc(client.name)}</strong> napisał(a)${exerciseName ? ' przy ćwiczeniu <strong>' + esc(exerciseName) + '</strong>' : ''}:</p>
          <p style="background:#f4f1ec;padding:12px;border-radius:8px;">${esc(message)}</p>
        </div>
      `;
    } else if (direction === 'to_client') {
      if (!client.email) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'Klient nie ma e-maila.' });
      }
      to = client.email;
      subject = `TM Workout — trener odpisał${exerciseName ? ' (' + exerciseName + ')' : ''}`;
      html = `
        <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;">
          <p>Cześć ${esc(client.name)}, masz nową odpowiedź od trenera${exerciseName ? ' przy ćwiczeniu <strong>' + esc(exerciseName) + '</strong>' : ''}:</p>
          <p style="background:#f4f1ec;padding:12px;border-radius:8px;">${esc(message)}</p>
          <p style="color:#767066;">Zaloguj się do aplikacji TM Workout, żeby zobaczyć całą rozmowę.</p>
        </div>
      `;
    } else {
      return res.status(400).json({ ok: false, error: 'Nieprawidłowy kierunek.' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `TM Workout <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    // Nie chcemy, żeby błąd e-maila blokował zapis wiadomości w aplikacji.
    return res.status(200).json({ ok: false, error: err.message });
  }
}

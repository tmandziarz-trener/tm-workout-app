// Serwerowa funkcja Vercel — zgłoszenie na bezpłatną konsultację z landinga (start.html).
// Zapisuje lead do Supabase kluczem service_role i wysyła powiadomienie na maila trenera.
//
// Wymagane zmienne środowiskowe (te same, co reszta api/):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GMAIL_USER, GMAIL_APP_PASSWORD
//   REPORT_TO   (adres trenera)

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function esc(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const GOALS = {
  schudnac: 'Chcę schudnąć',
  forma: 'Chcę poprawić formę i sylwetkę',
  zdrowie: 'Chcę poprawić zdrowie i samopoczucie',
  inne: 'Coś innego',
};

const WHERE = {
  dom: 'W domu',
  silownia: 'Na siłowni',
  dwor: 'Na dworze',
  nie_wiem: 'Jeszcze nie wie',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const b = req.body || {};
  const name = (b.name || '').toString().trim();
  const email = (b.email || '').toString().trim();
  const phone = (b.phone || '').toString().trim();

  // Honeypot — boty wypełniają wszystkie pola, człowiek tego nie widzi.
  if ((b.website || '').toString().trim()) {
    return res.status(200).json({ ok: true });
  }

  if (name.length < 2) {
    return res.status(400).json({ ok: false, error: 'Podaj imię.' });
  }
  if (!email && !phone) {
    return res.status(400).json({ ok: false, error: 'Zostaw e-mail albo telefon — inaczej nie mam jak się odezwać.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Ten e-mail wygląda na niepoprawny.' });
  }

  const row = {
    name: name,
    email: email || null,
    phone: phone || null,
    goal: (b.goal || '').toString().slice(0, 40) || null,
    goal_kg: b.goal_kg ? (Number(b.goal_kg) || null) : null,
    training_days: (b.training_days || '').toString().slice(0, 20) || null,
    where_train: (b.where_train || '').toString().slice(0, 20) || null,
    note: (b.note || '').toString().slice(0, 2000) || null,
    source: (b.source || '').toString().slice(0, 60) || null,
    utm: (b.utm || '').toString().slice(0, 500) || null,
  };

  let saved = false;
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('leads').insert(row);
    if (error) throw error;
    saved = true;
  } catch (err) {
    console.error('lead insert failed', err);
    // Lecimy dalej — lepiej dostać maila bez zapisu w bazie niż stracić zgłoszenie.
  }

  try {
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.REPORT_TO) {
      const kontakt = [
        phone ? '<a href="tel:' + esc(phone) + '">' + esc(phone) + '</a>' : null,
        email ? '<a href="mailto:' + esc(email) + '">' + esc(email) + '</a>' : null,
      ].filter(Boolean).join(' &nbsp;&middot;&nbsp; ');

      function wiersz(k, v) {
        if (!v) return '';
        return '<tr><td style="padding:6px 14px 6px 0;color:#767066;white-space:nowrap;">' + k +
               '</td><td style="padding:6px 0;"><strong>' + esc(v) + '</strong></td></tr>';
      }

      const kiedy = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });

      const html =
        '<div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;">' +
          '<p style="font-size:17px;margin:0 0 4px;"><strong>Nowe zgłoszenie na konsultację</strong></p>' +
          '<p style="margin:0 0 16px;color:#767066;font-size:13px;">' + kiedy + '</p>' +
          '<table style="border-collapse:collapse;font-size:15px;">' +
            wiersz('Imię', name) +
            '<tr><td style="padding:6px 14px 6px 0;color:#767066;">Kontakt</td>' +
            '<td style="padding:6px 0;"><strong>' + kontakt + '</strong></td></tr>' +
            wiersz('Cel', GOALS[row.goal] || row.goal) +
            wiersz('Ile kg', row.goal_kg ? row.goal_kg + ' kg' : '') +
            wiersz('Treningi/tydz.', row.training_days) +
            wiersz('Gdzie trenuje', WHERE[row.where_train] || row.where_train) +
            wiersz('Skąd przyszedł(a)', row.source) +
          '</table>' +
          (row.note
            ? '<p style="margin:16px 0 4px;color:#767066;font-size:13px;">Co dotąd próbował(a):</p>' +
              '<p style="background:#f4f1ec;padding:12px;border-radius:8px;margin:0;white-space:pre-wrap;">' + esc(row.note) + '</p>'
            : '') +
          (saved
            ? ''
            : '<p style="color:#b3402c;margin-top:18px;"><strong>Uwaga:</strong> nie udało się zapisać tego zgłoszenia w bazie — masz je tylko w tym mailu.</p>') +
        '</div>';

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });

      await transporter.sendMail({
        from: 'TM Workout <' + process.env.GMAIL_USER + '>',
        to: process.env.REPORT_TO,
        replyTo: email || undefined,
        subject: 'Nowe zgłoszenie: ' + name + (row.goal_kg ? ' (-' + row.goal_kg + ' kg)' : ''),
        html: html,
      });
    }
  } catch (err) {
    console.error('lead mail failed', err);
  }

  if (!saved) {
    // Zgłoszenie poszło mailem, ale baza padła — dla użytkownika to nadal sukces.
    return res.status(200).json({ ok: true, warning: 'not_saved' });
  }
  return res.status(200).json({ ok: true });
}

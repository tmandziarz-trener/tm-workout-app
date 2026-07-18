// Serwerowa funkcja Vercel — wywoływana raz w tygodniu przez Vercel Cron (patrz vercel.json).
// Zbiera pomiary i ćwiczenia z ostatnich 7 dni ze wszystkich klientów i wysyła e-mail podsumowujący.
//
// Wymagane zmienne środowiskowe (Vercel -> Project Settings -> Environment Variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (service_role, NIE anon — tylko po stronie serwera!)
//   GMAIL_USER, GMAIL_APP_PASSWORD            (hasło aplikacji Gmail, nie zwykłe hasło)
//   REPORT_TO                                 (adres, na który ma przyjść raport)
//   CRON_SECRET                               (dowolny losowy ciąg — zabezpiecza endpoint)

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  const secret = req.query.secret || (req.headers.authorization || '').replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: clients, error: e1 } = await supabase.from('clients').select('id,name');
    if (e1) throw e1;

    const { data: meas, error: e2 } = await supabase
      .from('measurements').select('*').gte('measured_at', since).order('measured_at');
    if (e2) throw e2;

    const { data: sets, error: e3 } = await supabase
      .from('exercise_logs').select('*').gte('logged_at', since).order('logged_at');
    if (e3) throw e3;

    const html = buildReportHtml(clients || [], meas || [], sets || [], since);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `TM Workout <${process.env.GMAIL_USER}>`,
      to: process.env.REPORT_TO,
      subject: `TM Workout — raport tygodniowy (od ${since})`,
      html,
    });

    return res.status(200).json({ ok: true, clients: clients.length, measurements: meas.length, sets: sets.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function volumeOf(s) {
  if (Array.isArray(s.sets_detail) && s.sets_detail.length) {
    return s.sets_detail.reduce((sum, st) => {
      const r = parseFloat(st.reps), w = parseFloat(st.weight_kg);
      return sum + ((!isNaN(r) && !isNaN(w)) ? r * w : 0);
    }, 0);
  }
  const sets_ = parseFloat(s.sets), reps = parseFloat(s.reps), w = parseFloat(s.weight_kg);
  if (isNaN(sets_) || isNaN(reps) || isNaN(w)) return 0;
  return sets_ * reps * w;
}

function formatSets(s) {
  if (Array.isArray(s.sets_detail) && s.sets_detail.length) {
    return s.sets_detail.map(st => (st.reps ?? '-') + 'x' + (st.weight_kg ?? '-') + 'kg').join(', ');
  }
  return (s.sets || '-') + 'x' + (s.reps || '-') + ' @ ' + (s.weight_kg || '-') + 'kg';
}

function esc(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReportHtml(clients, meas, sets, since) {
  const byClient = {};
  clients.forEach(c => { byClient[c.id] = { name: c.name, meas: [], sets: [] }; });
  meas.forEach(m => { if (byClient[m.client_id]) byClient[m.client_id].meas.push(m); });
  sets.forEach(s => { if (byClient[s.client_id]) byClient[s.client_id].sets.push(s); });

  const active = Object.values(byClient).filter(c => c.meas.length || c.sets.length);

  const sections = active.length === 0
    ? '<p>Brak nowych danych od klientów od ' + since + '.</p>'
    : active.map(c => {
        const measRows = c.meas.map(m => `
          <tr><td>${m.measured_at}</td><td>${m.weight_kg || ''}</td><td>${m.waist_cm || ''}</td><td>${m.hip_cm || ''}</td></tr>
        `).join('');
        const exRows = c.sets.map(s => `
          <li><strong>${esc(s.exercise_name)}</strong> — ${formatSets(s)}
          (objętość: ${volumeOf(s)} kg)
          ${s.video_url ? ' — <a href="' + s.video_url + '">wideo</a>' : ''}
          ${s.note ? '<br><em>💬 ' + esc(s.note) + '</em>' : ''}</li>
        `).join('');
        return `
          <h2 style="color:#a8875c;">${esc(c.name)}</h2>
          ${measRows ? '<table border="1" cellpadding="6" style="border-collapse:collapse;"><tr><th>Data</th><th>Waga</th><th>Talia</th><th>Biodro</th></tr>' + measRows + '</table>' : '<p>Brak nowych pomiarów.</p>'}
          ${exRows ? '<ul>' + exRows + '</ul>' : '<p>Brak nowych treningów.</p>'}
        `;
      }).join('<hr>');

  return `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:640px;">
      <h1 style="color:#1a1a1a;">TM Workout — raport tygodniowy</h1>
      <p style="color:#767066;">Dane od ${since} do dziś.</p>
      ${sections}
    </div>
  `;
}

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

    // Pobieramy PEŁNĄ historię (nie tylko ostatnie 7 dni) — potrzebna do wykrywania rekordów
    // życiowych i flag ostrzegawczych (np. "brak treningu od X dni" musi znać datę ostatniego
    // treningu sprzed okresu raportu, spadek objętości potrzebuje poprzednich treningów itd.).
    const { data: allMeas, error: e2 } = await supabase
      .from('measurements').select('*').order('measured_at');
    if (e2) throw e2;

    const { data: allSets, error: e3 } = await supabase
      .from('exercise_logs').select('*').order('logged_at');
    if (e3) throw e3;

    const meas = (allMeas || []).filter(m => m.measured_at >= since);
    const sets = (allSets || []).filter(s => s.logged_at >= since);

    const prsByClient = computeRecentPRs(allSets || [], since);
    const flagsByClient = computeFlags(clients || [], allMeas || [], allSets || []);

    const html = buildReportHtml(clients || [], meas, sets, since, prsByClient, flagsByClient);

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

// Rekordy życiowe pobite W OSTATNICH 7 DNIACH — liczone chronologicznie na pełnej historii
// (per klient, per ćwiczenie): idziemy datami od najstarszej, trzymamy dotychczasowy najlepszy
// ciężar, i za każdym razem, gdy log przebija dotychczasowy rekord, zapisujemy to jako PR z datą.
// Na końcu zostają tylko te PR-y, których data mieści się w ostatnich 7 dniach.
function computeRecentPRs(allSets, since) {
  const byClient = {};
  allSets
    .filter(s => s.duration_min === null || s.duration_min === undefined) // bez cardio
    .slice()
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    .forEach(s => {
      let maxWeightNow = null;
      if (Array.isArray(s.sets_detail) && s.sets_detail.length) {
        s.sets_detail.forEach(st => { if (st && st.weight_kg !== null && st.weight_kg !== undefined) maxWeightNow = Math.max(maxWeightNow ?? -Infinity, st.weight_kg); });
      }
      if (s.weight_kg !== null && s.weight_kg !== undefined) maxWeightNow = Math.max(maxWeightNow ?? -Infinity, s.weight_kg);
      if (maxWeightNow === null) return;

      byClient[s.client_id] = byClient[s.client_id] || { best: {}, prs: [] };
      const state = byClient[s.client_id];
      const prevBest = state.best[s.exercise_name];
      if (prevBest === undefined || maxWeightNow > prevBest) {
        state.best[s.exercise_name] = maxWeightNow;
        if (s.logged_at >= since) {
          state.prs.push({ exercise_name: s.exercise_name, weight_kg: maxWeightNow, date: s.logged_at });
        }
      }
    });

  const result = {};
  Object.keys(byClient).forEach(clientId => { result[clientId] = byClient[clientId].prs; });
  return result;
}

// Te same reguły flag ostrzegawczych, co w panelu trenera (renderFlags w trener.html) —
// żeby raport mailowy pokazywał dokładnie to, co trener widzi w apce.
function computeFlags(clients, allMeas, allSets) {
  const result = {};
  const today = new Date();

  clients.forEach(c => {
    const meas = allMeas.filter(m => m.client_id === c.id).sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const sets = allSets.filter(s => s.client_id === c.id);
    const flags = [];

    const dates = Array.from(new Set(sets.map(s => s.logged_at))).sort();
    if (dates.length === 0) {
      flags.push('Klient nie zalogował jeszcze żadnego treningu.');
    } else {
      const lastDate = dates[dates.length - 1];
      const daysSince = Math.floor((today - new Date(lastDate + 'T00:00:00')) / (1000 * 60 * 60 * 24));
      if (daysSince >= 5) flags.push('Brak treningu od ' + daysSince + ' dni (ostatni: ' + lastDate + ').');
    }

    if (meas.length === 0) {
      flags.push('Klient nie wykonał jeszcze żadnego pomiaru tygodniowego.');
    } else {
      const lastMeasDate = meas[meas.length - 1].measured_at;
      const daysSinceMeas = Math.floor((today - new Date(lastMeasDate + 'T00:00:00')) / (1000 * 60 * 60 * 24));
      if (daysSinceMeas >= 7) flags.push('Brak pomiaru tygodniowego od ' + daysSinceMeas + ' dni.');
    }

    const unresolved = sets.filter(s => s.note && !s.trainer_reply);
    if (unresolved.length) flags.push(unresolved.length + ' pytanie/notatka klienta czeka na odpowiedź.');

    const byExercise = {};
    sets.filter(s => s.duration_min === null || s.duration_min === undefined).forEach(s => {
      (byExercise[s.exercise_name] = byExercise[s.exercise_name] || []).push({ date: s.logged_at, vol: volumeOf(s) });
    });
    const declining = [];
    Object.keys(byExercise).forEach(name => {
      const occ = byExercise[name].slice().sort((a, b) => a.date.localeCompare(b.date));
      if (occ.length >= 3) {
        const a = occ[occ.length - 3].vol, b = occ[occ.length - 2].vol, cc = occ[occ.length - 1].vol;
        if (cc < b && b < a) declining.push(name);
      }
    });
    if (declining.length) flags.push('Spadek objętości 2 treningi z rzędu na: ' + declining.join(', ') + '.');

    result[c.id] = flags;
  });

  return result;
}

function buildReportHtml(clients, meas, sets, since, prsByClient, flagsByClient) {
  const byClient = {};
  clients.forEach(c => { byClient[c.id] = { name: c.name, meas: [], sets: [] }; });
  meas.forEach(m => { if (byClient[m.client_id]) byClient[m.client_id].meas.push(m); });
  sets.forEach(s => { if (byClient[s.client_id]) byClient[s.client_id].sets.push(s); });

  const active = clients.filter(c => {
    const b = byClient[c.id];
    const prs = (prsByClient[c.id] || []);
    const flags = (flagsByClient[c.id] || []);
    return b.meas.length || b.sets.length || prs.length || flags.length;
  });

  const sections = active.length === 0
    ? '<p>Brak nowych danych od klientów od ' + since + '.</p>'
    : active.map(c => {
        const b = byClient[c.id];
        const prs = prsByClient[c.id] || [];
        const flags = flagsByClient[c.id] || [];
        const measRows = b.meas.map(m => `
          <tr><td>${m.measured_at}</td><td>${m.weight_kg || ''}</td><td>${m.waist_cm || ''}</td><td>${m.hip_cm || ''}</td></tr>
        `).join('');
        const exRows = b.sets.map(s => `
          <li><strong>${esc(s.exercise_name)}</strong> — ${formatSets(s)}
          (objętość: ${volumeOf(s)} kg)
          ${s.video_url ? ' — <a href="' + s.video_url + '">wideo</a>' : ''}
          ${s.note ? '<br><em>💬 ' + esc(s.note) + '</em>' : ''}</li>
        `).join('');
        const prRows = prs.map(p => `<li>🏆 <strong>${esc(p.exercise_name)}</strong>: ${p.weight_kg} kg (${p.date})</li>`).join('');
        const flagRows = flags.map(f => `<li>⚠️ ${esc(f)}</li>`).join('');
        return `
          <h2 style="color:#a8875c;">${esc(c.name)}</h2>
          ${flagRows ? '<p><strong>Uwagi:</strong></p><ul>' + flagRows + '</ul>' : '<p style="color:#767066;">✅ Brak uwag.</p>'}
          ${prRows ? '<p><strong>Nowe rekordy życiowe w tym tygodniu:</strong></p><ul>' + prRows + '</ul>' : ''}
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

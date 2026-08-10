// Serwerowa funkcja Vercel — wysyła DO KLIENTA (nie do trenera) świąteczny/motywujący
// raport tygodniowy: liczba treningów siłowych, cardio, passa i zmiana wagi.
//
// W odróżnieniu od api/weekly-report.js (cron, cotygodniowe podsumowanie DLA TRENERA na
// wszystkich klientów), ten endpoint wysyła się WYŁĄCZNIE na żądanie trenera — po kliknięciu
// "Zatwierdź i wyślij" w panelu trenera. Statystyki liczone są tutaj, po stronie serwera
// (na tych samych zasadach co w index.html/trener.html), żeby e-mail i link do animowanego
// podglądu (raport-klienta.html) zawsze pokazywały te same liczby.
//
// Wymagane zmienne środowiskowe (te same, co już używa api/weekly-report.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD
// Opcjonalnie:
//   SITE_URL (domyślnie https://tm-workout-app.vercel.app) — do budowania linku w mailu.

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const MIN_CARDIO_MINUTES_FOR_COUNT = 30;
const SITE_URL = process.env.SITE_URL || 'https://tm-workout-app.vercel.app';
const MONTHS = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];

function esc(s) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDateLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function isoWeekMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  return fmtDateLocal(d);
}

function computeWeekCounts(sets, from, to) {
  const inWeek = sets.filter(s => s.logged_at >= from && s.logged_at <= to);
  const byDate = {};
  inWeek.forEach(r => {
    if (!byDate[r.logged_at]) byDate[r.logged_at] = { cardio: false, strength: false };
    if (r.duration_min !== null && r.duration_min !== undefined) {
      if (Number(r.duration_min) >= MIN_CARDIO_MINUTES_FOR_COUNT) byDate[r.logged_at].cardio = true;
    } else {
      byDate[r.logged_at].strength = true;
    }
  });
  let strength = 0, cardio = 0;
  Object.values(byDate).forEach(v => { if (v.strength) strength++; if (v.cardio) cardio++; });
  return { strength, cardio };
}

function computeStreakAsOf(allDates, weekStartStr) {
  const weekCounts = {};
  allDates.forEach(d => { const wk = isoWeekMonday(d); weekCounts[wk] = (weekCounts[wk] || 0) + 1; });
  let cursor = new Date(weekStartStr + 'T00:00:00');
  let streak = 0;
  for (let i = 0; i < 104; i++) {
    const wk = fmtDateLocal(cursor);
    if ((weekCounts[wk] || 0) >= 2) { streak++; cursor.setDate(cursor.getDate() - 7); } else break;
  }
  return streak;
}

function computeWeightDelta(meas, from, to) {
  const sorted = meas
    .filter(m => m.weight_kg !== null && m.weight_kg !== undefined)
    .slice()
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const inWeek = sorted.filter(m => m.measured_at >= from && m.measured_at <= to);
  if (!inWeek.length) return null;
  const now = inWeek[inWeek.length - 1];
  const before = sorted.filter(m => m.measured_at < from);
  const start = before.length ? before[before.length - 1] : inWeek[0];
  return { start: Number(start.weight_kg), now: Number(now.weight_kg) };
}

function formatWeekLabel(from, to) {
  const f = new Date(from + 'T00:00:00'), t = new Date(to + 'T00:00:00');
  if (f.getMonth() === t.getMonth()) return `${f.getDate()}–${t.getDate()} ${MONTHS[f.getMonth()]}`;
  return `${f.getDate()} ${MONTHS[f.getMonth()]} – ${t.getDate()} ${MONTHS[t.getMonth()]}`;
}

function buildEmailHtml({ client, strength, prevStrength, cardio, streak, weight, note, weekLabel, reportUrl }) {
  const delta = strength - prevStrength;
  const arrow = delta > 0
    ? `<span style="color:#5a8a5a;">↑ +${delta} vs poprzedni tydzień</span>`
    : (delta < 0 ? `<span style="color:#767066;">${delta} vs poprzedni tydzień</span>` : '');

  const weightBlock = weight ? (() => {
    const d = weight.now - weight.start;
    const arrow2 = d < 0 ? '↓' : (d > 0 ? '↑' : '→');
    return `
      <div style="background:#fbeae0;border-radius:12px;padding:14px 16px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;font-size:14px;color:#1a1a1a;">
          <span>Waga</span><span style="font-weight:700;">${weight.start.toFixed(1)} → ${weight.now.toFixed(1)} kg</span>
        </div>
        <div style="font-size:13px;color:#767066;margin-top:4px;">${arrow2} ${Math.abs(d).toFixed(1)} kg w tym tygodniu</div>
      </div>`;
  })() : '';

  const noteBlock = note ? `
      <div style="background:#f5f4f2;border-left:3px solid #c5a689;border-radius:0 10px 10px 0;padding:10px 14px;font-size:14px;color:#1a1a1a;font-style:italic;margin-bottom:20px;">
        "${esc(note)}" — Tomasz
      </div>` : '';

  return `
  <div style="font-family:Arial,sans-serif;background:#f5f4f2;padding:24px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e0da;border-top:5px solid #c5a689;border-radius:14px;padding:26px 24px;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:12px;letter-spacing:1px;color:#767066;text-transform:uppercase;">TM Workout · Twój tydzień</div>
        <h1 style="font-size:20px;margin:6px 0 2px;color:#1a1a1a;">Cześć ${esc(client.name)}!</h1>
        <div style="font-size:13px;color:#767066;">${weekLabel}</div>
      </div>
      <table role="presentation" width="100%" style="margin-bottom:18px;border-collapse:collapse;">
        <tr>
          <td align="center" style="background:#f5f4f2;border-radius:12px;padding:14px 6px;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#1a1a1a;">${strength}</div>
            <div style="font-size:11px;color:#767066;">treningi siłowe</div>
            <div style="font-size:11px;margin-top:4px;">${arrow}</div>
          </td>
          <td width="8" style="padding:0;"></td>
          <td align="center" style="background:#f5f4f2;border-radius:12px;padding:14px 6px;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#1a1a1a;">${cardio}</div>
            <div style="font-size:11px;color:#767066;">cardio</div>
          </td>
          <td width="8" style="padding:0;"></td>
          <td align="center" style="background:#f5f4f2;border-radius:12px;padding:14px 6px;width:33%;">
            <div style="font-size:24px;font-weight:700;color:#1a1a1a;">${streak}</div>
            <div style="font-size:11px;color:#767066;">tyg. passy 🔥</div>
          </td>
        </tr>
      </table>
      ${weightBlock}
      ${noteBlock}
      <div style="text-align:center;">
        <a href="${reportUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;font-size:14px;font-weight:500;padding:12px 26px;border-radius:8px;text-decoration:none;">Zobacz pełny raport 🎉</a>
      </div>
    </div>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { clientId, from, to, note } = req.body || {};
  if (!clientId || !from || !to) {
    return res.status(400).json({ ok: false, error: 'Brak wymaganych danych (clientId, from, to).' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: client, error: cErr } = await supabase
      .from('clients').select('id,name,email').eq('id', clientId).single();
    if (cErr || !client) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Nie znaleziono klienta.' });
    }
    if (!client.email) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Klient nie ma adresu e-mail w profilu.' });
    }

    const { data: sets, error: sErr } = await supabase
      .from('exercise_logs').select('logged_at,duration_min').eq('client_id', clientId);
    if (sErr) throw sErr;

    const { data: meas, error: mErr } = await supabase
      .from('measurements').select('measured_at,weight_kg').eq('client_id', clientId).order('measured_at');
    if (mErr) throw mErr;

    const prevMonday = new Date(from + 'T00:00:00'); prevMonday.setDate(prevMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday); prevSunday.setDate(prevMonday.getDate() + 6);
    const prevFrom = fmtDateLocal(prevMonday), prevTo = fmtDateLocal(prevSunday);

    const { strength, cardio } = computeWeekCounts(sets || [], from, to);
    const { strength: prevStrength } = computeWeekCounts(sets || [], prevFrom, prevTo);
    const allDates = Array.from(new Set((sets || []).map(s => s.logged_at)));
    const streak = computeStreakAsOf(allDates, from);
    const weight = computeWeightDelta(meas || [], from, to);

    const linkParams = new URLSearchParams({
      name: client.name || '', from, to,
      strength: String(strength), prevStrength: String(prevStrength),
      cardio: String(cardio), streak: String(streak),
      note: note || '',
    });
    if (weight) {
      linkParams.set('weightStart', String(weight.start));
      linkParams.set('weightNow', String(weight.now));
    }
    const reportUrl = `${SITE_URL}/raport-klienta.html?${linkParams.toString()}`;
    const weekLabel = formatWeekLabel(from, to);

    const html = buildEmailHtml({ client, strength, prevStrength, cardio, streak, weight, note, weekLabel, reportUrl });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `TM Workout <${process.env.GMAIL_USER}>`,
      to: client.email,
      subject: `Twój tygodniowy raport — ${weekLabel}`,
      html,
    });

    return res.status(200).json({ ok: true, strength, cardio, streak });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// Serwerowa funkcja Vercel — sprawdza hasło trenera bez ujawniania go w kodzie strony.
// Hasło ustawiasz w Vercel: Project Settings -> Environment Variables -> TRENER_PASSWORD.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const { password } = req.body || {};
  const expected = process.env.TRENER_PASSWORD;
  if (!expected) {
    return res.status(500).json({ ok: false, error: 'TRENER_PASSWORD nie jest ustawione w Vercel.' });
  }
  return res.status(200).json({ ok: password === expected });
}

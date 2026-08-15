// Serwerowa funkcja Vercel — wyszukiwarka produktów spożywczych dla sekcji "Dieta".
//
// Dlaczego przez serwer, a nie prosto z przeglądarki:
//   1. Open Food Facts wymaga sensownego User-Agent — z przeglądarki nie da się go ustawić.
//   2. Unikamy problemów z CORS.
//   3. Normalizujemy odpowiedź do JEDNEGO prostego kształtu, więc front nie musi znać
//      dziwactw zewnętrznego API (a jak kiedyś zmienimy dostawcę danych, front zostaje bez zmian).
//
// Wywołania:
//   GET /api/food-search?q=twarog          -> wyszukiwanie po nazwie
//   GET /api/food-search?barcode=59001234  -> wyszukiwanie po kodzie kreskowym (skaner)
//
// Zwracany kształt (zawsze taki sam):
//   { ok: true, products: [{ name, brand, barcode, kcal_per_100g, protein_per_100g, fat_per_100g, carbs_per_100g }] }

const UA = 'TM-Workout-App/1.0 (https://tm-workout-app.vercel.app)';
const TIMEOUT_MS = 8000;

// Open Food Facts bywa niekonsekwentne w nazwach pól (różne wersje importu danych),
// dlatego dla każdej wartości sprawdzamy kilka możliwych kluczy po kolei.
function pickNum(nutriments, keys) {
  for (const k of keys) {
    const v = nutriments?.[k];
    const n = parseFloat(v);
    if (!isNaN(n) && n >= 0) return Math.round(n * 10) / 10;
  }
  return 0;
}

function normalize(p) {
  const n = p?.nutriments || {};

  // Kalorie: preferujemy gotowe kcal, ale część produktów ma tylko kJ — wtedy przeliczamy.
  let kcal = pickNum(n, ['energy-kcal_100g', 'energy-kcal', 'energy_100g']);
  if (!kcal) {
    const kj = pickNum(n, ['energy-kj_100g', 'energy-kj']);
    if (kj) kcal = Math.round(kj / 4.184);
  }

  const name = (p?.product_name_pl || p?.product_name || '').trim();
  if (!name) return null; // produkt bez nazwy jest bezużyteczny w wyszukiwarce

  return {
    name,
    brand: (p?.brands || '').split(',')[0].trim(),
    barcode: p?.code || '',
    kcal_per_100g: kcal,
    protein_per_100g: pickNum(n, ['proteins_100g', 'proteins']),
    fat_per_100g: pickNum(n, ['fat_100g', 'fat']),
    carbs_per_100g: pickNum(n, ['carbohydrates_100g', 'carbohydrates']),
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Baza produktów odpowiedziała błędem ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const q = (req.query.q || '').toString().trim();
  const barcode = (req.query.barcode || '').toString().trim().replace(/\D/g, '');

  if (!q && !barcode) {
    return res.status(400).json({ ok: false, error: 'Podaj q albo barcode.' });
  }

  try {
    // Wyszukiwanie po kodzie kreskowym — zwraca 0 albo 1 produkt.
    if (barcode) {
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
        + `?fields=product_name,product_name_pl,brands,code,nutriments`;
      const data = await fetchJson(url);
      if (data?.status !== 1 || !data?.product) {
        return res.status(200).json({ ok: true, products: [], notFound: true });
      }
      const norm = normalize(data.product);
      return res.status(200).json({ ok: true, products: norm ? [norm] : [], notFound: !norm });
    }

    // Wyszukiwanie po nazwie — pl.openfoodfacts.org promuje produkty z polskiego rynku,
    // co ma znaczenie dla klientów kupujących w Biedronce/Lidlu/Żabce.
    const url = `https://pl.openfoodfacts.org/cgi/search.pl`
      + `?search_terms=${encodeURIComponent(q)}`
      + `&search_simple=1&action=process&json=1&page_size=25`
      + `&fields=product_name,product_name_pl,brands,code,nutriments`;
    const data = await fetchJson(url);

    const products = (data?.products || [])
      .map(normalize)
      .filter(Boolean)
      // Produkty bez kalorii nie nadają się do liczenia — nie zaśmiecamy nimi listy.
      .filter(p => p.kcal_per_100g > 0)
      .slice(0, 20);

    return res.status(200).json({ ok: true, products });
  } catch (err) {
    console.error('food-search:', err);
    const aborted = err.name === 'AbortError';
    return res.status(200).json({
      ok: false,
      products: [],
      error: aborted
        ? 'Baza produktów nie odpowiedziała na czas. Spróbuj ponownie albo dodaj produkt ręcznie.'
        : 'Nie udało się połączyć z bazą produktów. Możesz dodać produkt ręcznie.',
    });
  }
}

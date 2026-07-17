// Katalog partii mięśniowych i ćwiczeń — używany w panelu klienta do wyboru ćwiczenia z listy
// (zamiast wpisywania z ręki), żeby nazwy były spójne i dało się poprawnie liczyć objętość
// per ćwiczenie. Możesz swobodnie dopisywać/zmieniać pozycje w tych listach.

const MUSCLE_GROUPS = {
  "Klatka piersiowa": [
    "Wyciskanie sztangi płasko",
    "Wyciskanie hantli płasko",
    "Wyciskanie sztangi skos",
    "Wyciskanie hantli skos",
    "Rozpiętki z hantlami",
    "Rozpiętki na wyciągu (crossover)",
    "Pompki",
    "Dipy na poręczach",
    "Wyciskanie na maszynie (chest press)"
  ],
  "Plecy": [
    "Podciąganie na drążku",
    "Wiosłowanie sztangą",
    "Wiosłowanie hantlą",
    "Ściąganie drążka wyciągu górnego (lat pulldown)",
    "Wiosłowanie na maszynie",
    "Martwy ciąg",
    "Pull-over"
  ],
  "Barki": [
    "Wyciskanie żołnierskie (OHP)",
    "Wyciskanie hantli nad głowę",
    "Unoszenie hantli bokiem",
    "Unoszenie hantli w opadzie (reverse fly)",
    "Unoszenie sztangi przodem",
    "Arnold press"
  ],
  "Biceps": [
    "Uginanie ramion ze sztangą",
    "Uginanie ramion z hantlami",
    "Modlitewnik (preacher curl)",
    "Uginanie na wyciągu",
    "Uginanie młotkowe (hammer curls)"
  ],
  "Triceps": [
    "Wyciskanie francuskie",
    "Prostowanie ramion na wyciągu górnym",
    "Dipy na ławce",
    "Pompki wąski chwyt",
    "Prostowanie ramienia z hantlą (kickback)"
  ],
  "Nogi — uda": [
    "Przysiad ze sztangą",
    "Przysiad przedni (front squat)",
    "Wykroki",
    "Prasa nożna (leg press)",
    "Wyprosty nóg na maszynie",
    "Uginanie nóg leżąc (leg curl)",
    "Przysiad bułgarski"
  ],
  "Nogi — łydki": [
    "Wspięcia na palce stojąc",
    "Wspięcia na palce siedząc"
  ],
  "Pośladki": [
    "Hip thrust",
    "Martwy ciąg rumuński",
    "Odwodzenie nogi w bok (maszyna)",
    "Wykroki bułgarskie"
  ],
  "Brzuch / core": [
    "Brzuszki",
    "Plank",
    "Unoszenie nóg w zwisie",
    "Ab wheel",
    "Skręty rosyjskie (russian twist)"
  ],
  "Cardio": [
    "Bieżnia",
    "Rower",
    "Wiosłowanie (erg)",
    "Orbitrek",
    "Skakanka"
  ]
};

const CUSTOM_OPTION = "__custom__";

// Cardio ma inne pola niż ćwiczenia siłowe (czas, obciążenie/poziom, wzniesienie
// zamiast serii/powtórzeń/ciężaru). Te listy mówią, które ćwiczenia cardio
// potrzebują którego dodatkowego pola.
const CARDIO_GROUP = "Cardio";
const INCLINE_EXERCISES = ["Bieżnia"];
const RESISTANCE_EXERCISES = ["Orbitrek", "Rower", "Wiosłowanie (erg)"];

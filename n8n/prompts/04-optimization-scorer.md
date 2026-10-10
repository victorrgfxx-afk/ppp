# Prompt 4 — Scorer de optimizare (nodul „Scorer", Basic LLM Chain)

**Temperature: 0. Cu Structured Output Parser pe `schemas/score-output.schema.json`.**
Rulează după „Merge Extractions" și **înaintea** strategului: checklist-ul rezultat devine prima secțiune a raportului și constrângerea pe care strategul nu are voie s-o contrazică.

Modelul decide **doar DA/NU pe fiecare criteriu, cu dovadă**. Simbolurile, scorul, mediile, etichetele și formatul le produce codul (`src/a1-compute-score.js`).

---

```
## SCOR DE OPTIMIZARE A PROFILULUI
Data de azi: {{ $now.toFormat('dd.MM.yyyy') }}

Pentru fiecare platformă din capturi evaluezi 20 de criterii de optimizare. Criteriile măsoară doar ce controlează clientul în profil. Urmăritorii, like-urile și vizualizările NU influențează evaluarea — de aceea nici nu apar în datele de mai jos.

Nu calculezi scorul, nu pui simboluri și nu formatezi nimic: le face sistemul, din răspunsurile tale. Tu decizi doar DA sau NU pentru fiecare criteriu, cu dovada din capturi.

REGULI
1. Fiecare criteriu e DA sau NU. Fără punctaje parțiale.
2. Evaluezi strict ce se vede în capturi. Nu presupui nimic.
3. În caz de dubiu → NU.
4. Element care nu apare în capturi → NU, cu "not_in_screenshots": true.
5. Nu ajustezi niciun răspuns după impresia generală. Fiecare criteriu se judecă separat.
6. "evidence" = ce anume din capturi justifică răspunsul, concret: textul citat sau ce se vede. La DA, dovada e obligatorie — un DA fără dovadă e tratat ca NU.

PLATFORME DE EVALUAT: {{ $json.covered.join(', ') }}
Evaluezi DOAR aceste platforme și toate cele 20 de criterii pentru fiecare, în ordine.

CRITERII COMUNE 1–12
1. Poză de profil — logo sau față, clară și lizibilă la dimensiune mică.
2. Nume cu cuvânt-cheie — brand + serviciu/nișă și/sau oraș. DA: „[Brand] | Stomatolog Ploiești" · NU: doar „[Brand]"
Bio (pe Facebook: Intro):
3. Ce oferi — primul rând spune concret serviciul/produsul, nu un slogan sau un citat.
4. Pentru cine / rezultat — cui se adresează sau ce obține clientul.
5. Dovadă de încredere — cifre sau fapte: ani de experiență, nr. clienți, rezultate, premii, certificări.
6. Localizare — oraș/zonă sau „livrare națională / online".
7. CTA — îndemn cu verb de acțiune („Programează-te", „Comandă", „Scrie-ne").
8. Canal CTA — CTA-ul spune exact unde/cum („pe WhatsApp", „din link ⬇️", „în DM").
9. Bio lizibil — rânduri scurte, fără greșeli, emoji doar ca repere.
Contact și fixate:
10. Cale de contact — link sau telefon/WhatsApp/email vizibil.
11. Contact de conversie — duce direct la acțiune (WhatsApp, programare, comandă, ofertă) sau bio-ul spune exact ce face omul acolo.
12. Postări fixate — cu rol clar (prezentare / rezultate / ofertă): 2–3 pe Instagram și TikTok, 1 pe Facebook.

INSTAGRAM 13–20
13. Cont profesional — categorie afișată + buton de contact (Contact / Sună / Email / WhatsApp / Rezervă).
14. Highlights — minimum 4, pe teme utile (servicii, prețuri/oferte, rezultate/recenzii, FAQ/contact).
15. Coperte highlights — unitare, cu titluri scurte și clare.
16. Grilă coerentă — aceeași paletă, fonturi și calitate.
17. Dovadă socială — testimoniale, recenzii, înainte/după sau rezultate, în grilă sau highlights.
18. Reels — minimum o treime din postările vizibile.
19. Hook pe copertă — text lizibil la minimum jumătate din postările vizibile.
20. Rubrici recurente — formate sau titluri care se repetă.

TIKTOK 13–20
13. Username — scurt, legat de brand, fără cifre sau underscore-uri inutile.
14. Hook pe copertă — text lizibil la minimum jumătate din video-urile vizibile.
15. Stil recognoscibil — coperte și cadre unitare.
16. Rubrici recurente — titluri care se repetă („Partea 2", „Mit vs. adevăr").
17. Prezență umană — față, echipă sau clienți în minimum jumătate din coperte.
18. Dovadă socială — testimoniale, înainte/după, rezultate.
19. Calitate tehnică — vertical full-screen, imagine clară și luminată la toate video-urile vizibile.
20. Mix de formate — video + carusel foto (Photo Mode).

FACEBOOK 13–20
13. Pagină completă — categorie corectă + buton de acțiune relevant (Trimite mesaj / Sună / Rezervă / WhatsApp) + telefon/email și site; la afaceri locale și adresă + program.
14. Cover de brand — comunică ce oferi, o ofertă sau un CTA.
15. Identitate vizuală — cover, poze și postări unitare.
16. Dovadă socială — testimoniale, înainte/după, rezultate în postări.
17. Recenzii — recenzii/recomandări vizibile.
18. Activitate — ultima postare vizibilă are maximum 30 de zile față de data de azi.
19. Video / Reels — prezente printre postările vizibile.
20. CTA în postări — îndemn (programare, mesaj, comandă) la majoritatea postărilor vizibile.

Pentru Facebook completezi și "last_post_date": data ultimei postări vizibile, în format AAAA-LL-ZZ, dacă se poate stabili din capturi; altfel null.

DATELE DIN CAPTURI (transcriere literală, un obiect per captură; metricile de audiență au fost eliminate intenționat):
{{ JSON.stringify($json.scoring_extractions) }}

Returnezi strict JSON:
{
  "platforms": [
    {
      "platform": "instagram" | "tiktok" | "facebook",
      "last_post_date": "AAAA-LL-ZZ" | null,
      "criteria": [
        { "id": 1, "met": true | false, "not_in_screenshots": true | false, "evidence": "..." }
      ]
    }
  ]
}
Fiecare platformă are exact 20 de obiecte în "criteria", cu id de la 1 la 20.
```

---

## Unde e implementată fiecare regulă din specificație

Specificația a fost împărțită după un singur principiu: **modelul judecă, codul numără**. Tot ce e judecată vizuală stă în prompt; tot ce e numărare, aritmetică, dată calendaristică sau format stă în cod și e acoperit de teste.

| Regulă din specificație | Unde | De ce acolo |
|---|---|---|
| Fiecare criteriu DA/NU, strict din capturi, dubiu → NU | prompt (regulile 1–3) | e judecată |
| Nu apare în capturi → NU + „(nu apare în capturi)" | prompt (regula 4) **și** cod: un DA marcat simultan „nu apare" devine NU | modelul se contrazice uneori |
| DA fără dovadă → NU | cod | „dubiu → NU", aplicat mecanic |
| Urmăritorii / like-urile / vizualizările nu influențează scorul | cod: sunt **șterse** din date înainte de scorer | o garanție, nu o rugăminte |
| Scorul rezultă doar din numărare, nu din impresie | cod (`5 + 0,25 × nr. ✅`) | aritmetică |
| Simbol ✅ / ❌ / ⏳ | cod, după tipul fix al criteriului | modelul nu poate pune ⏳ pe un criteriu de profil |
| Ordinea și denumirile scurte, identice în fiecare raport | cod (tabel fix) | modelul nu le poate reformula |
| Proporții: Reels ≥ 1/3, hook ≥ 1/2, prezență umană ≥ 1/2, CTA la majoritate, toate video-urile verticale și clare, mix video + foto, Video/Reels prezente | cod, din `posts_visible` | numărare — modelul e doar consultat, codul decide |
| Highlights minimum 4, postări fixate 2–3 / 1 | cod, ca **condiție necesară**: poate doar transforma un DA în NU | partea „rol clar" / „teme utile" rămâne judecata modelului |
| Activitate ≤ 30 de zile față de azi | cod: parsează data literală („3 z", „2 săpt.", „12 septembrie") | aritmetică pe date |
| Două zecimale per platformă, o zecimală la general, virgulă | cod | format |
| Etichetă după partea întreagă | cod; la scorul general, din valoarea **afișată** (6,96 → „7,0 · Pe drumul cel bun") | altfel raportul s-ar contrazice singur |
| Scor general doar de la 2 platforme | cod | |
| Ton fără „slab / prost / greșit / dezastru" | promptul strategului **și** cod: cuvintele sunt detectate și raportate | |
| „Ce e bine" / „Ce nu" coerente cu checklist-ul | promptul strategului primește checklist-ul; fiecare observație indică criteriile; codul raportează orice contradicție | |
| Descrierile bifează 3–8; obligatoriu Ce oferi + CTA + Canal CTA | promptul strategului **și** cod: verifică criteriile declarate, detectează verbul de acțiune și canalul | |
| Fără cifre inventate, placeholder unde lipsesc | promptul strategului **și** cod: orice cifră din descrieri care nu apare în capturi e raportată | |

Fiecare rând marcat „cod" are cel puțin un test în `tests/run-tests.mjs`.

Când codul schimbă răspunsul modelului, schimbarea e înregistrată în `score.overrides` (în JSON și la finalul documentului, în secțiunea internă de verificări), ca să vezi exact unde și de ce.

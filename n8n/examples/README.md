# Exemplu reproductibil: `replay-dentist/`

Un set complet de răspunsuri de model, scrise manual pentru nișa `dentist`, ca să poți rula **ambii agenți end-to-end fără nicio cheie API** și să vezi exact ce livrează sistemul.

```bash
node n8n/local/run.mjs ideas --niche dentist --client "Cabinet Dentar Aria" \
  --count 24 --per-slice 12 --year 2026 --replay n8n/examples/replay-dentist

node n8n/local/run.mjs audit --client "Cabinet Dentar Aria" --niche dentist \
  --screens n8n/examples/replay-dentist --replay n8n/examples/replay-dentist --today 2026-10-10
```

## Ce conține
| Fișier | Rol |
|---|---|
| `slice-1.json` | ianuarie · TikTok · short video · TOFU · Educație — 12 idei |
| `slice-2.json` | mai · Instagram · carusel · MOFU · Autoritate și dovezi — 12 idei |
| `slice-3.json` | septembrie · Facebook · postare statică · BOFU · Behind the scenes — 12 idei |
| `vision.json` | 3 extracții de profil (Instagram / TikTok / Facebook) ale unui cabinet fictiv, în schema completă |
| `scorer.json` | răspunsul scorer-ului: DA/NU + dovadă pe fiecare din cele 20 de criterii, per platformă |
| `strateg.json` | auditul complet, coerent cu checklist-ul: fiecare observație indică criteriile la care se referă |

Rezultatul așteptat al scorului (cu `--today 2026-10-10`, pentru că „Activitate" depinde de dată):

| Platformă | Scor | Potențial |
|---|---|---|
| Instagram | 6,00 · Bază pusă | 9,00 |
| TikTok | 7,25 · Pe drumul cel bun | 9,00 |
| Facebook | 5,25 · Potențial neexploatat | 8,50 |
| **General** | **6,2 · Bază pusă** | **8,8** |

## De ce e util
- **Vezi livrabilul** înainte să plătești un singur token.
- **Reglezi pragurile de deduplicare** peste exact același set de idei, fără să regenerezi.
- **Ai un etalon de calitate**: când rulezi cu un model real, compari ce iese cu ce e aici. Dacă e vizibil mai slab, problema e în model sau în brief, nu în lanț.

## Ce a scos la iveală
Prima versiune a acestui set avea două descrieri peste limita de caractere (165/150 pe Instagram, 106/101 pe Facebook) și un număr de telefon inventat. Codul le-a prins pe toate; varianta actuală e cea corectată. Singurele avertismente rămase sunt cele două placeholdere (`[ani experiență]`, `[nr. pacienți]`), lăsate intenționat: arată cum trebuie tratată o cifră care nu apare în capturi.

> Datele sunt fictive: cabinetul, cifrele și numărul de telefon nu există. Nu le folosi ca reper de piață.

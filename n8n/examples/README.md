# Exemplu reproductibil: `replay-dentist/`

Un set complet de răspunsuri de model, scrise manual pentru nișa `dentist`, ca să poți rula **ambii agenți end-to-end fără nicio cheie API** și să vezi exact ce livrează sistemul.

```bash
node n8n/local/run.mjs ideas --niche dentist --client "Cabinet Dentar Aria" \
  --count 24 --per-slice 12 --year 2026 --replay n8n/examples/replay-dentist

node n8n/local/run.mjs audit --client "Cabinet Dentar Aria" --niche dentist \
  --screens <orice folder cu 3 imagini> --replay n8n/examples/replay-dentist
```

## Ce conține
| Fișier | Rol |
|---|---|
| `slice-1.json` | ianuarie · TikTok · short video · TOFU · Educație — 12 idei |
| `slice-2.json` | mai · Instagram · carusel · MOFU · Autoritate și dovezi — 12 idei |
| `slice-3.json` | septembrie · Facebook · postare statică · BOFU · Behind the scenes — 12 idei |
| `vision.json` | 3 extracții de profil (Instagram / TikTok / Facebook) ale unui cabinet fictiv |
| `strateg.json` | auditul complet produs din acele extracții |

## De ce e util
- **Vezi livrabilul** înainte să plătești un singur token.
- **Reglezi pragurile de deduplicare** peste exact același set de idei, fără să regenerezi.
- **Ai un etalon de calitate**: când rulezi cu un model real, compari ce iese cu ce e aici. Dacă e vizibil mai slab, problema e în model sau în brief, nu în lanț.

## Ce a scos la iveală
Rulat pe acest set, sistemul a raportat două descrieri peste limita de caractere — 165/150 pe Instagram și 106/101 pe Facebook — deși textul modelului nu le semnala. De asta numărătoarea se face în cod, nu în prompt.

> Datele sunt fictive: cabinetul, cifrele și numărul de telefon nu există. Nu le folosi ca reper de piață.

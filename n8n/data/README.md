# Date de referință

## `international-days-seed.csv`
Seed pentru tab-ul `ZileInternationale` din spreadsheet-ul `Agency OS`. Importă-l în Google Sheets (File → Import → Upload → Replace current sheet).

**Coloane**
| Coloană | Rol |
|---|---|
| `date` | `MM-DD`. Pentru zilele mobile (`movable=true`) e data aproximativă din anul curent — se recalculează în Code node. |
| `name_ro` | numele afișat în prompt |
| `type` | `international` / `national` / `religios` / `comercial` / `nisa` |
| `niches` | nișele pentru care e relevantă; `all` = generală. Filtrul se aplică în „Build Slice Plan". |
| `movable` | `true` = data variază anual (Ziua Mamei, Black Friday, Ziua Mondială a Habitatului) |
| `confidence` | `high` = dată stabilă și larg recunoscută; `medium` = **verific-o înainte de a o folosi la un client** |
| `note` | unghiul editorial sau avertismentul |

**Important, citește o dată:** lista e un punct de plecare curat, nu o sursă de adevăr certificată. Înainte de prima rulare la client:
1. Verifică toate rândurile cu `confidence=medium`.
2. Recalculează zilele `movable=true` pentru anul în curs.
3. Adaugă zilele specifice nișelor tale — coloana `niche_days` din `NicheBriefs` e locul unde intră cele foarte specifice.

Sărbătorile legale și religioase (inclusiv Paștele ortodox, mobil) **nu** se pun aici — vin automat din API:
`https://date.nager.at/api/v3/PublicHolidays/{an}/RO` (testat, `localName` în română) sau `https://nagerholidays.com/api/v4/Holidays/RO/{an}`.

## `niches/` — cele 4 nișe

`dentist.json`, `imobiliare.json`, `horeca.json`, `fitness.json`. Fiecare e un rând complet din tab-ul `NicheBriefs`, scris pentru piața din România.

Exportă-le pentru Google Sheets:
```bash
node n8n/local/run.mjs briefs      # → output/niche-briefs.csv
```

Câmpul cu cel mai mare impact asupra calității este `seed_examples` — 8 idei bune, concrete, scrise pentru nișa respectivă. Modelul imită tiparul lor, nu descrierea abstractă a tonului.

Câmpul `forbidden` nu e decorativ: intră în prompt ca regulă dură și e construit pe riscurile reale ale fiecărui domeniu — promisiuni de rezultat în medical, sfaturi juridice fără notar și criterii discriminatorii la chiriași în imobiliare, revendicări nutriționale și alergeni în HoReCa, „X kg în Y zile" și body shaming în fitness.

**Nișă nouă:** copiază fișierul cel mai apropiat ca structură, rescrie conținutul, rulează `run.mjs briefs`. Un test verifică automat că toate briefurile au câmpurile obligatorii și minimum 8 `seed_examples`.

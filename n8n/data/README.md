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

## `niche-brief-example-dentist.json`
Șablonul complet pentru un rând din `NicheBriefs`. Copiază structura pentru celelalte 3 nișe.
Câmpul cu cel mai mare impact asupra calității este `seed_examples` — 8 idei bune scrise de tine.

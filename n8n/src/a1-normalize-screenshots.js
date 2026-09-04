// Code node: "Normalize Screenshots"  (Run Once for All Items)
// De ce exista: numele proprietatilor binare generate de Form Trigger nu sunt garantate
// intre versiuni (Capturi_de_ecran, field_0, etc). Aici le uniformizam pe cheia "data",
// un item per imagine, ca restul workflow-ului sa nu depinda de ele.

const out = [];

for (const item of $input.all()) {
  const bin = item.binary || {};
  for (const key of Object.keys(bin)) {
    out.push({
      json: {
        ...item.json,
        sourceBinaryKey: key,
        fileName: bin[key].fileName || key,
        mimeType: bin[key].mimeType || null,
      },
      binary: { data: bin[key] },
    });
  }
}

if (!out.length) {
  throw new Error('Nu s-a incarcat nicio imagine. Verifica campul "Capturi de ecran" din formular.');
}

if (out.length > 15) {
  throw new Error(`Prea multe imagini (${out.length}). Limita recomandata este 15 pe audit, altfel costul si timpul de executie explodeaza.`);
}

return out;

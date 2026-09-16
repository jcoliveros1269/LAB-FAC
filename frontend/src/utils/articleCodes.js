// frontend/src/utils/articleCodes.js

export const TYPE_CODES = {
  PETG: 'PG',
  PLA: 'PL',
  ABS: 'AB',
  ASA: 'AS',
  TPU: 'TP'
};

export const COLOR_CODES = {
  AMARILLO: 'AM01',
  'AMARILLO GIRASOL': 'AM02',
  'AMARILLO LIMON': 'AM03',
  'AMARILLO LIMON MATE': 'AM04',
  'AZUL BRUMOSO': 'AZ03',
  'AZUL CIELO MATE': 'AZ04',
  'AZUL KLEIN': 'AZ05',
  'AZUL GRISASEO': 'AZ06',
  'AZUL HIELO MATE': 'AZ07',
  'AZUL MARINO': 'AZ08',
  'AZUL MARINO MATE': 'AZ09',
  'AZUL OSCURO MATE': 'AZ10',
  'AZUL PASTEL': 'AZ01',
  'AZUL REY': 'AZ02',
  BEIGE: 'BG01',
  'BEIGE OSCURO': 'BG02',
  BLANCO: 'BL00',
  'BLANCO HUESO MATE': 'BL04',
  'BLANCO JADE': 'BL02',
  'BLANCO MARFIL MATE': 'BL03',
  'BLANCO MENTA': 'BL01',
  DORADO: 'GD01',
  'BRONCE SEDA': 'CB01',
  'CARAMELO MATE': 'CR01',
  'CARBON MATE': 'CN01',
  'CHOCOLATE OSCURO MATE': 'CH01',
  CIAN: 'CI01',
  'CIRUELA MATE': 'CL01',
  GRANITO: 'GT01',
  GRIS: 'GR01',
  'GRIS CENIZA MATE': 'GR02',
  'GRIS NARDO MATE': 'GR03',
  'GRIS OSCURO': 'GR04',
  MAGENTA: 'MG01',
  MARMOL: 'MM01',
  'MARMOL AMARILLO': 'MM02',
  'MARMOL VERDE': 'MM03',
  'MARMOL GRIS': 'MM04',
  MARRON: 'MN01',
  'MARRON CACAO': 'MN02',
  'MARRON DESIERTO MATE': 'MN03',
  'MARRON LATTE MATE': 'MN04',
  'MARRON OSCURO': 'MN05',
  'MARRON OSCURO MATE': 'MN06',
  MORADO: 'MR01',
  'MORADO INDIGO': 'MR02',
  'MORADO LILA MATE': 'MR03',
  NARANJA: 'NJ01',
  'NARANJA CALABAZA': 'NJ03',
  'NARANJA MANDARINA MATE': 'NJ04',
  'NARANJA NEON': 'NJ02',
  NATURAL: 'NT01',
  NEGRO: 'NE11',
  PLATEADO: 'PD01',
  'REDDISH BROWN': 'RB01',
  ROJO: 'RJ01',
  'ROJO ESCARLATA MATE': 'RJ02',
  'ROJO FRAMBUESA': 'RJ03',
  'ROJO GRANTE': 'RJ04',
  'ROJO OSCURO MATE': 'RJ05',
  'ROSA SAKURA MATE': 'RS02',
  ROSADO: 'RS03',
  'ROSADO INTENSO': 'RS04',
  'ROSADO PIEL': 'RS01',
  'TERRACOTA MATE': 'TC01',
  TURQUESA: 'TQ01',
  'VERDE BAMBU': 'VR03',
  'VERDE BRILLANTE': 'VR04',
  'VERDE CLARO': 'VR01',
  'VERDE HIERBA MATE': 'VR05',
  'VERDE MANZANA MATE': 'VR06',
  'VERDE MUERDAGO': 'VR07',
  'VERDE OSCURO MATE': 'VR08',
  'VERDE PINO': 'VR02',
  VIOLETA: 'VL01'
};

export function normalizeText(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function getTypeCode(type) {
  const norm = normalizeText(type);
  if (TYPE_CODES[norm]) return TYPE_CODES[norm];
  const letters = norm.replace(/[^A-Z]/g, '');
  return letters.length >= 2 ? letters.slice(0, 2) : (letters + 'XX').slice(0, 2);
}

export function getColorCode(color) {
  const norm = normalizeText(color);
  if (COLOR_CODES[norm]) return COLOR_CODES[norm];
  for (const [k, code] of Object.entries(COLOR_CODES)) {
    if (k === norm || k.includes(norm) || norm.includes(k)) {
      return code;
    }
  }
  const letters = norm.replace(/[^A-Z]/g, '');
  const prefix = letters.length >= 2 ? letters.slice(0, 2) : (letters + 'XX').slice(0, 2);
  return `${prefix}01`;
}

export function predictArticleCode(type, color, existingMaterials = []) {
  const tCode = getTypeCode(type);
  const cCode = getColorCode(color);
  const prefix = `${tCode}${cCode}-`;

  let maxSeq = 0;
  (existingMaterials || []).forEach(m => {
    const code = m.article_code;
    if (code && typeof code === 'string' && code.startsWith(prefix)) {
      const numPart = parseInt(code.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(2, '0');
  return `${prefix}${nextSeq}`;
}

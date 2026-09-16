# backend/app/utils/article_codes.py
import re
import unicodedata

TYPE_CODES = {
    "PETG": "PG",
    "PLA": "PL",
    "ABS": "AB",
    "ASA": "AS",
    "TPU": "TP"
}

COLOR_CODES = {
    "AMARILLO": "AM01",
    "AMARILLO GIRASOL": "AM02",
    "AMARILLO LIMON": "AM03",
    "AMARILLO LIMON MATE": "AM04",
    "AZUL BRUMOSO": "AZ03",
    "AZUL CIELO MATE": "AZ04",
    "AZUL KLEIN": "AZ05",
    "AZUL GRISASEO": "AZ06",
    "AZUL HIELO MATE": "AZ07",
    "AZUL MARINO": "AZ08",
    "AZUL MARINO MATE": "AZ09",
    "AZUL OSCURO MATE": "AZ10",
    "AZUL PASTEL": "AZ01",
    "AZUL REY": "AZ02",
    "BEIGE": "BG01",
    "BEIGE OSCURO": "BG02",
    "BLANCO": "BL00",
    "BLANCO HUESO MATE": "BL04",
    "BLANCO JADE": "BL02",
    "BLANCO MARFIL MATE": "BL03",
    "BLANCO MENTA": "BL01",
    "DORADO": "GD01",
    "BRONCE SEDA": "CB01",
    "CARAMELO MATE": "CR01",
    "CARBON MATE": "CN01",
    "CHOCOLATE OSCURO MATE": "CH01",
    "CIAN": "CI01",
    "CIRUELA MATE": "CL01",
    "GRANITO": "GT01",
    "GRIS": "GR01",
    "GRIS CENIZA MATE": "GR02",
    "GRIS NARDO MATE": "GR03",
    "GRIS OSCURO": "GR04",
    "MAGENTA": "MG01",
    "MARMOL": "MM01",
    "MARMOL AMARILLO": "MM02",
    "MARMOL VERDE": "MM03",
    "MARMOL GRIS": "MM04",
    "MARRON": "MN01",
    "MARRON CACAO": "MN02",
    "MARRON DESIERTO MATE": "MN03",
    "MARRON LATTE MATE": "MN04",
    "MARRON OSCURO": "MN05",
    "MARRON OSCURO MATE": "MN06",
    "MORADO": "MR01",
    "MORADO INDIGO": "MR02",
    "MORADO LILA MATE": "MR03",
    "NARANJA": "NJ01",
    "NARANJA CALABAZA": "NJ03",
    "NARANJA MANDARINA MATE": "NJ04",
    "NARANJA NEON": "NJ02",
    "NATURAL": "NT01",
    "NEGRO": "NE11",
    "PLATEADO": "PD01",
    "REDDISH BROWN": "RB01",
    "ROJO": "RJ01",
    "ROJO ESCARLATA MATE": "RJ02",
    "ROJO FRAMBUESA": "RJ03",
    "ROJO GRANTE": "RJ04",
    "ROJO OSCURO MATE": "RJ05",
    "ROSA SAKURA MATE": "RS02",
    "ROSADO": "RS03",
    "ROSADO INTENSO": "RS04",
    "ROSADO PIEL": "RS01",
    "TERRACOTA MATE": "TC01",
    "TURQUESA": "TQ01",
    "VERDE BAMBU": "VR03",
    "VERDE BRILLANTE": "VR04",
    "VERDE CLARO": "VR01",
    "VERDE HIERBA MATE": "VR05",
    "VERDE MANZANA MATE": "VR06",
    "VERDE MUERDAGO": "VR07",
    "VERDE OSCURO MATE": "VR08",
    "VERDE PINO": "VR02",
    "VIOLETA": "VL01"
}

def normalize_text(text: str) -> str:
    if not text:
        return ""
    # Remove accents and convert to uppercase
    text = text.strip().upper()
    nfkd = unicodedata.normalize('NFKD', text)
    cleaned = "".join([c for c in nfkd if not unicodedata.combining(c)])
    # Normalize spaces
    return re.sub(r'\s+', ' ', cleaned).strip()

def get_type_code(material_type: str) -> str:
    norm = normalize_text(material_type)
    if norm in TYPE_CODES:
        return TYPE_CODES[norm]
    # Fallback to first 2 alphanumeric chars
    letters = re.sub(r'[^A-Z]', '', norm)
    return letters[:2] if len(letters) >= 2 else (letters + "X")[:2]

def get_color_code(color: str) -> str:
    norm = normalize_text(color)
    if norm in COLOR_CODES:
        return COLOR_CODES[norm]
    # Check partial match
    for key, code in COLOR_CODES.items():
        if key == norm or key in norm or norm in key:
            return code
    # Fallback: 2 letters of color + 01
    letters = re.sub(r'[^A-Z]', '', norm)
    prefix = letters[:2] if len(letters) >= 2 else (letters + "XX")[:2]
    return f"{prefix}01"

def generate_article_code(material_type: str, color: str, db=None) -> str:
    """
    Genera el código de artículo en formato [TIPO][COLOR]-[CONSECUTIVO]
    Ejemplo: PGBL00-01, PGBL00-02
    """
    type_code = get_type_code(material_type)
    color_code = get_color_code(color)
    base_prefix = f"{type_code}{color_code}-"

    if db is None:
        return f"{base_prefix}01"

    from app.models.inventory import RawMaterial
    # Buscar bobinas existentes con el mismo prefijo
    existing = db.query(RawMaterial.article_code).filter(
        RawMaterial.article_code.like(f"{base_prefix}%")
    ).all()

    max_seq = 0
    for row in existing:
        code_val = row[0]
        if code_val and code_val.startswith(base_prefix):
            suffix = code_val[len(base_prefix):]
            try:
                num = int(suffix)
                if num > max_seq:
                    max_seq = num
            except ValueError:
                pass

    next_seq = max_seq + 1
    return f"{base_prefix}{next_seq:02d}"

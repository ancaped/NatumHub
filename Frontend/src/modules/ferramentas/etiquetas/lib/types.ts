export type LabelOrientation = 'landscape' | 'portrait';

export type ElementType =
  | 'text'
  | 'barcode'
  | 'qrcode'
  | 'box'
  | 'line'
  | 'badge'
  | 'image'
  | 'icon';

export type BarcodeFormat = 'code128' | 'ean13' | 'code39';
export type TextFontFamily = 'Inter' | 'JetBrains Mono' | 'serif' | 'sans-serif';
export type TextAlign = 'left' | 'center' | 'right';
export type TextFontWeight = 'normal' | '500' | '600' | 'bold' | '800';

export interface TextElementProps {
  text: string;
  fontSize: number; // in pt
  fontWeight: TextFontWeight;
  fontFamily: TextFontFamily;
  textAlign: TextAlign;
  color: string;
  uppercase?: boolean;
  multiline?: boolean;
  prefix?: string;
  suffix?: string;
  isTag?: boolean;
  tagField?: string;
}

export interface BarcodeElementProps {
  value: string;
  format: BarcodeFormat;
  showText: boolean;
  barWidth?: number;
  fontSize?: number;
  textColor?: string;
}

export interface QrCodeElementProps {
  value: string;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  includeMargin?: boolean;
}

export interface BoxElementProps {
  borderWidth: number; // in mm
  borderColor: string;
  backgroundColor: string;
  borderRadius: number; // in mm
  borderStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface LineElementProps {
  orientation: 'horizontal' | 'vertical';
  strokeWidth: number;
  strokeColor: string;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface BadgeElementProps {
  text: string;
  variant: 'black' | 'outline' | 'gray';
  fontSize: number;
  fontWeight: TextFontWeight;
  uppercase?: boolean;
  borderRadius: number;
}

export interface ImageElementProps {
  src: string;
  fit: 'contain' | 'cover' | 'fill';
  opacity?: number;
}

export interface IconElementProps {
  iconName: 'leaf' | 'recycle' | 'fragile' | 'temperature' | 'shield' | 'alert' | 'flask' | 'package' | 'check' | 'droplet';
  color: string;
}

export type AnyElementProps =
  | TextElementProps
  | BarcodeElementProps
  | QrCodeElementProps
  | BoxElementProps
  | LineElementProps
  | BadgeElementProps
  | ImageElementProps
  | IconElementProps;

export interface LabelElement {
  id: string;
  type: ElementType;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  rotation?: number;
  locked?: boolean;
  zIndex: number;
  props: Record<string, any>;
}

export interface LabelSizePreset {
  id: string;
  label: string;
  width_mm: number;
  height_mm: number;
  description: string;
  isPrinterDefault?: boolean;
}

export const LABEL_SIZE_PRESETS: LabelSizePreset[] = [
  {
    id: '100x50',
    label: '100 x 50 mm (Padrão Térmica)',
    width_mm: 100,
    height_mm: 50,
    description: 'Etiqueta padrão para matéria-prima, embalagens e produtos',
    isPrinterDefault: true,
  },
  {
    id: '100x30',
    label: '100 x 30 mm',
    width_mm: 100,
    height_mm: 30,
    description: 'Etiqueta fina para gôndolas e caixas',
  },
  {
    id: '70x40',
    label: '70 x 40 mm',
    width_mm: 70,
    height_mm: 40,
    description: 'Etiqueta média para caixas de transporte',
  },
  {
    id: '50x30',
    label: '50 x 30 mm',
    width_mm: 50,
    height_mm: 30,
    description: 'Etiqueta pequena para frascaria e amostras',
  },
  {
    id: '100x150',
    label: '100 x 150 mm (Envio / Logística)',
    width_mm: 100,
    height_mm: 150,
    description: 'Etiqueta de expedição e transporte',
  },
  {
    id: 'custom',
    label: 'Personalizado',
    width_mm: 100,
    height_mm: 50,
    description: 'Defina largura e altura livremente',
  },
];

export interface LabelTemplate {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  width_mm: number;
  height_mm: number;
  orientation: LabelOrientation;
  elements_json: LabelElement[];
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type PrintLayoutMode =
  | 'roll_50x100_landscape' // Rolo padrão térmico (boca 50mm x avanço 100mm) -> Imprime Deitada
  | 'roll_100x50_landscape' // Rolo largo (boca 100mm x avanço 50mm) -> Imprime Deitada
  | 'portrait_50x100'; // Em Pé (Vertical 50x100mm)

export interface PrintConfig {
  copies: number;
  enableSequence: boolean;
  sequenceStart: number;
  sequenceTotal: number;
  sequencePadding: number;
  printLayoutMode?: PrintLayoutMode;
  /** 100 = arte no tamanho do modelo. Acima disso amplia até a borda do adesivo. */
  fillScale?: number;
}

export interface CatalogSearchItem {
  id?: string;
  code: string;
  name: string;
  type: 'produto' | 'materia_prima' | 'embalagem' | 'apoio' | 'item';
  barcode?: string;
  unit?: string;
  category?: string;
}

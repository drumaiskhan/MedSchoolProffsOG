// Automatic subject icons.
//
// Every subject (Anatomy, Physiology, Biochemistry, ...) gets its own simple
// icon and colour derived from its NAME, so nobody has to upload a thumbnail
// per subject. Matching is keyword-based and forgiving ("Gross Anatomy",
// "Human Anatomy & Embryology", "Forensic Medicine and Toxicology" ...).
//
// - A thumbnail an admin HAS uploaded for a subject still wins (the `iconUrl`
//   prop) — this only fills the gap when there isn't one.
// - Names we don't recognise still get a stable icon + colour (picked from
//   the name), and `resolveSubjectIcon(...).matched` is false so callers that
//   already have a nicer fallback (e.g. module cards) can keep it.
// - The "3D" look is pure CSS gradients + shadows (no perspective / rotateX /
//   rotateY), on purpose: see the flip-card note in index.css about real 3D
//   transforms corrupting paint on some GPUs.
import type { ComponentType, CSSProperties } from 'react';
import {
  Accessibility, Activity, Apple, Atom, Baby, Bed, Biohazard, Bone, BookOpen, Brain, BrainCircuit,
  Bug, Calculator, ChartColumn, ChartLine, ClipboardPlus, Cpu, Dna, Droplet, Droplets, Dumbbell,
  Ear, Eye, Fingerprint, FlaskConical, Gauge, Gavel, GraduationCap, Hand, HeartHandshake, HeartPulse,
  Landmark, Languages, Layers, Microscope, MessageCircleHeart, Moon, Pill, Ribbon, Salad, Scale, Scissors,
  ScanLine, ShieldPlus, Siren, Skull, Sprout, Stethoscope, Syringe, TestTubes, Thermometer, Users, Venus,
} from 'lucide-react';

type IconProps = { size?: number | string; strokeWidth?: number | string; className?: string };
export type SubjectIconComponent = ComponentType<IconProps>;

// Two glyphs lucide doesn't ship (dentistry is part of this platform: BDS).
function svgProps({ size = 24, strokeWidth = 2, className }: IconProps) {
  return {
    xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className,
    'aria-hidden': true,
  };
}
export function ToothIcon(props: IconProps) {
  return <svg {...svgProps(props)}><path d="M7.6 3.5C5.1 3.5 3.5 5.5 3.5 8c0 2.6 1.6 3.7 1.9 6.1.3 2.4.6 6.9 2.8 6.9 1.8 0 1.7-4.5 3.8-4.5s2 4.5 3.8 4.5c2.2 0 2.5-4.5 2.8-6.9.3-2.4 1.9-3.5 1.9-6.1 0-2.5-1.6-4.5-4.1-4.5-1.5 0-2.7.9-4.4.9S9.1 3.5 7.6 3.5Z" /></svg>;
}
export function LungsIcon(props: IconProps) {
  return <svg {...svgProps(props)}><path d="M12 3v8" /><path d="M12 11c-1.4 0-2.5.6-3 2M12 11c1.4 0 2.5.6 3 2" /><path d="M9 9.6c0-1.2-.7-1.7-1.6-1.4C5.3 8.9 3.5 13.5 3.5 17.7c0 1.8 1 2.8 2.6 2.8 1.9 0 2.9-1.2 2.9-3V9.6Z" /><path d="M15 9.6c0-1.2.7-1.7 1.6-1.4 2.1.7 3.9 5.3 3.9 9.5 0 1.8-1 2.8-2.6 2.8-1.9 0-2.9-1.2-2.9-3V9.6Z" /></svg>;
}

interface Rule { key: string; test: RegExp; icon: SubjectIconComponent; hue: number }

// ORDER MATTERS — specific rules first ("oral pathology" before "pathology",
// "neuroanatomy" before "anatomy", dental before everything it could overlap).
const RULES: Rule[] = [
  // Dental (BDS)
  { key: 'oral-pathology', test: /(oral|dental) (patholog|medicine|diagnos|radiolog)/, icon: ToothIcon, hue: 345 },
  { key: 'dental', test: /dental|dentist|\boral\b|tooth|teeth|endodont|periodont|prosthodont|orthodont|pedodont|operative|maxillofacial|conservative/, icon: ToothIcon, hue: 188 },
  // Basic sciences
  { key: 'neuroanatomy', test: /neuro ?anatom/, icon: Brain, hue: 285 },
  { key: 'embryology', test: /embryo|developmental/, icon: Sprout, hue: 135 },
  { key: 'histology', test: /histolog|cytolog|cell biology|tissue/, icon: Layers, hue: 312 },
  { key: 'anatomy', test: /anatom|osteolog|\bgross\b/, icon: Bone, hue: 26 },
  { key: 'physiology', test: /physiolog/, icon: Microscope, hue: 205 },
  { key: 'biochemistry', test: /bio ?chem|molecular|metabolism|medical chemistry/, icon: Dna, hue: 268 },
  { key: 'genetics', test: /genetic|genomic/, icon: Dna, hue: 248 },
  { key: 'pathology', test: /patholog/, icon: TestTubes, hue: 350 },
  { key: 'pharmacology', test: /pharmac|therapeutic|drug/, icon: Pill, hue: 152 },
  { key: 'microbiology', test: /microbio|bacteri|virolog|mycolog/, icon: Bug, hue: 92 },
  { key: 'parasitology', test: /parasit|helminth|protozo|entomolog/, icon: Biohazard, hue: 22 },
  { key: 'immunology', test: /immun|serolog/, icon: ShieldPlus, hue: 175 },
  { key: 'infectious', test: /infectious|tropical|communicable/, icon: Thermometer, hue: 8 },
  { key: 'forensic', test: /forensic|medico ?legal|legal medicine|jurisprudence/, icon: Fingerprint, hue: 228 },
  { key: 'toxicology', test: /toxic|poison/, icon: Skull, hue: 275 },
  { key: 'family', test: /family medicine|primary care|general practice/, icon: HeartHandshake, hue: 338 },
  { key: 'community', test: /community|public health|\bpsm\b|preventive|social medicine|health promotion|environmental|occupational/, icon: Users, hue: 172 },
  { key: 'epidemiology', test: /epidemiolog|biostat|statistic/, icon: ChartLine, hue: 215 },
  { key: 'research', test: /research|methodolog|evidence/, icon: ChartColumn, hue: 232 },
  { key: 'behavioural', test: /behavio|psycholog|sociolog|anthropolog|communication skill|soft skill/, icon: MessageCircleHeart, hue: 328 },
  // Clinical
  { key: 'psychiatry', test: /psychiat|mental health/, icon: BrainCircuit, hue: 262 },
  { key: 'neurology', test: /neurolog|neuro ?sci|neuro|\bcns\b|nervous|brain/, icon: Brain, hue: 292 },
  { key: 'cardiology', test: /cardi|heart|\bcvs\b|circulat/, icon: HeartPulse, hue: 356 },
  { key: 'respiratory', test: /respirat|pulmon|chest|\blungs?\b|thoracic/, icon: LungsIcon, hue: 196 },
  { key: 'gastro', test: /gastro|\bgit\b|\bgi\b|digest|hepat|liver|alimentary|abdomen/, icon: Salad, hue: 82 },
  { key: 'renal', test: /renal|nephro|urin|urolog|kidney|genito ?urin/, icon: Droplets, hue: 184 },
  { key: 'endocrine', test: /endocrin|diabet|hormon/, icon: Gauge, hue: 38 },
  { key: 'haematology', test: /haemat|hemat|blood|transfusion/, icon: Droplet, hue: 0 },
  { key: 'oncology', test: /oncolog|cancer|neoplas|tumou?r/, icon: Ribbon, hue: 322 },
  { key: 'rheumatology', test: /rheumat|arthritis|connective tissue|musculo|\bmsk\b|locomotor/, icon: Dumbbell, hue: 14 },
  { key: 'orthopaedics', test: /orthop|fracture|trauma/, icon: Accessibility, hue: 246 },
  { key: 'surgery', test: /surg/, icon: Scissors, hue: 166 },
  { key: 'obgyn', test: /obstet|gynae|gyne|midwif|maternal|reproduct|ob ?gyn|women/, icon: Venus, hue: 334 },
  { key: 'paediatrics', test: /paed|pedia|child|neonat|adolesc/, icon: Baby, hue: 342 },
  { key: 'ophthalmology', test: /ophthal|\beyes?\b|vision|optom/, icon: Eye, hue: 202 },
  { key: 'ent', test: /\bent\b|otolaryng|ear nose|otorhino|hearing|audiolog|\bear\b/, icon: Ear, hue: 30 },
  { key: 'dermatology', test: /dermat|\bskin\b|venereol|integument/, icon: Hand, hue: 16 },
  { key: 'anaesthesia', test: /anaesth|anesth|critical care|\bicu\b|intensive|pain/, icon: Syringe, hue: 210 },
  { key: 'emergency', test: /emergenc|casualty|resuscitat|first aid/, icon: Siren, hue: 358 },
  { key: 'radiology', test: /radiolog|imaging|x ?ray|ultrasound|nuclear/, icon: ScanLine, hue: 232 },
  { key: 'geriatrics', test: /geriatr|elderly|palliative/, icon: HeartHandshake, hue: 26 },
  { key: 'ethics', test: /ethic|professionalism|deontolog|medical law/, icon: Scale, hue: 252 },
  { key: 'medicine', test: /^(general |internal |clinical |adult )?medicine$|internal medicine|general medicine|clinical medicine/, icon: Stethoscope, hue: 172 },
  // Pre-clinical / general-education subjects
  { key: 'rehab', test: /physio(?!log)|rehab|sports|exercise/, icon: Dumbbell, hue: 12 },
  { key: 'biophysics', test: /physic|biophys|radiation/, icon: Atom, hue: 240 },
  { key: 'chemistry', test: /chemistry|chemical/, icon: FlaskConical, hue: 176 },
  { key: 'biology', test: /biolog|zoolog|botan|life science/, icon: Sprout, hue: 128 },
  { key: 'language', test: /english|language|urdu|arabic|communication/, icon: Languages, hue: 208 },
  { key: 'islamiat', test: /islam|quran|religio|ethics of/, icon: Moon, hue: 162 },
  { key: 'studies', test: /pakistan|pak studies|history|civics|social studies|studies/, icon: Landmark, hue: 32 },
  { key: 'computing', test: /comput|informatic|\bit\b|technology/, icon: Cpu, hue: 236 },
  { key: 'maths', test: /math|calculus|algebra/, icon: Calculator, hue: 218 },
  { key: 'nutrition', test: /nutrition|dietetic|\bdiet\b|food/, icon: Apple, hue: 6 },
  { key: 'skills', test: /nursing|patient care|clinical skills|skills lab|\bskills\b/, icon: ClipboardPlus, hue: 178 },
  { key: 'sleep', test: /sleep/, icon: Bed, hue: 250 },
  { key: 'medicine-generic', test: /medicine|clinical/, icon: Stethoscope, hue: 172 },
];

const FALLBACK_ICONS: SubjectIconComponent[] = [Stethoscope, BookOpen, Activity, GraduationCap, Microscope, HeartPulse, Gavel];
const FALLBACK_HUES = [172, 205, 262, 28, 340, 152, 232];

function normalize(name: string): string {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export interface ResolvedSubjectIcon { key: string; icon: SubjectIconComponent; hue: number; matched: boolean }

export function resolveSubjectIcon(name: string | null | undefined): ResolvedSubjectIcon {
  const n = normalize(name ?? '');
  for (const rule of RULES) if (rule.test.test(n)) return { key: rule.key, icon: rule.icon, hue: rule.hue, matched: true };
  const h = hashString(n || 'subject');
  return { key: 'fallback', icon: FALLBACK_ICONS[h % FALLBACK_ICONS.length], hue: FALLBACK_HUES[(h >> 3) % FALLBACK_HUES.length], matched: false };
}

// Yellow/lime hues are much lighter to the eye than blues/purples — darken
// them a touch so the white glyph stays readable on every tile.
function tileLightness(hue: number): { top: number; bottom: number } {
  const warm = hue >= 40 && hue <= 130;
  return warm ? { top: 42, bottom: 30 } : { top: 56, bottom: 40 };
}

export function tileStyle(hue: number): CSSProperties {
  const { top, bottom } = tileLightness(hue);
  const h2 = (hue + 16) % 360;
  return {
    background: `radial-gradient(120% 90% at 28% 12%, hsl(${hue} 95% 78% / .55), transparent 58%), linear-gradient(150deg, hsl(${hue} 80% ${top}%), hsl(${h2} 78% ${bottom}%))`,
    boxShadow: `inset 0 1.5px 0 hsl(0 0% 100% / .55), inset 0 -4px 8px hsl(${hue} 80% 18% / .38), 0 10px 18px -8px hsl(${hue} 85% 40% / .65), 0 2px 3px hsl(${hue} 60% 15% / .22)`,
  };
}

export type SubjectIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const SIZES: Record<SubjectIconSize, { box: number; icon: number }> = {
  xs: { box: 28, icon: 14 }, sm: { box: 36, icon: 18 }, md: { box: 48, icon: 24 }, lg: { box: 60, icon: 30 }, xl: { box: 84, icon: 42 },
};

// Glossy tile with the subject's icon. Pass the subject's uploaded `iconUrl`
// (if any) and it is shown instead of the generated icon.
export function SubjectIcon({ name, iconUrl, size = 'md', className = '', title }: { name: string; iconUrl?: string | null; size?: SubjectIconSize; className?: string; title?: string }) {
  const { icon: Icon, hue } = resolveSubjectIcon(name);
  const s = SIZES[size];
  const box: CSSProperties = { width: s.box, height: s.box };
  if (iconUrl) {
    return <span className={`subject-tile ${className}`} style={{ ...box, boxShadow: `0 8px 16px -8px hsl(${hue} 60% 30% / .45)` }} title={title}>
      <img src={iconUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
    </span>;
  }
  return <span className={`subject-tile ${className}`} style={{ ...box, ...tileStyle(hue) }} title={title} data-subject-icon={name}>
    <span className="subject-tile__gloss" />
    <Icon size={s.icon} strokeWidth={2.1} className="subject-tile__icon" />
  </span>;
}

// Soft, big, low-contrast copy of the icon for card corners.
export function SubjectWatermark({ name, className = '' }: { name: string; className?: string }) {
  const { icon: Icon, hue } = resolveSubjectIcon(name);
  return <span aria-hidden="true" className={`pointer-events-none absolute ${className}`} style={{ color: `hsl(${hue} 70% 50% / .1)` }}><Icon size={120} strokeWidth={1.4} /></span>;
}

export function subjectAccent(name: string, alpha = 1): string {
  return `hsl(${resolveSubjectIcon(name).hue} 75% 50% / ${alpha})`;
}

// Used on the public landing page / sign-in panel.
export const SUBJECT_SHOWCASE: string[] = [
  'Anatomy', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 'Microbiology', 'Forensic Medicine',
  'Community Medicine', 'Medicine', 'Surgery', 'Paediatrics', 'Gynaecology & Obstetrics', 'Ophthalmology', 'ENT',
  'Dermatology', 'Psychiatry', 'Radiology', 'Anaesthesia', 'Dental Materials', 'Behavioural Sciences',
];

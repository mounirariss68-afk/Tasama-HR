import type { ClientInfo } from '../app/state';

/** Downloads are rendered from the data already authorised and displayed by the app.
 * No document or employee data is sent to an outside rendering service. */
export type DocumentSpec = {
  title: string;
  reference: string;
  body: string;
  language?: string;
  date?: string | null;
  status?: string;
  addressee?: string;
  employee?: string;
};
export type DocumentBrand = {
  logo: string; website: string; color: string; logoBackground: string;
};
export const DOCUMENT_BRANDS: Record<string, DocumentBrand> = {
  roshn: { logo: 'roshn-wordmark.png', website: 'https://www.roshn.sa', color: '#02231F', logoBackground: '#FFFFFF' },
  riyadhair: { logo: 'riyadhair-wordmark.png', website: 'https://www.riyadhair.com', color: '#250854', logoBackground: '#FFFFFF' },
  redsea: { logo: 'redsea-wordmark.png', website: 'https://www.redseaglobal.com', color: '#0A1D2D', logoBackground: '#FFFFFF' },
  seven: { logo: 'seven-wordmark.png', website: 'https://seven.sa', color: '#502C80', logoBackground: '#FFFFFF' },
  saudicoffee: { logo: 'saudicoffee-wordmark.png', website: 'https://www.saudicoffee.com', color: '#203B31', logoBackground: '#FFFFFF' },
  tasama: { logo: 'tasama.png', website: '', color: '#10069E', logoBackground: '#FFFFFF' },
};
export const TASAMA_ISSUER = { key: 'tasama', name: 'Tasama', name_ar: 'تساما', code: 'TAS' } as ClientInfo;
export const brandAsset = (brand: DocumentBrand) => `${import.meta.env.BASE_URL}brands/${brand.logo}`;
export const documentBrand = (client: ClientInfo) => {
  const brand = DOCUMENT_BRANDS[client.key];
  if (!brand) throw new Error(`No document letterhead configured for ${client.name}.`);
  return brand;
};
export const LETTER_NAMES: Record<string, [string, string]> = {
  SALARY_CERTIFICATE: ['Salary certificate', 'شهادة راتب'],
  EMPLOYMENT_CERTIFICATE: ['Employment certificate', 'شهادة عمل'],
  SALARY_TRANSFER: ['Salary transfer letter', 'خطاب تحويل راتب'],
  NOC_TRAVEL: ['No-objection letter for travel', 'خطاب عدم ممانعة للسفر'],
  NOC_DRIVING: ['Introduction letter', 'خطاب تعريف'],
  EXPERIENCE: ['Experience letter', 'شهادة خبرة'],
};
export function letterDocument(d: any): DocumentSpec {
  const ar = d.language === 'ar';
  return {
    title: LETTER_NAMES[d.type]?.[ar ? 1 : 0] ?? d.type ?? (ar ? 'خطاب' : 'Letter'),
    reference: d.document_number ?? d.reference,
    body: d.body,
    date: d.issued_at,
    language: d.language,
    status: d.status,
    addressee: d.addressee,
  };
}
export function payslipDocument(p: any, employee: string, language: string): DocumentSpec {
  const ar = language === 'ar';
  const amount = (v: unknown) => new Intl.NumberFormat(ar ? 'ar-SA' : 'en-SA', { style: 'currency', currency: 'SAR' }).format(Number(v));
  return {
    title: ar ? 'قسيمة راتب' : 'Payslip', reference: `PAY-${p.period_name}-${p.id}`,
    date: p.pay_date, language, status: 'PAYROLL RECORD', employee,
    body: [
      `${ar ? 'الموظف' : 'Employee'}: ${employee}`,
      `${ar ? 'الفترة' : 'Period'}: ${p.period_name}`,
      ...p.lines.map((l: any) => `${l.name}: ${l.kind === 'DEDUCTION' ? '−' : ''}${amount(l.amount)}`),
      '', `${ar ? 'الإجمالي' : 'Gross'}: ${amount(p.gross)}`,
      `${ar ? 'الاستقطاعات' : 'Deductions'}: ${amount(p.deductions)}`,
      `${ar ? 'الصافي' : 'Net'}: ${amount(p.net)}`, '',
      ar ? 'نتيجة رواتب تجريبية. اشتراكات صاحب العمل معروضة ولا تدفع للموظف.' : 'Synthetic payroll result. Employer contributions are shown but not paid to you.',
    ].join('\n'),
  };
}
export function invoiceDocument(i: any, language: string): DocumentSpec {
  const amount = (v: unknown) => new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'SAR' }).format(Number(v));
  return {
    title: language === 'ar' ? 'فاتورة خدمات' : 'Service invoice',
    reference: i.number, language, status: i.status, addressee: i.short, date: i.issued_at,
    body: [
      `Client / العميل: ${i.short}`, `Period / الفترة: ${i.period}`, `Headcount / عدد الموظفين: ${i.headcount}`,
      `Base fee / الرسوم الأساسية: ${amount(i.base_fee)}`,
      `Hiring fees / رسوم التوظيف: ${amount(i.hire_fees)}`,
      `Service credits / أرصدة الخدمة: ${amount(i.credits)}`,
      `Total incl. VAT / الإجمالي شامل الضريبة: ${amount(i.total)}`,
      '', ...(i.notes ?? []),
      '', 'Illustrative demo invoice — not a tax invoice. / فاتورة تجريبية وليست فاتورة ضريبية.',
    ].join('\n'),
  };
}

/** Complete downloadable evidence for any workflow, including generated reports
 * which do not have a dedicated letter or payslip record. */
export function caseDocument(c: any, language: string): DocumentSpec {
  const ar = language === 'ar';
  const lines: string[] = [
    ar ? c.title_ar ?? c.title : c.title,
    `${ar ? 'الموظف' : 'Employee'}: ${ar ? c.subject_name_ar ?? c.subject_name : c.subject_name}`,
    `${ar ? 'سير العمل' : 'Workflow'}: ${c.workflow_id}`,
    `${ar ? 'الحالة' : 'Status'}: ${c.status}`, '',
  ];
  const flatten = (value: unknown, label = '', depth = 0) => {
    if (value == null || value === '') return;
    if (Array.isArray(value)) {
      if (label) lines.push(label);
      value.forEach((item, i) => flatten(item, `#${i + 1}`, depth + 1));
    } else if (typeof value === 'object') {
      if (label) lines.push(`${label}:`);
      Object.entries(value).forEach(([key, item]) => flatten(item, key.replace(/_/g, ' '), depth + 1));
    } else {
      lines.push(`${'  '.repeat(Math.min(depth, 3))}${label ? `${label}: ` : ''}${String(value)}`);
    }
  };
  lines.push(ar ? 'بيانات الطلب' : 'Request details');
  flatten(c.payload);
  lines.push('', ar ? 'النتائج' : 'Results');
  flatten(c.result);
  lines.push('', ar ? 'خطوات التنفيذ' : 'Workflow steps');
  for (const step of c.steps ?? []) {
    lines.push(`${ar ? step.label_ar ?? step.label : step.label}: ${step.status}`);
    if (step.decision) lines.push(step.decision);
    flatten(step.outputs);
  }
  lines.push('', ar ? 'سجل القرارات' : 'Decision trail');
  for (const entry of c.trail ?? []) lines.push(`${entry.at} · ${entry.actor_name ?? entry.actor_id ?? ''} · ${ar ? entry.summary_ar ?? entry.summary : entry.summary}${entry.citation ? ` (${entry.citation})` : ''}`);
  return {
    title: ar ? 'تقرير الطلب' : 'Case report', reference: c.ref,
    body: lines.filter(value => value !== undefined).join('\n'), language,
    date: c.closed_at ?? c.created_at, status: c.status,
  };
}

const PAGE_W = 1240, PAGE_H = 1754;
const MARGIN = 105, TEXT_W = PAGE_W - MARGIN * 2, LINE_H = 38;

function loadLogo(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The company logo could not be loaded. Please retry.'));
    image.src = src;
  });
}
function fitImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}
/** Wrap on actual browser font metrics; split long tokens without dropping characters. */
function wrap(ctx: CanvasRenderingContext2D, value: string, width: number) {
  if (!value) return [''];
  const lines: string[] = [];
  let line = '';
  for (const token of value.split(/(\s+)/)) {
    if (ctx.measureText(line + token).width <= width) { line += token; continue; }
    if (line.trim()) lines.push(line.trimEnd());
    line = token.trimStart();
    if (ctx.measureText(line).width <= width) continue;
    let chunk = '';
    for (const char of Array.from(line)) {
      if (ctx.measureText(chunk + char).width > width && chunk) { lines.push(chunk); chunk = ''; }
      chunk += char;
    }
    line = chunk;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}
function drawLine(ctx: CanvasRenderingContext2D, value: string, y: number, { size = 25, weight = 400, color = '#28363B', right = false } = {}) {
  ctx.font = `${weight} ${size}px Alexandria, Inter, sans-serif`;
  ctx.fillStyle = color;
  ctx.direction = right ? 'rtl' : 'ltr';
  ctx.textAlign = right ? 'right' : 'left';
  ctx.fillText(value, right ? PAGE_W - MARGIN : MARGIN, y);
}
function drawHeader(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, client: ClientInfo, doc: DocumentSpec, brand: DocumentBrand) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = brand.color; ctx.fillRect(0, 0, PAGE_W, 15);
  ctx.fillStyle = brand.logoBackground; ctx.fillRect(MARGIN, 75, 255, 180);
  fitImage(ctx, logo, MARGIN + 20, 95, 215, 140);
  drawLine(ctx, client.name, 120, { size: 28, weight: 600, color: brand.color, right: true });
  drawLine(ctx, client.name_ar, 170, { size: 26, color: brand.color, right: true });
  drawLine(ctx, 'Human Resources / الموارد البشرية', 220, { size: 19, color: '#67747C', right: true });
  ctx.fillStyle = brand.color; ctx.fillRect(MARGIN, 295, TEXT_W, 3);
  ctx.font = '600 35px Alexandria, Inter, sans-serif';
  const ar = doc.language === 'ar';
  let y = 365;
  for (const line of wrap(ctx, doc.title, TEXT_W)) {
    drawLine(ctx, line, y, { size: 35, weight: 600, color: brand.color, right: ar }); y += 48;
  }
  drawLine(ctx, `${ar ? 'المرجع' : 'Reference'}: ${doc.reference}`, y + 16, { size: 19, right: ar });
  y += 48;
  const date = doc.date ? new Date(doc.date) : null;
  const formattedDate = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(ar ? 'ar-SA' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  drawLine(ctx, `${ar ? 'التاريخ' : 'Date'}: ${formattedDate}   ·   ${ar ? 'الحالة' : 'Status'}: ${doc.status ?? (ar ? 'مسودة' : 'DRAFT')}`, y + 16, { size: 19, right: ar });
  return y + 85;
}
function drawFooter(ctx: CanvasRenderingContext2D, brand: DocumentBrand, doc: DocumentSpec, page: number, total: number) {
  ctx.fillStyle = '#DCE2E4'; ctx.fillRect(MARGIN, 1585, TEXT_W, 2);
  drawLine(ctx, 'DEMO DOCUMENT · Synthetic data · Not an official company-issued document', 1630, { size: 18, color: '#67747C' });
  drawLine(ctx, 'مستند تجريبي · بيانات افتراضية · ليس مستنداً رسمياً صادراً عن الشركة', 1665, { size: 18, color: '#67747C', right: true });
  drawLine(ctx, `${brand.website.replace(/^https?:\/\//, '')}    ·    ${doc.reference}    ·    ${page} / ${total}`, 1710, { size: 16, color: brand.color });
}

/** Self-contained PDF image-page encoder. Byte offsets are calculated over the
 * actual encoded stream, not JavaScript string lengths. No network service needed. */
export function imagePagesPdf(images: Uint8Array[]): Blob {
  if (!images.length) throw new Error('Cannot download an empty document.');
  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets = [0];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes as BlobPart); length += bytes.byteLength;
  };
  const object = (id: number, value: string) => { offsets[id] = length; push(`${id} 0 obj\n${value}\nendobj\n`); };
  push('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`);
  images.forEach((bytes, index) => {
    const id = 3 + index * 3;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    offsets[id + 1] = length;
    push(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
    push(bytes); push('\nendstream\nendobj\n');
    const command = 'q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
    object(id + 2, `<< /Length ${encoder.encode(command).length} >>\nstream\n${command}endstream`);
  });
  const xref = length, count = 3 + images.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
export async function renderDocumentPdf(client: ClientInfo, doc: DocumentSpec): Promise<Blob> {
  if (!doc.body?.trim()) throw new Error('This document has no generated content yet.');
  const brand = documentBrand(client);
  const [logo] = await Promise.all([
    loadLogo(brandAsset(brand)),
    document.fonts.load('25px Alexandria', doc.body + doc.title),
    document.fonts.load('600 35px Alexandria', doc.title),
    document.fonts.load('25px Inter'),
    document.fonts.ready,
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W; canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot render document downloads.');
  const start = drawHeader(ctx, logo, client, doc, brand);
  ctx.font = '400 25px Alexandria, Inter, sans-serif';
  const lines = doc.body.split(/\r?\n/).flatMap(p => wrap(ctx, p, TEXT_W));
  const perPage = Math.max(1, Math.floor((1530 - start) / LINE_H));
  const pages = Math.ceil(lines.length / perPage);
  const images: Uint8Array[] = [];
  for (let page = 0; page < pages; page++) {
    const top = drawHeader(ctx, logo, client, doc, brand);
    lines.slice(page * perPage, (page + 1) * perPage).forEach((line, i) => {
      // Retain mixed-language/bilingual paragraphs instead of forcing every line to one direction.
      drawLine(ctx, line, top + i * LINE_H, { right: doc.language === 'ar' || /^[\s\d.,:;()\-]*[\u0600-\u06ff]/.test(line) });
    });
    drawFooter(ctx, brand, doc, page + 1, pages);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PDF rendering failed.')), 'image/jpeg', 0.95));
    images.push(new Uint8Array(await blob.arrayBuffer()));
  }
  return imagePagesPdf(images);
}
export async function downloadDocument(client: ClientInfo, doc: DocumentSpec) {
  const blob = await renderDocumentPdf(client, doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${client.code}-${doc.reference}-${doc.title}`.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 180) + '.pdf';
  document.body.appendChild(link); link.click(); link.remove();
  // Allow the browser's download to consume the blob before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

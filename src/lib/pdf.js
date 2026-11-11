import { jsPDF } from 'jspdf'
import { formatDate, formatTime } from './utils'

// jsPDF standart shriftlari faqat lotin harflarini chizadi. Kirill (ism-familiyalar
// ko'pincha kirillda) va maxsus apostroflarni lotinchaga o'giramiz.
const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q',
  ғ: "g'", ҳ: 'h', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
}

export function ascii(s = '') {
  return String(s)
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[—–·•]/g, '-')
    .replace(/[Ѐ-ӿ]/g, (ch) => {
      const low = ch.toLowerCase()
      const t = CYR[low] ?? ''
      return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1)
    })
    .replace(/[^\x20-\x7E]/g, '')
}

function buildResultPdf(result) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 48
  let y = M

  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, W, 6, 'F')

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(15, 23, 42)
  const titleLines = doc.splitTextToSize(ascii(result.title), W - M * 2)
  doc.text(titleLines, M, (y += 28))
  y += (titleLines.length - 1) * 22

  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(100, 116, 139)
  doc.text(`Ishtirokchi: ${ascii(result.user_name || '-')}`, M, (y += 22))
  doc.text(`Sana: ${formatDate(result.created_at)}`, M, (y += 16))
  doc.text(`Test kodi: ${result.token ?? '-'}`, M, (y += 16))
  if (result.spent_seconds != null) doc.text(`Sarflangan vaqt: ${formatTime(result.spent_seconds)}`, M, (y += 16))

  const pct = Number(result.percent)
  const good = pct >= 50
  y += 18
  doc.setFillColor(...(good ? [240, 253, 244] : [254, 242, 242]))
  doc.roundedRect(M, y, W - M * 2, 72, 10, 10, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(28).setTextColor(...(good ? [22, 163, 74] : [220, 38, 38]))
  doc.text(`${pct.toFixed(1)}%`, M + 20, y + 42)
  doc.setFontSize(12).setTextColor(15, 23, 42)
  doc.text(`${result.correct} ta to'g'ri, ${result.total - result.correct} ta xato  (jami ${result.total} ta savol)`, M + 20, y + 62)
  y += 100

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(15, 23, 42)
  doc.text('Batafsil natija', M, y)
  y += 20

  const showKey = result.review.some((r) => r.answer != null)
  const cols = { n: M + 8, given: M + 80, key: M + 260, mark: W - M - 52 }
  const header = () => {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(100, 116, 139)
    doc.text('SAVOL', cols.n, y)
    doc.text('JAVOBINGIZ', cols.given, y)
    if (showKey) doc.text("TO'G'RI JAVOB", cols.key, y)
    doc.text('HOLAT', cols.mark, y)
    y += 16
  }
  header()

  doc.setFontSize(10)
  const rowH = 20
  result.review.forEach((r, i) => {
    if (y > H - 60) {
      doc.addPage()
      y = M
      header()
    }
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(M, y - 13, W - M * 2, rowH, 'F')
    }
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(15, 23, 42)
    doc.text(String(r.n), cols.n, y)
    doc.text(ascii(r.given ?? '-').slice(0, 28) || '-', cols.given, y)
    if (showKey) doc.text(ascii(r.answer ?? '').slice(0, 28), cols.key, y)
    doc.setFont('helvetica', 'bold').setTextColor(...(r.correct ? [22, 163, 74] : [220, 38, 38]))
    doc.text(r.correct ? "To'g'ri" : 'Xato', cols.mark, y)
    y += rowH
  })

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(148, 163, 184)
  doc.text('Test Bot orqali yaratilgan', M, H - 28)

  return doc
}

export function pdfFileName(result) {
  const safe = ascii(result.title).replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'natija'
  return `${safe}_natija.pdf`
}

/** Brauzerda: faylni yuklab olish */
export function downloadResultPdf(result) {
  buildResultPdf(result).save(pdfFileName(result))
}

/** Telegram ichida: base64 (server bot orqali chatga yuboradi) */
export function resultPdfBase64(result) {
  return buildResultPdf(result).output('datauristring').split(',')[1]
}

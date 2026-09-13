import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  Footer,
  PageNumber,
} from 'docx';
import sizeOf from 'image-size';
import { getSupabaseServer } from '../../lib/supabaseServer';

const MAX_IMG_WIDTH = 420; // px, muat di lebar halaman A4 dikurangi margin

function guessImageType(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  if (ext === 'png') return 'png';
  if (ext === 'gif') return 'gif';
  if (ext === 'bmp') return 'bmp';
  return 'png';
}

async function getImageBuffer(supabase, storagePath) {
  const { data, error } = await supabase.storage.from('report-images').download(storagePath);
  if (error) throw error;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function textBlockParagraphs(text, pageBreakBefore = false) {
  const paras = (text || '').split('\n\n').filter(Boolean);
  return paras.map(
    (p, i) =>
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 360 },
        indent: { firstLine: 720 },
        pageBreakBefore: i === 0 ? pageBreakBefore : false,
        children: [new TextRun({ text: p, size: 24 })],
      })
  );
}

async function imageBlockParagraphs(supabase, block, pageBreakBefore = false) {
  const buffer = await getImageBuffer(supabase, block.storage_path);
  let width = MAX_IMG_WIDTH;
  let height = 260;
  try {
    const dims = sizeOf(buffer);
    if (dims.width && dims.height) {
      width = Math.min(dims.width, MAX_IMG_WIDTH);
      height = Math.round(dims.height * (width / dims.width));
    }
  } catch (e) {
    // kalau gagal baca dimensi, pakai default di atas
  }

  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: block.caption ? 60 : 200 },
      pageBreakBefore,
      children: [
        new ImageRun({
          data: buffer,
          type: guessImageType(block.storage_path),
          transformation: { width, height },
        }),
      ],
    }),
  ];

  if (block.caption) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: block.caption, italics: true, size: 20 })],
      })
    );
  }

  return paragraphs;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reportId } = req.body;
  if (!reportId) return res.status(400).json({ error: 'reportId wajib diisi' });

  const supabase = getSupabaseServer();

  const [{ data: report }, { data: members }, { data: pages }, { data: blocks }, { data: signers }, { data: logs }] =
    await Promise.all([
      supabase.from('reports').select('*').eq('id', reportId).single(),
      supabase.from('report_members').select('*').eq('report_id', reportId).order('sort_order'),
      supabase.from('report_pages').select('*').eq('report_id', reportId).order('sort_order'),
      supabase.from('report_blocks').select('*').eq('report_id', reportId).order('sort_order'),
      supabase.from('approval_signers').select('*').eq('report_id', reportId).order('sort_order'),
      supabase.from('daily_logs').select('*').eq('report_id', reportId).order('log_date'),
    ]);

  if (!report) return res.status(404).json({ error: 'Laporan gak ketemu' });

  const blocksByPage = {};
  (blocks || []).forEach((b) => {
    blocksByPage[b.section_key] = [...(blocksByPage[b.section_key] || []), b];
  });

  const children = [];

  // ---------- COVER ----------
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400 },
      children: [new TextRun({ text: (report.title || '').toUpperCase(), bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: `Di ${report.place_name || '-'}`, bold: true, size: 26 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
      children: [new TextRun({ text: 'Disusun oleh:', size: 24 })],
    })
  );

  (members || []).forEach((m) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `${m.full_name}   ${m.student_number || ''}`, size: 24 })],
      })
    );
  });

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
      children: [new TextRun({ text: (report.major || '').toUpperCase(), bold: true, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: (report.school_name || '').toUpperCase(), bold: true, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: String(report.year || ''), bold: true, size: 24 })],
    }),
    new Paragraph({ pageBreakBefore: true, children: [] })
  );

  // ---------- LEMBAR PENGESAHAN ----------
  for (const side of ['industri', 'sekolah']) {
    const rows = (signers || []).filter((s) => s.side === side);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: `LEMBAR PENGESAHAN PIHAK ${side.toUpperCase()}`, bold: true, size: 26 })],
      })
    );
    rows.forEach((s) => {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 500 },
          children: [new TextRun({ text: s.role_label, size: 24 })],
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: s.person_name || '..............................', bold: true, size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: s.person_number ? `NUP. ${s.person_number}` : '', size: 24 })],
        })
      );
    });
    children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
  }

  // ---------- HALAMAN-HALAMAN BEBAS (isi canvas user, urut sesuai sort_order) ----------
  const orderedPages = pages || [];
  for (let i = 0; i < orderedPages.length; i++) {
    const page = orderedPages[i];
    const pageBlocks = (blocksByPage[page.id] || []).sort((a, b) => a.sort_order - b.sort_order);

    for (let j = 0; j < pageBlocks.length; j++) {
      const block = pageBlocks[j];
      const needsBreak = j === 0 && i > 0;
      if (block.block_type === 'text') {
        children.push(...textBlockParagraphs(block.text_content, needsBreak));
      } else if (block.block_type === 'image') {
        try {
          const imgParas = await imageBlockParagraphs(supabase, block, needsBreak);
          children.push(...imgParas);
        } catch (e) {
          children.push(
            new Paragraph({ children: [new TextRun({ text: '[gambar gagal dimuat]', italics: true, color: 'cc0000' })] })
          );
        }
      }
    }
  }

  // ---------- LAMPIRAN: JURNAL KEGIATAN HARIAN ----------
  if ((members || []).length > 0) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: 'LAMPIRAN', bold: true, size: 28 })],
      })
    );

    members.forEach((m) => {
      const memberLogs = (logs || []).filter((l) => l.member_id === m.id);
      children.push(
        new Paragraph({
          spacing: { before: 400, after: 200 },
          children: [new TextRun({ text: `Jurnal Kegiatan PKL — ${m.full_name}`, bold: true, size: 24 })],
        })
      );

      const headerRow = new TableRow({
        children: ['No', 'Hari/Tanggal', 'Kegiatan'].map(
          (h) =>
            new TableCell({
              width: { size: h === 'Kegiatan' ? 60 : 20, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
            })
        ),
      });

      const dataRows = (memberLogs.length ? memberLogs : [null]).map(
        (log, i) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(log ? String(i + 1) : '')] }),
              new TableCell({ children: [new Paragraph(log ? String(log.log_date) : '')] }),
              new TableCell({ children: [new Paragraph(log ? log.activity : '')] }),
            ],
          })
      );

      children.push(
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }),
        new Paragraph({ children: [] })
      );
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT] })],
              }),
            ],
          }),
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${(report.title || 'laporan').replace(/\s+/g, '_')}.docx"`
  );
  res.send(buffer);
}

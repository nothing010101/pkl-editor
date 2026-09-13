import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import SectionNav from '../../components/SectionNav';
import BlockCanvas from '../../components/BlockCanvas';

export default function ReportEditor() {
  const router = useRouter();
  const { id } = router.query;

  const [report, setReport] = useState(null);
  const [pages, setPages] = useState([]);
  const [activePageId, setActivePageId] = useState(null);
  const [blocksByPage, setBlocksByPage] = useState({}); // pageId -> [block,...]
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadAll();
  }, [id]);

  async function loadAll() {
    setLoading(true);
    const [{ data: reportRow }, { data: pageRows }, { data: blocks }] = await Promise.all([
      supabase.from('reports').select('*').eq('id', id).single(),
      supabase.from('report_pages').select('*').eq('report_id', id).order('sort_order'),
      supabase.from('report_blocks').select('*').eq('report_id', id).order('sort_order'),
    ]);

    setReport(reportRow);

    let finalPages = pageRows || [];
    if (finalPages.length === 0) {
      const { data: firstPage } = await supabase
        .from('report_pages')
        .insert({ report_id: id, title: 'Halaman 1', sort_order: 0 })
        .select()
        .single();
      finalPages = firstPage ? [firstPage] : [];
    }
    setPages(finalPages);
    setActivePageId(finalPages[0]?.id || null);

    const map = {};
    (blocks || []).forEach((b) => {
      map[b.section_key] = [...(map[b.section_key] || []), b];
    });
    setBlocksByPage(map);
    setLoading(false);
  }

  function nextPageSortOrder() {
    if (pages.length === 0) return 0;
    return Math.max(...pages.map((p) => p.sort_order)) + 1;
  }

  async function handleAddPage() {
    const { data, error } = await supabase
      .from('report_pages')
      .insert({ report_id: id, title: `Halaman ${pages.length + 1}`, sort_order: nextPageSortOrder() })
      .select()
      .single();
    if (!error) {
      setPages([...pages, data]);
      setActivePageId(data.id);
    }
  }

  async function handleRenamePage(page) {
    const newTitle = window.prompt('Nama halaman:', page.title);
    if (!newTitle || !newTitle.trim() || newTitle === page.title) return;
    const { error } = await supabase.from('report_pages').update({ title: newTitle.trim() }).eq('id', page.id);
    if (!error) {
      setPages(pages.map((p) => (p.id === page.id ? { ...p, title: newTitle.trim() } : p)));
    }
  }

  async function handleDeletePage(page) {
    if (pages.length <= 1) return;
    if (!window.confirm(`Hapus "${page.title}"? Semua isi di halaman ini ikut kehapus.`)) return;

    const pageBlocks = blocksByPage[page.id] || [];
    const imagePaths = pageBlocks.filter((b) => b.block_type === 'image' && b.storage_path).map((b) => b.storage_path);
    if (imagePaths.length > 0) {
      await supabase.storage.from('report-images').remove(imagePaths);
    }
    await supabase.from('report_blocks').delete().eq('report_id', id).eq('section_key', page.id);
    await supabase.from('report_pages').delete().eq('id', page.id);

    const remaining = pages.filter((p) => p.id !== page.id);
    setPages(remaining);
    const { [page.id]: _removed, ...restBlocks } = blocksByPage;
    setBlocksByPage(restBlocks);
    if (activePageId === page.id) {
      setActivePageId(remaining[0]?.id || null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: id }),
      });
      if (!res.ok) throw new Error('Export gagal, coba lagi');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report?.title || 'laporan-pkl'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  if (loading || !report || !activePageId) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-400 flex items-center justify-center text-sm">
        Memuat laporan...
      </div>
    );
  }

  const activePage = pages.find((p) => p.id === activePageId);
  const doneIds = new Set(
    Object.keys(blocksByPage).filter((k) =>
      (blocksByPage[k] || []).some(
        (b) => (b.block_type === 'text' && b.text_content?.trim()) || b.block_type === 'image'
      )
    )
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-24">
      <div className="sticky top-0 bg-neutral-950/95 backdrop-blur border-b border-neutral-900 px-4 pt-4 pb-2 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-sm font-semibold truncate max-w-[220px]">{report.title}</h1>
            <p className="text-xs text-neutral-500">Kode: {report.share_code}</p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-neutral-100 text-neutral-900 text-xs font-medium rounded-lg px-3 py-2 disabled:opacity-50"
          >
            {exporting ? 'Membuat file...' : 'Export .docx'}
          </button>
        </div>
        <SectionNav
          pages={pages}
          activeId={activePageId}
          onSelect={setActivePageId}
          onAddPage={handleAddPage}
          onRenamePage={handleRenamePage}
          onDeletePage={handleDeletePage}
          doneIds={doneIds}
        />
      </div>

      <div className="px-4 pt-4">
        <BlockCanvas
          reportId={id}
          page={activePage}
          blocks={blocksByPage[activePageId]}
          onBlocksChange={(updated) =>
            setBlocksByPage((prev) => ({ ...prev, [activePageId]: updated }))
          }
        />
      </div>
    </div>
  );
}

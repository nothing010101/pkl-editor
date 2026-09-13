import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const SAVE_DELAY = 800;

export default function BlockCanvas({ reportId, section, blocks, onBlocksChange }) {
  const fileInputRef = useRef(null);
  const timers = useRef({});

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, [section.key]);

  function nextSortOrder() {
    if (!blocks || blocks.length === 0) return 0;
    return Math.max(...blocks.map((b) => b.sort_order)) + 1;
  }

  async function addTextBlock() {
    const { data, error } = await supabase
      .from('report_blocks')
      .insert({
        report_id: reportId,
        section_key: section.key,
        block_type: 'text',
        text_content: '',
        sort_order: nextSortOrder(),
      })
      .select()
      .single();
    if (!error) onBlocksChange([...(blocks || []), data]);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const path = `${reportId}/${section.key}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('report-images').upload(path, file);
    if (uploadError) {
      alert('Upload gagal: ' + uploadError.message);
      return;
    }
    const { data, error } = await supabase
      .from('report_blocks')
      .insert({
        report_id: reportId,
        section_key: section.key,
        block_type: 'image',
        storage_path: path,
        caption: '',
        sort_order: nextSortOrder(),
      })
      .select()
      .single();
    if (!error) onBlocksChange([...(blocks || []), data]);
    e.target.value = '';
  }

  function updateLocal(blockId, patch) {
    onBlocksChange((blocks || []).map((b) => (b.id === blockId ? { ...b, ...patch } : b)));
  }

  function debouncedSave(blockId, patch) {
    clearTimeout(timers.current[blockId]);
    timers.current[blockId] = setTimeout(async () => {
      await supabase.from('report_blocks').update(patch).eq('id', blockId);
    }, SAVE_DELAY);
  }

  function handleTextChange(block, value) {
    updateLocal(block.id, { text_content: value });
    debouncedSave(block.id, { text_content: value });
  }

  function handleCaptionChange(block, value) {
    updateLocal(block.id, { caption: value });
    debouncedSave(block.id, { caption: value });
  }

  async function removeBlock(block) {
    if (block.block_type === 'image' && block.storage_path) {
      await supabase.storage.from('report-images').remove([block.storage_path]);
    }
    await supabase.from('report_blocks').delete().eq('id', block.id);
    onBlocksChange((blocks || []).filter((b) => b.id !== block.id));
  }

  async function moveBlock(block, direction) {
    const sorted = [...(blocks || [])].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((b) => b.id === block.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    const aOrder = a.sort_order;
    const bOrder = b.sort_order;

    await Promise.all([
      supabase.from('report_blocks').update({ sort_order: bOrder }).eq('id', a.id),
      supabase.from('report_blocks').update({ sort_order: aOrder }).eq('id', b.id),
    ]);

    onBlocksChange(
      sorted.map((x) => {
        if (x.id === a.id) return { ...x, sort_order: bOrder };
        if (x.id === b.id) return { ...x, sort_order: aOrder };
        return x;
      })
    );
  }

  const sortedBlocks = [...(blocks || [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-3">
      <h2 className="font-medium text-sm text-neutral-300 px-1">{section.heading}</h2>

      {/* Canvas putih ala halaman dokumen */}
      <div className="bg-white text-neutral-900 rounded-xl p-4 min-h-[300px] shadow-sm space-y-4">
        {sortedBlocks.length === 0 && (
          <p className="text-neutral-400 text-sm text-center py-10">
            Halaman ini masih kosong.
            <br />
            Tambah teks atau gambar di bawah.
          </p>
        )}

        {sortedBlocks.map((block, i) => (
          <div key={block.id} className="group relative">
            <div className="absolute -left-1 top-0 flex flex-col gap-1 -translate-x-full pr-1 opacity-60">
              <button
                onClick={() => moveBlock(block, 'up')}
                disabled={i === 0}
                className="text-neutral-400 disabled:opacity-20 text-xs w-5 h-5"
              >
                ▲
              </button>
              <button
                onClick={() => moveBlock(block, 'down')}
                disabled={i === sortedBlocks.length - 1}
                className="text-neutral-400 disabled:opacity-20 text-xs w-5 h-5"
              >
                ▼
              </button>
            </div>

            {block.block_type === 'text' ? (
              <textarea
                className="w-full resize-none outline-none text-sm leading-relaxed placeholder-neutral-300"
                placeholder="Tulis paragraf di sini..."
                value={block.text_content || ''}
                onChange={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                  handleTextChange(block, e.target.value);
                }}
                rows={3}
              />
            ) : (
              <div className="space-y-1">
                <img
                  src={supabase.storage.from('report-images').getPublicUrl(block.storage_path).data.publicUrl}
                  className="w-full rounded-lg object-cover"
                  alt=""
                />
                <input
                  className="w-full text-xs text-center text-neutral-500 italic outline-none"
                  placeholder="Keterangan gambar (opsional)"
                  defaultValue={block.caption}
                  onChange={(e) => handleCaptionChange(block, e.target.value)}
                />
              </div>
            )}

            <button
              onClick={() => removeBlock(block)}
              className="absolute -right-1 -top-1 translate-x-full text-neutral-300 hover:text-red-500 text-xs px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Toolbar tambah blok */}
      <div className="flex gap-2">
        <button
          onClick={addTextBlock}
          className="flex-1 bg-neutral-800 rounded-lg py-2.5 text-xs font-medium"
        >
          + Tambah Teks
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 bg-neutral-800 rounded-lg py-2.5 text-xs font-medium"
        >
          + Tambah Gambar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
    </div>
  );
}

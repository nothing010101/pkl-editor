-- ============================================================
-- TAMBAHAN: sistem blok (teks & gambar bisa disusun bebas per section)
-- Jalankan ini di SQL Editor Supabase (tambahan dari schema.sql sebelumnya,
-- gak perlu run ulang yang lama, ini nambah tabel baru aja)
-- ============================================================

create table if not exists report_blocks (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  section_key text not null,
  block_type text not null check (block_type in ('text', 'image')),
  text_content text,              -- diisi kalau block_type = 'text'
  storage_path text,              -- diisi kalau block_type = 'image'
  caption text,                   -- keterangan gambar (opsional)
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table report_blocks enable row level security;

create policy "blocks_all" on report_blocks for all using (true) with check (true);

-- Tabel report_sections & report_images dari schema.sql lama masih ada,
-- gapapa dibiarin nganggur (gak dipake lagi sama kode versi baru).

# Folder Dokumen Template PRIMA

Tempat menyimpan file template surat/formulir yang bisa diunduh warga.

## Cara Upload File

1. Taruh file .pdf / .docx / .xlsx ke folder ini
2. Commit & push ke GitHub
3. Vercel otomatis deploy
4. Update `prima-data.json` → field `dokumenUnduh` → `url` jadi path relatif, misal:

```json
"dokumenUnduh": [
  {
    "nama": "Formulir Permohonan SKD",
    "url": "dokumen/formulir-skd.pdf"
  }
]
```

## Aturan Penamaan

- Pakai huruf kecil + dash, tanpa spasi
- Contoh: `surat-ahli-waris-template.docx`, `formulir-skd.pdf`

## File yang Bisa Diunduh Warga

- `.pdf` → dibuka langsung di browser / HP
- `.docx` → download, edit di Word/WPS
- `.xlsx` → download, edit di Excel/WPS

Catatan: File tidak boleh > 10 MB (Vercel hobby tier limit).

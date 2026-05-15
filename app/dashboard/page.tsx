// ============================================================
// ADD THIS TO app/dashboard/page.tsx
//
// 1. Add 'upload' to the Tab type:
//    type Tab = 'home' | 'interview' | 'voice' | 'memories' | 'chat' | 'clone' | 'upload'
//
// 2. Add to NAV array:
//    { id: 'upload' as Tab, icon: '⇣', label: 'Upload Files' }
//
// 3. Add import at top:
//    import BulkUpload from '@/components/BulkUpload'
//
// 4. Add this tab section in main, after the memories tab:
// ============================================================

// PASTE THIS BLOCK inside the <main> element, after the memories tab section:

/*
{tab === 'upload' && (
  <div className="fade">
    <div style={{ marginBottom: '24px' }}>
      <h1 style={{ fontFamily: 'Lora, serif', fontWeight: 500, fontSize: '28px', color: C.espresso, marginBottom: '8px' }}>
        Upload Files & Folders
      </h1>
      <p style={{ fontSize: '14px', color: C.walnut, lineHeight: '1.65' }}>
        Drop any file — PDFs, Word docs, PowerPoints, photos, WhatsApp exports, voice notes.
        Our AI reads everything, extracts your identity insights, then deletes the raw files.
        Only the distilled knowledge stays in your database.
      </p>
    </div>
    <BulkUpload onComplete={fetchConf} />
  </div>
)}
*/

// ============================================================
// Also add mammoth and xlsx to package.json dependencies:
// "mammoth": "^1.8.0",
// "xlsx": "^0.18.5"
// ============================================================

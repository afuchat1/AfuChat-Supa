import { useState } from "react";
import {
  ArrowDownToLine,
  BatteryFull,
  Camera,
  Check,
  FileArchive,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Music2,
  Paperclip,
  Share2,
  Wifi,
} from "lucide-react";
import "./_group.css";

export function Refined() {
  const [downloaded, setDownloaded] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <main className="chat-file-sharing phone" aria-label="Refined AfuChat file sharing experience">
      <div className="statusbar"><span>9:41</span><span><Wifi size={14} /><BatteryFull size={16} /></span></div>
      <header className="topbar">
        <div className="avatar">AK</div>
        <div><div className="topbar-title">Amina K.</div><div className="topbar-subtitle">online</div></div>
      </header>
      <section className="conversation">
        <div className="date-chip">Today</div>
        <article className="bubble incoming">
          <p className="bubble-label">Amina</p>
          <div className="refined-file">
            <div className="refined-file-main">
              <div className="type-badge"><FileText size={17} /><span>PDF</span></div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="refined-file-name">Project notes.pdf</div>
                <div className="refined-file-meta">2.4 MB · PDF document</div>
              </div>
            </div>
            <div className="file-actions">
              <button className="file-action" onClick={() => setDownloaded(true)}>
                {downloaded ? <FolderOpen size={13} /> : <ArrowDownToLine size={13} />}
                {downloaded ? "Open" : "Download"}
              </button>
              <button className="file-action secondary" onClick={() => setSaved(true)}>
                {saved ? <Check size={13} /> : <Share2 size={13} />}
                {saved ? "Saved" : "Save or share"}
              </button>
            </div>
          </div>
        </article>
        <article className="bubble outgoing">
          <div className="file-row">
            <div className="file-icon"><FileArchive size={20} /></div>
            <div><div className="file-name">source-assets.psd</div><div className="file-meta">18.6 MB · Upload complete</div></div>
          </div>
        </article>
      </section>
      <div className="composer-refined"><Paperclip size={18} /><span>Add a message</span></div>
      <section className="refined-picker">
        <div className="handle" />
        <div className="refined-picker-heading"><h2 className="picker-title">Share something</h2><span style={{ color: "#625B50", fontSize: 11 }}>Up to 6 files</span></div>
        <p className="picker-caption">Choose from your device or share a recent item.</p>
        <div className="refined-grid" aria-label="Attachment actions">
          <button className="refined-action primary">
            <div><div className="action-title">Browse files</div><div className="action-subtitle">Any document or file type</div></div>
            <FolderOpen size={19} />
          </button>
          <button className="refined-action"><ImageIcon size={19} color="#DB2777" /><span className="action-title">Photos</span></button>
          <button className="refined-action"><Camera size={19} color="#F97316" /><span className="action-title">Camera</span></button>
          <button className="refined-action"><Music2 size={19} color="#0891B2" /><span className="action-title">Audio</span></button>
          <button className="refined-action"><FileText size={19} color="#16A34A" /><span className="action-title">Documents</span></button>
        </div>
      </section>
    </main>
  );
}

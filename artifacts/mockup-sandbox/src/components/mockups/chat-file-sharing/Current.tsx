import {
  Camera,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Wallet,
  Wifi,
  BatteryFull,
} from "lucide-react";
import "./_group.css";

export function Current() {
  return (
    <main className="chat-file-sharing phone" aria-label="Current AfuChat attachment experience">
      <div className="statusbar"><span>9:41</span><span><Wifi size={14} /><BatteryFull size={16} /></span></div>
      <header className="topbar">
        <div className="avatar">AK</div>
        <div><div className="topbar-title">Amina K.</div><div className="topbar-subtitle">online</div></div>
      </header>
      <section className="conversation">
        <div className="date-chip">Today</div>
        <article className="bubble incoming">
          <p className="bubble-label">Amina</p>
          <div className="file-row">
            <div className="file-icon"><FileText size={20} /></div>
            <div><div className="file-name">Project notes.pdf</div><div className="file-meta">Tap to download</div></div>
          </div>
        </article>
        <article className="bubble outgoing">
          <div className="file-row">
            <div className="file-icon"><FileText size={20} /></div>
            <div><div className="file-name">Quarterly-plan-2026.pptx</div><div className="file-meta">Tap to open</div></div>
          </div>
        </article>
      </section>
      <div className="composer"><Paperclip size={18} /><span>Message</span></div>
      <section className="legacy-picker">
        <div className="handle" />
        <h2 className="picker-title">Attachments</h2>
        <div className="legacy-grid" aria-label="Current attachment actions">
          <button className="legacy-action" aria-label="Photos"><ImageIcon color="#DB2777" /></button>
          <button className="legacy-action" aria-label="Camera"><Camera color="#F97316" /></button>
          <button className="legacy-action" aria-label="Audio File"><Mic color="#0891B2" /></button>
          <button className="legacy-action" aria-label="Document"><FileText color="#16A34A" /></button>
          <button className="legacy-action" aria-label="Wallet"><Wallet color="#7C3AED" /></button>
        </div>
      </section>
    </main>
  );
}

import {
  ArrowLeft,
  BatteryFull,
  Camera,
  CheckCircle2,
  FileText,
  Gift,
  Images,
  MessageCircleMore,
  Mic,
  MoreVertical,
  Music2,
  Paperclip,
  Signal,
  Smile,
  WalletCards,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PICKS: {
  label: string;
  title: string;
  Icon: LucideIcon;
  color: string;
}[] = [
  { label: "Photos (up to 6)", title: "Photos", Icon: Images, color: "#DB2777" },
  { label: "Camera", title: "Camera", Icon: Camera, color: "#F97316" },
  { label: "Audio File", title: "Audio", Icon: Music2, color: "#0891B2" },
  { label: "Files", title: "Files", Icon: FileText, color: "#16A34A" },
  { label: "Wallet", title: "Wallet", Icon: WalletCards, color: "#7C3AED" },
];

export function PickerSample({ iconOnly }: { iconOnly: boolean }) {
  return (
    <main className={`chat-attachment-preview ${iconOnly ? "icon-only" : ""}`}>
      <div className="screen">
        <div className="statusbar">
          <span>09:56</span>
          <span className="status-icons">
            <Wifi size={14} />
            <Signal size={14} />
            <BatteryFull size={16} />
          </span>
        </div>

        <header className="chat-header">
          <button className="back-button" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="avatar" aria-hidden="true">L</div>
          <div>
            <div className="person-name">Lina <CheckCircle2 size={15} fill="#198e4d" color="#198e4d" /></div>
            <div className="presence">last seen 14h ago</div>
          </div>
          <button className="menu-button" aria-label="More options">
            <MoreVertical size={22} />
          </button>
        </header>

        <section className="empty-state" aria-label="Empty conversation">
          <div className="empty-icon"><MessageCircleMore size={48} fill="currentColor" /></div>
          <div className="empty-title">No messages yet</div>
          <div className="empty-caption">Say hello to start the conversation</div>
        </section>

        <div className="composer">
          <Smile size={21} />
          <span className="composer-placeholder">Message</span>
          <div className="composer-actions" aria-hidden="true">
            <Gift size={20} />
            <Paperclip size={20} />
          </div>
          <div className="mic"><Mic size={21} /></div>
        </div>

        <section className="attachment-panel" aria-label="Chat attachments">
          <div className="action-grid">
            {PICKS.map(({ label, title, Icon, color }) => (
              <button
                className="action-button"
                key={label}
                aria-label={label}
                style={{ "--action-color": color } as React.CSSProperties}
              >
                <span className="action-icon-wrap" aria-hidden="true">
                  <Icon size={27} strokeWidth={2.4} />
                </span>
                <Icon className="action-icon" size={29} strokeWidth={2.4} aria-hidden="true" />
                {!iconOnly && <span className="action-label">{title}</span>}
              </button>
            ))}
          </div>
        </section>

        <div className="nav-handle" aria-hidden="true" />
      </div>
    </main>
  );
}

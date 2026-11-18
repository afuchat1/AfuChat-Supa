import { Camera } from "lucide-react";

type ProfileHeaderSampleProps = {
  aligned: boolean;
};

export function ProfileHeaderSample({ aligned }: ProfileHeaderSampleProps) {
  return (
    <main className={`me-profile-header-preview${aligned ? " is-aligned" : ""}`}>
      <section className="profile-card">
        <div className="cover">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="brand-name" aria-hidden="true">AfuChat</span>
          <button className="cover-edit" type="button" aria-label="Edit profile cover">
            <Camera size={16} />
          </button>
          <img
            className="avatar"
            src="/__mockup/images/me-profile-header/avatar.jpg"
            alt="Profile avatar"
          />
          {aligned && <Identity onCover />}
        </div>

        {!aligned && (
          <div className="identity-row">
            <span className="avatar-spacer" aria-hidden="true" />
            <Identity />
          </div>
        )}

        <p className={`bio${aligned ? " aligned" : ""}`}>
          Founder, CEO and product manager of AfuChat Technologies
        </p>

        <div className="acoin">
          <div className="coin-icon" aria-hidden="true">A</div>
          <div className="acoin-copy">
            <div className="acoin-balance">28.8M ACoin balance</div>
            <div className="acoin-sub">Your activity unlocks status and perks</div>
          </div>
          <span className="chevron" aria-hidden="true">›</span>
        </div>
      </section>

      <section className="stats" aria-label="Profile statistics">
        <Stat value="129" label="Followers" />
        <Stat value="41" label="Following" />
        <Stat value="26" label="Posts" />
      </section>
    </main>
  );
}

function Identity({ onCover = false }: { onCover?: boolean }) {
  return (
    <div className={`identity${onCover ? " on-cover" : ""}`}>
      <div className="name-row">
        <span className="name">AM Kaweesi</span>
        <span className="verified" aria-label="Verified">✓</span>
      </div>
      <div className="handle-row">
        <span>@amkaweesi</span>
        <span className="info" aria-hidden="true">●</span>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

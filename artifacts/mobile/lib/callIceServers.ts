export type CallIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const FREE_STUN_SERVERS: CallIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export function getCallIceServers(): CallIceServer[] {
  return FREE_STUN_SERVERS.map((server) => ({ ...server }));
}

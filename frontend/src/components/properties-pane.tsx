'use client';

import { useAgent, useLocalParticipant, useRoomInfo, type AgentState } from '@livekit/components-react';
import { useEffect, useState } from 'react';

// ── enumerate all devices of a given kind ───────────────
function useDevices(kind: MediaDeviceKind) {
  const [devices, setDevices] = useState<{ label: string; deviceId: string }[]>([]);

  useEffect(() => {
    const load = () =>
      navigator.mediaDevices.enumerateDevices().then((all) =>
        setDevices(
          all
            .filter((d) => d.kind === kind)
            .map(({ label, deviceId }) => ({
              label: label || `Unknown ${kind}`,
              deviceId,
            }))
        )
      );

    load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, [kind]);

  return devices;
}

// ── small UI primitives ─────────────────────────────────
function Section({ title }: { title: string }) {
  return (
    <div className="border-b border-white/6 px-4 pb-1 pt-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/40">
        {title}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  dim,
  dot,
  dotColor,
}: {
  label: string;
  value: string;
  dim?: boolean;
  dot?: boolean;
  dotColor?: string;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-2 px-4 py-[5px]">
      <span className="truncate text-[10px] text-muted-foreground/50 leading-[1.6]">{label}</span>
      <span
        className={`flex items-center gap-1.5 break-all text-[10px] leading-[1.6] ${
          dim ? 'italic text-muted-foreground/30' : 'text-foreground/70'
        }`}
      >
        {dot && (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor ?? '#6b7280' }}
          />
        )}
        {value}
      </span>
    </div>
  );
}

// ── main component ──────────────────────────────────────
export function PropertiesPane() {
  const agentHook = useAgent();
  const { localParticipant, microphoneTrack, cameraTrack } = useLocalParticipant();
  const { name: roomName } = useRoomInfo();

  const cameras = useDevices('videoinput');
  const mics = useDevices('audioinput');

  // Agent participant lives on internal.agentParticipant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentParticipant = (agentHook as any)?.internal?.agentParticipant;
  const agentName: string | null = agentParticipant?.name || null;
  const agentIdentity: string | null = agentParticipant?.identity || null;
  const agentState: AgentState | undefined = agentHook.state;

  // Derive values
  const statusLabel =
    !agentState || agentState === 'disconnected'
      ? 'Disconnected'
      : agentState.charAt(0).toUpperCase() + agentState.slice(1);

  const statusColor =
    agentState === 'listening' || agentState === 'speaking' || agentState === 'thinking'
      ? '#22d3ee'
      : agentState === 'disconnected' || !agentState
      ? '#6b7280'
      : '#a3e635';

  const userName = localParticipant?.name || null;
  const userIdentity = localParticipant?.identity || null;
  const userMeta = localParticipant?.metadata || null;
  const userAttrs = localParticipant?.attributes
    ? Object.entries(localParticipant.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
    : null;

  // Active device: prefer the live MediaStreamTrack label (exact device in use),
  // fall back to first enumerated device when the track isn't published yet.
  const activeMicLabel =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (microphoneTrack as any)?.track?.mediaStreamTrack?.label ||
    mics.find((d) => d.deviceId === 'default')?.label ||
    mics[0]?.label ||
    null;

  const activeCameraLabel =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cameraTrack as any)?.track?.mediaStreamTrack?.label ||
    cameras[0]?.label ||
    null;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-l border-white/8 bg-white/[0.015]">
      {/* Header */}
      <div className="border-b border-white/8 px-4 py-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/40">
          Properties
        </p>
      </div>

      {/* ── Room ── */}
      <Section title="Room" />
      <Row
        label="Description"
        value="Virtual workbench for testing multimodal AI agents."
        dim={false}
      />
      <Row label="Room" value={roomName || '—'} dim={!roomName} />
      <Row
        label="Status"
        value={statusLabel}
        dot
        dotColor={statusColor}
        dim={!agentState || agentState === 'disconnected'}
      />

      {/* ── Agent ── */}
      <Section title="Agent" />
      <Row label="Name" value={agentName || 'None'} dim={!agentName} />
      <Row label="Identity" value={agentIdentity || 'No agent connected'} dim={!agentIdentity} />
      {!agentName && (
        <p className="px-4 pb-2 pt-1 text-[9px] leading-relaxed text-muted-foreground/25 italic">
          Set an agent name to use explicit dispatch.
        </p>
      )}

      {/* ── User ── */}
      <Section title="User" />
      <Row label="Name" value={userName || 'Auto'} dim={!userName} />
      <Row label="Identity" value={userIdentity || 'Auto'} dim={!userIdentity} />
      <Row label="Attributes" value={userAttrs || '—'} dim={!userAttrs} />
      <Row label="Metadata" value={userMeta || '—'} dim={!userMeta} />

      {/* ── Devices ── */}
      <Section title="Devices" />
      <Row label="Camera" value={activeCameraLabel || '—'} dim={!activeCameraLabel} />
      <Row label="Microphone" value={activeMicLabel || '—'} dim={!activeMicLabel} />
    </aside>
  );
}

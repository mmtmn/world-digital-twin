import { Plane, Satellite, X } from 'lucide-react';
import type { AircraftProperties } from '../utils/aircraft';
import type { SatelliteProperties } from '../utils/satellites';

type TrackingSelection =
  | {
      type: 'satellite';
      properties: SatelliteProperties;
    }
  | {
      type: 'aircraft';
      properties: AircraftProperties;
    };

type TrackingDrawerProps = {
  selection: TrackingSelection | null;
  onClose: () => void;
};

const fmt = (value: unknown, unit: string) =>
  typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value).toLocaleString()} ${unit}` : 'Unknown';

export function TrackingDrawer({ selection, onClose }: TrackingDrawerProps) {
  if (!selection) return null;

  const isSatellite = selection.type === 'satellite';
  const properties = selection.properties;

  return (
    <aside className="camera-drawer tracking-drawer" aria-label="Selected tracked object">
      <div className="drawer-header">
        <div className="drawer-title">
          <span className={isSatellite ? 'drawer-icon satellite-icon' : 'drawer-icon aircraft-icon'} aria-hidden="true">
            {isSatellite ? <Satellite size={18} /> : <Plane size={18} />}
          </span>
          <div>
            <h2>{properties.name}</h2>
            <p>{properties.source}</p>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close tracked object">
          <X size={18} />
        </button>
      </div>

      <div className="detail-grid">
        <div>
          <strong>ID</strong>
          <span>{properties.id}</span>
        </div>
        {isSatellite ? (
          <div>
            <strong>Altitude</strong>
            <span>{fmt((properties as SatelliteProperties).altitudeKm, 'km')}</span>
          </div>
        ) : (
          <>
            <div>
              <strong>Registration</strong>
              <span>{(properties as AircraftProperties).registration || 'Unknown'}</span>
            </div>
            <div>
              <strong>Altitude</strong>
              <span>{fmt((properties as AircraftProperties).altitudeFt, 'ft')}</span>
            </div>
            <div>
              <strong>Speed</strong>
              <span>{fmt((properties as AircraftProperties).speedKt, 'kt')}</span>
            </div>
            <div>
              <strong>Track</strong>
              <span>{fmt((properties as AircraftProperties).track, 'deg')}</span>
            </div>
          </>
        )}
      </div>
      {isSatellite ? (
        <p className="license-note">Trajectory lines are predicted ground tracks; altitude is shown here in kilometers.</p>
      ) : null}
    </aside>
  );
}

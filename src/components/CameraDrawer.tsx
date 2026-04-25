import { ExternalLink, Video, X } from 'lucide-react';
import type { CameraProperties } from '../types';
import { HlsVideo } from './HlsVideo';
import { RefreshingImage } from './RefreshingImage';
import { youtubeEmbedUrl } from '../utils/cameras';

type CameraDrawerProps = {
  camera: CameraProperties | null;
  onClose: () => void;
};

const renderFeed = (camera: CameraProperties) => {
  const title = `${camera.name} live feed`;

  if (camera.feedType === 'hls') {
    return <HlsVideo src={camera.feedUrl} title={title} />;
  }

  if (camera.feedType === 'mp4') {
    return <video className="camera-media" src={camera.feedUrl} controls muted playsInline title={title} />;
  }

  if (camera.feedType === 'mjpeg' || camera.feedType === 'image') {
    return (
      <RefreshingImage
        src={camera.feedUrl}
        title={title}
        refreshSeconds={camera.feedType === 'image' ? camera.refreshSeconds : 0}
      />
    );
  }

  const iframeUrl = camera.feedType === 'youtube' ? youtubeEmbedUrl(camera.feedUrl) : camera.feedUrl;

  return (
    <iframe
      className="camera-frame"
      src={iframeUrl}
      title={title}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
};

export function CameraDrawer({ camera, onClose }: CameraDrawerProps) {
  if (!camera) return null;

  const externalUrl = camera.pageUrl || camera.feedUrl;

  return (
    <aside className="camera-drawer" aria-label="Selected live camera">
      <div className="drawer-header">
        <div className="drawer-title">
          <span className="drawer-icon" aria-hidden="true">
            <Video size={18} />
          </span>
          <div>
            <h2>{camera.name}</h2>
            <p>{[camera.city, camera.country].filter(Boolean).join(', ') || camera.kind || 'Public camera'}</p>
          </div>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close camera">
          <X size={18} />
        </button>
      </div>

      <div className="camera-stage">{renderFeed(camera)}</div>

      <div className="camera-meta">
        <span>{camera.feedType.toUpperCase()}</span>
        {camera.source ? <span>{camera.source}</span> : null}
      </div>

      <a className="external-link" href={externalUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={16} />
        Open live source
      </a>

      {camera.license ? <p className="license-note">{camera.license}</p> : null}
    </aside>
  );
}

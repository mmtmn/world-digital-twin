import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

type HlsVideoProps = {
  src: string;
  title: string;
};

export function HlsVideo({ src, title }: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    if (!Hls.isSupported()) return;

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true
    });

    hls.loadSource(src);
    hls.attachMedia(video);

    return () => hls.destroy();
  }, [src]);

  return <video ref={videoRef} className="camera-media" controls muted playsInline title={title} />;
}

import { useEffect, useState } from 'react';

type RefreshingImageProps = {
  src: string;
  title: string;
  refreshSeconds?: number;
};

export function RefreshingImage({ src, title, refreshSeconds = 20 }: RefreshingImageProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (refreshSeconds <= 0) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), refreshSeconds * 1000);
    return () => window.clearInterval(interval);
  }, [refreshSeconds]);

  const separator = src.includes('?') ? '&' : '?';

  return <img className="camera-media" src={`${src}${separator}t=${tick}`} alt={title} />;
}

import { useEffect, useState } from "react";

import { ViewportStatus } from "./ViewportStatus";

export function ViewportTrackerPanel() {
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  useEffect(() => {
    if (!trackingEnabled) {
      return;
    }

    function handleResize() {
      window.dispatchEvent(new CustomEvent("yomi:viewport-resized"));
    }

    window.addEventListener("resize", handleResize);
  }, [trackingEnabled]);

  return (
    <section aria-label="Viewport tracker">
      <button
        type="button"
        aria-label="Enable viewport tracking"
        onClick={() => setTrackingEnabled(true)}
      >
        Enable tracking
      </button>
      <ViewportStatus enabled={trackingEnabled} />
    </section>
  );
}

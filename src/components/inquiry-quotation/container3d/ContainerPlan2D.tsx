import React from 'react';

/** True when this browser can create a WebGL context. The 2D plan stays as the fallback. */
export function canUseWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The previous flat plan is kept in VipContainerVisualizer and rendered when
 * canUseWebGL() is false. This marker component exists so the fallback path
 * has a named home next to the 3D scene.
 */
export function ContainerPlan2D({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

export type ContainerViewPreset = 'perspective' | 'top' | 'side' | 'door';

export const CONTAINER_VIEW_PRESETS: Array<{ id: ContainerViewPreset; label: string }> = [
  { id: 'perspective', label: '3D Isometric' },
  { id: 'top', label: 'Top-Down Plan' },
  { id: 'side', label: 'Side View' },
  { id: 'door', label: 'Door Elevation' },
];

export function cameraPresetPose(
  preset: ContainerViewPreset,
  lengthM: number,
  widthM: number,
  heightM: number
): { position: [number, number, number]; target: [number, number, number] } {
  const target: [number, number, number] = [lengthM / 2, heightM * 0.35, widthM / 2];
  const span = Math.max(lengthM, widthM, 4);
  if (preset === 'top') {
    return { position: [lengthM / 2, span * 1.35, widthM / 2 + 0.02], target: [lengthM / 2, 0, widthM / 2] };
  }
  if (preset === 'side') {
    return { position: [lengthM / 2, heightM * 0.85, -span * 0.85], target };
  }
  if (preset === 'door') {
    return { position: [lengthM + span * 0.45, heightM * 0.75, widthM / 2], target };
  }
  return { position: [lengthM * 0.72, heightM * 1.35, -widthM * 1.35], target };
}

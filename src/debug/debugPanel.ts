import GUI from 'lil-gui';
import { tuning, tuningMeta, resetTuning } from '../config/tuning';

/**
 * lil-gui panel bound directly to the live tuning object. Toggle with the
 * backtick key. Edits apply on the next simulation tick.
 */
export class DebugPanel {
  private gui: GUI | null = null;
  visible = false;
  extra: Record<string, unknown> = {};

  constructor(private readonly onExtras?: (gui: GUI) => void) {}

  private build(): void {
    const gui = new GUI({ title: 'SKYTHREAD tuning (`)', width: 320 });
    gui.domElement.style.zIndex = '50';
    const groups = tuning as unknown as Record<string, Record<string, number>>;
    for (const group of Object.keys(groups)) {
      let folder: GUI | null = null;
      for (const key of Object.keys(groups[group]!)) {
        const meta = tuningMeta[`${group}.${key}`];
        if (!meta) continue;
        if (!folder) {
          folder = gui.addFolder(group);
          folder.close();
        }
        folder.add(groups[group]!, key, meta[0], meta[1], meta[2]);
      }
    }
    gui.add({ reset: () => { resetTuning(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); } }, 'reset').name('Reset to defaults');
    this.onExtras?.(gui);
    this.gui = gui;
  }

  toggle(): void {
    this.visible = !this.visible;
    if (this.visible && !this.gui) this.build();
    if (this.gui) this.gui.domElement.style.display = this.visible ? '' : 'none';
  }

  refresh(): void {
    this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  }
}

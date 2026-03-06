import { describe, expect, it } from 'vitest';
import { SIDEBAR_SURFACE_CLASSNAME } from './sidebarSurface';

describe('SIDEBAR_SURFACE_CLASSNAME', () => {
  it('keeps the glass surface but removes decorative edge glow', () => {
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('bg-background/55');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('backdrop-blur-md');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('after:');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('hover:bg-background/60');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('hover:border-border/70');
  });
});

// Minimal typings for pino-roll 4 (ships without types).
declare module 'pino-roll' {
  import type { SonicBoom } from 'sonic-boom';

  interface PinoRollOptions {
    file: string | (() => string);
    size?: string | number;
    frequency?: 'daily' | 'hourly' | number;
    extension?: string;
    dateFormat?: string;
    limit?: { count?: number; removeOtherLogFiles?: boolean };
    symlink?: boolean;
    mkdir?: boolean;
    sync?: boolean;
  }

  export default function roll(options: PinoRollOptions): Promise<SonicBoom>;
}

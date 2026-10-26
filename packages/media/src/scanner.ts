/** Malware scanning port (ADR-029). ClamAV adapter arrives in I47; until then the no-op scanner. */
export interface ScanResult {
  verdict: 'clean' | 'infected' | 'error';
  engine: string;
  signature?: string;
}

export interface Scanner {
  scan(buffer: Buffer): Promise<ScanResult>;
}

export class NoopScanner implements Scanner {
  scan(): Promise<ScanResult> {
    return Promise.resolve({ verdict: 'clean', engine: 'none' });
  }
}

/** Test scanner: flags the EICAR test string, like a real engine would. */
export class EicarTestScanner implements Scanner {
  scan(buffer: Buffer): Promise<ScanResult> {
    const infected = buffer.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
    return Promise.resolve(
      infected
        ? { verdict: 'infected', engine: 'eicar-test', signature: 'EICAR-Test-File' }
        : { verdict: 'clean', engine: 'eicar-test' },
    );
  }
}

export function createScanner(kind: 'none' | 'eicar-test'): Scanner {
  return kind === 'eicar-test' ? new EicarTestScanner() : new NoopScanner();
}

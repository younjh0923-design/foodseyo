interface ValidationSummary {
  readonly name: string;
  readonly assertionCount: number;
}

const summaries: ValidationSummary[] = [];

export function createValidationSuite(name: string, failurePrefix: string) {
  let assertionCount = 0;

  const verify = (condition: boolean, label: string): void => {
    if (!condition) throw new Error(`${failurePrefix}: ${label}`);
    assertionCount += 1;
  };

  const report = (details = ""): number => {
    summaries.push({ name, assertionCount });
    console.log(`${name}: ${assertionCount} checks passed${details}.`);
    return assertionCount;
  };

  return { verify, report } as const;
}

export function reportValidationTotal(name: string): number {
  const assertionCount = summaries.reduce(
    (total, summary) => total + summary.assertionCount,
    0,
  );
  console.log(`${name}: ${assertionCount} assertions passed.`);
  return assertionCount;
}

export async function captureError(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
    return null;
  } catch (error) {
    return error;
  }
}

export function installNetworkGuard(message: string) {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  let restored = false;

  globalThis.fetch = (() => {
    callCount += 1;
    throw new Error(message);
  }) as typeof fetch;

  return {
    get callCount() {
      return callCount;
    },
    restore() {
      if (restored) return;
      globalThis.fetch = originalFetch;
      restored = true;
    },
  } as const;
}

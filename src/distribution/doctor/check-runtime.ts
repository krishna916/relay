import type { DoctorCheck } from './doctor-types.js';

export function createRuntimeVersionCheck(input: {
  readonly nodeVersion: string;
  readonly expectedMajor: 24;
}): DoctorCheck {
  return {
    id: 'runtime.version',
    run: async () => {
      const major = Number(/^([0-9]+)/.exec(input.nodeVersion)?.[1]);
      if (major !== input.expectedMajor) {
        return {
          status: 'failure',
          code: 'runtime.version.unsupported',
          message: 'Relay requires Node.js 24.x.',
          details: { detectedMajor: Number.isFinite(major) ? major : 'unknown', requiredMajor: 24 },
        };
      }
      return {
        status: 'healthy',
        code: 'runtime.version.supported',
        message: 'The Node.js runtime is supported.',
        details: { nodeVersion: input.nodeVersion },
      };
    },
  };
}

export function createRuntimePlatformCheck(input: {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly report: { readonly glibc?: string };
}): DoctorCheck {
  return {
    id: 'runtime.platform',
    run: async () => {
      const supported =
        (input.platform === 'win32' && input.arch === 'x64') ||
        (input.platform === 'darwin' && input.arch === 'arm64') ||
        (input.platform === 'linux' && input.arch === 'x64' && input.report.glibc !== undefined);
      if (!supported) {
        return {
          status: 'failure',
          code: 'runtime.platform.unsupported',
          message: 'Relay supports Windows x64, macOS arm64, and Linux x64 with glibc.',
          details: {
            platform: input.platform,
            architecture: input.arch,
            glibc: input.report.glibc ?? 'none',
          },
        };
      }
      return {
        status: 'healthy',
        code: 'runtime.platform.supported',
        message: 'The operating system and architecture are supported.',
        details: {
          platform: input.platform,
          architecture: input.arch,
          ...(input.report.glibc === undefined ? {} : { glibc: input.report.glibc }),
        },
      };
    },
  };
}

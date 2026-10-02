type StartupDiagnostic = {
  stage:
    | 'layout_module_loaded'
    | 'error_handler_unavailable'
    | 'root_mounted'
    | 'fonts_loaded'
    | 'font_error'
    | 'uncaught_js_error'
    | 'react_error_boundary';
  name?: string;
  message?: string;
  stack?: string;
  isFatal?: boolean;
};

type RuntimeErrorHandler = (error: unknown, isFatal?: boolean) => void;
type RuntimeErrorUtils = {
  getGlobalHandler: () => RuntimeErrorHandler | undefined;
  setGlobalHandler: (handler: RuntimeErrorHandler) => void;
};

const endpoint = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/__diagnostics/startup`
  : null;

let handlerInstalled = false;

function limitedText(value: string | undefined, limit: number): string | undefined {
  return value?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').slice(0, limit);
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: limitedText(error.name, 100),
      message: limitedText(error.message, 500),
      stack: limitedText(error.stack, 2000),
    };
  }

  let message: string;
  try {
    message = String(error);
  } catch {
    message = 'Unprintable JavaScript error';
  }
  return { name: typeof error, message: limitedText(message, 500) };
}

export function reportStartupDiagnostic(diagnostic: StartupDiagnostic): void {
  if (!endpoint) return;

  const payload = {
    ...diagnostic,
    name: limitedText(diagnostic.name, 100),
    message: limitedText(diagnostic.message, 500),
    stack: limitedText(diagnostic.stack, 2000),
  };

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Diagnostics must never block or change app startup.
  });
}

export function installAndroidStartupDiagnostics(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;

  const runtime = globalThis as typeof globalThis & {
    ErrorUtils?: RuntimeErrorUtils;
  };
  const errorUtils = runtime.ErrorUtils;

  if (!errorUtils?.getGlobalHandler || !errorUtils.setGlobalHandler) {
    reportStartupDiagnostic({ stage: 'error_handler_unavailable' });
    reportStartupDiagnostic({ stage: 'layout_module_loaded' });
    return;
  }

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportStartupDiagnostic({
      stage: 'uncaught_js_error',
      ...getErrorDetails(error),
      isFatal: isFatal === true,
    });
    previousHandler?.(error, isFatal);
  });

  reportStartupDiagnostic({ stage: 'layout_module_loaded' });
}
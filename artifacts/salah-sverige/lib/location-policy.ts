type Permission = { granted: boolean; canAskAgain: boolean };

export function automaticLocationAction(
  mode: 'automatic' | 'manual',
  permission: Permission | null,
  cacheReady: boolean,
  alreadyStarted: boolean,
  isWeb: boolean,
): 'wait' | 'locate' {
  if (mode !== 'automatic' || !permission || !cacheReady || alreadyStarted) return 'wait';
  if (!permission.granted && isWeb) return 'wait';
  return 'locate';
}

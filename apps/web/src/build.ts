/**
 * The version stamp: the short commit hash and the deploy date, injected by the
 * Pages workflow through VITE_COMMIT and VITE_DEPLOYED. A local build reads "dev".
 */
export const BUILD = {
  commit: import.meta.env.VITE_COMMIT || 'dev',
  deployed: import.meta.env.VITE_DEPLOYED || '',
}

export function buildStamp(): string {
  return BUILD.deployed ? `Build ${BUILD.commit} · ${BUILD.deployed}` : `Build ${BUILD.commit}`
}

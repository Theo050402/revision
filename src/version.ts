// Version de l'app (commit court), injectée au build : permet de vérifier sur l'iPad que la mise à jour est chargée.
declare const __VERSION_APP__: string | undefined

export const VERSION_APP: string = typeof __VERSION_APP__ === 'string' ? __VERSION_APP__ : 'dev'

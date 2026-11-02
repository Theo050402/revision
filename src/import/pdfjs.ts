// Point d'entrée unique de pdf.js pour l'app.
// Version « legacy » : la version moderne appelle sans vérification des API JavaScript très récentes
// (Promise.try, URL.parse, Math.sumPrecise, Map.getOrInsertComputed…) absentes du Safari d'un iPad
// qui n'est pas à jour, et l'import échouait. La version legacy embarque leurs équivalents.
export * from 'pdfjs-dist/legacy/build/pdf.mjs'

// pdf.js parcourt aussi des flux avec `for await (… of readableStream)` (page.getTextContent()), ce que la version
// legacy ne complète pas. Safari sous iPadOS 26.5 ne sait pas itérer un ReadableStream : l'import y échouait avec
// « undefined is not a function (near '…e of t…') ». On ajoute cette itération si elle manque.
type FluxIterable = ReadableStream & { values?: unknown; [Symbol.asyncIterator]?: unknown }

if (typeof ReadableStream !== 'undefined') {
  const proto = ReadableStream.prototype as FluxIterable
  if (typeof proto[Symbol.asyncIterator] !== 'function') {
    const values = async function* (this: ReadableStream, options?: { preventCancel?: boolean }) {
      const lecteur = this.getReader()
      let fini = false
      try {
        while (true) {
          const { done, value } = await lecteur.read()
          if (done) {
            fini = true
            return
          }
          yield value
        }
      } finally {
        // Sortie anticipée (break, return, exception) : on annule le flux, sauf demande contraire (spec WHATWG).
        if (!fini && !options?.preventCancel) await lecteur.cancel()
        lecteur.releaseLock()
      }
    }
    Object.defineProperty(proto, 'values', { value: values, writable: true, configurable: true })
    Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true })
  }
}

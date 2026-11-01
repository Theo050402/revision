// Point d'entrée unique de pdf.js pour l'app.
// Version « legacy » : la version moderne appelle sans vérification des API JavaScript très récentes
// (Promise.try, URL.parse, Math.sumPrecise, Map.getOrInsertComputed…) absentes du Safari d'un iPad
// qui n'est pas à jour, et l'import échouait. La version legacy embarque leurs équivalents.
export * from 'pdfjs-dist/legacy/build/pdf.mjs'

import { useEffect, useState } from 'react'
import { TestExport } from './screens/TestExport'

export function App() {
  const [hash, setHash] = useState(() => location.hash)
  useEffect(() => {
    const maj = () => setHash(location.hash)
    window.addEventListener('hashchange', maj)
    return () => window.removeEventListener('hashchange', maj)
  }, [])

  if (hash === '#test-export') return <TestExport />
  return <h1>Révisions</h1>
}

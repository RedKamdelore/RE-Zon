import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('loading...')

  useEffect(() => {
    if (!window.api) {
      setStatus('no api')
      return
    }
    window.api
      .loadData()
      .then((d) => setStatus(`API OK, volume: ${d.volume}`))
      .catch((e) => setStatus(`API error: ${String(e)}`))
  }, [])

  return (
    <div>
      <h1>Player_DXD</h1>
      <p>{status}</p>
    </div>
  )
}

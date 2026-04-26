import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function QRScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)

  useEffect(() => {
    const html5QrCode = new Html5Qrcode('qr-reader')
    scannerRef.current = html5QrCode

    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        onScan(decodedText)
        html5QrCode.stop()
      },
      () => {}
    ).catch(() => {})

    return () => {
      html5QrCode.stop().catch(() => {})
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6">
      <p className="text-white text-lg font-semibold mb-4">Scan Item QR Code</p>
      <div id="qr-reader" className="w-full max-w-sm rounded-xl overflow-hidden" />
      <button
        onClick={onClose}
        className="mt-6 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}
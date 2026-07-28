import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

interface BarcodeDisplayProps {
  value: string
  width?: number
  height?: number
}

export function BarcodeDisplay({ value, width = 2, height = 50 }: BarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !value) return
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue: true,
        fontSize: 13,
        margin: 8,
        background: 'transparent',
        lineColor: '#0F172A',
      })
    } catch {
      // Invalid barcode value (e.g. mid-edit) — leave the SVG empty rather than crash.
    }
  }, [value, width, height])

  if (!value) return <p className="text-xs text-ink-500">No barcode set.</p>

  return <svg ref={svgRef} role="img" aria-label={`Barcode ${value}`} />
}

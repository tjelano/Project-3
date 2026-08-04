import * as THREE from 'three'

/**
 * Canvas2D-rasterized text labels — deliberately NOT troika-three-text /
 * drei's <Text>. That pipeline needs WebGL to generate glyph SDFs, and on
 * Brave (WebGL extension ANGLE_instanced_arrays reported unsupported) it
 * throws an uncaught promise rejection that broke the whole board: not just
 * in its GPU path, but also in its own "safe" JS-worker fallback, which
 * still ends with an unguarded WebGL call to composite the result into the
 * glyph atlas (troika-three-text's SDFGenerator.js, generateSDF_JS_Worker).
 * There's no prop that avoids it — both paths touch WebGL.
 *
 * An ordinary 2D canvas context never touches WebGL at all, so this can't
 * hit that failure mode by construction, on any browser.
 */

interface LabelOptions {
  fontPx?: number
  fontWeight?: number | string
  fontFamily?: string
  color: string
  outlineColor?: string
  outlineWidthPx?: number
  paddingPx?: number
}

interface LabelTexture {
  texture: THREE.CanvasTexture
  /** Canvas pixel size of the rasterized text, tight around its own ink. */
  width: number
  height: number
  /** The fontPx this was rendered at, so callers can derive a world scale. */
  fontPx: number
}

const DEFAULT_FONT_FAMILY = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

const cache = new Map<string, LabelTexture>()

export function createLabelTexture(text: string, options: LabelOptions): LabelTexture {
  const {
    fontPx = 96,
    fontWeight = 700,
    fontFamily = DEFAULT_FONT_FAMILY,
    color,
    outlineColor,
    outlineWidthPx = 0,
    paddingPx = fontPx * 0.18,
  } = options

  const key = [text, fontPx, fontWeight, fontFamily, color, outlineColor, outlineWidthPx, paddingPx].join('|')
  const cached = cache.get(key)
  if (cached) return cached

  const font = `${fontWeight} ${fontPx}px ${fontFamily}`

  // Measure on a throwaway context first, so the real canvas is sized
  // tightly around the text instead of guessing a fixed box.
  const measurer = document.createElement('canvas').getContext('2d')!
  measurer.font = font
  const textWidth = measurer.measureText(text).width
  const textHeight = fontPx // cap-height approximation; padding covers descenders

  const width = Math.ceil(textWidth + paddingPx * 2 + outlineWidthPx * 2)
  const height = Math.ceil(textHeight + paddingPx * 2 + outlineWidthPx * 2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const cx = width / 2
  const cy = height / 2

  if (outlineColor && outlineWidthPx > 0) {
    ctx.lineWidth = outlineWidthPx * 2
    ctx.lineJoin = 'round'
    ctx.strokeStyle = outlineColor
    ctx.strokeText(text, cx, cy)
  }
  ctx.fillStyle = color
  ctx.fillText(text, cx, cy)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true

  const result: LabelTexture = { texture, width, height, fontPx }
  cache.set(key, result)
  return result
}
